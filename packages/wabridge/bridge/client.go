// Package bridge contains the internal implementation of the WhatsApp bridge.
package bridge

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"sync"
	"time"

	_ "github.com/mattn/go-sqlite3"
	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/proto/waHistorySync"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"
)

// MessageCallback is the internal interface for delivering messages.
type MessageCallback interface {
	OnMessage(jsonPayload string)
}

// Client wraps a whatsmeow client.
type Client struct {
	dbPath  string
	store   *Store
	waStore *sqlstore.Container

	// pairingClient is held open after StartPairing returns the code.
	// WhatsApp needs the WebSocket connection to remain alive so it can
	// send the PairSuccess event back when the user enters the code.
	// IsLinked() checks whether pairing completed and cleans it up.
	pairingClient *whatsmeow.Client
	pairingMu     sync.Mutex
}

// NewClient creates a new Client using the given dbPath for the whatsmeow SQLite device store.
func NewClient(dbPath string, store *Store) (*Client, error) {
	logger := waLog.Stdout("wabridge", "WARN", true)
	ctx := context.Background()

	// Open the raw DB first so we can apply PRAGMA foreign_keys = ON before
	// sqlstore.Upgrade() runs (it returns an error if FK are not enabled).
	// We do NOT use a "file:..." URI here: go-sqlite3 on Android gomobile builds
	// may not have SQLITE_OPEN_URI compiled in, so "file:/path?..." is treated
	// as a literal filename that doesn't exist.
	rawDB, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open sqlite db: %w", err)
	}
	rawDB.SetMaxOpenConns(1)
	if _, err = rawDB.ExecContext(ctx, "PRAGMA foreign_keys = ON"); err != nil {
		_ = rawDB.Close()
		return nil, fmt.Errorf("failed to enable foreign keys: %w", err)
	}

	container := sqlstore.NewWithDB(rawDB, "sqlite3", logger)
	if err = container.Upgrade(ctx); err != nil {
		_ = rawDB.Close()
		return nil, fmt.Errorf("failed to upgrade whatsmeow store: %w", err)
	}
	return &Client{
		dbPath:  dbPath,
		store:   store,
		waStore: container,
	}, nil
}

// IsLinked returns true if there is at least one device stored.
// It also checks whether an in-progress pairing has completed: whatsmeow
// sets client.Store.ID once WhatsApp delivers the PairSuccess event.
// When pairing completes, the pairing connection is disconnected and released.
func (c *Client) IsLinked() bool {
	c.pairingMu.Lock()
	if c.pairingClient != nil {
		if c.pairingClient.Store.ID != nil {
			// Pairing succeeded — WhatsApp saved credentials to the DB.
			c.pairingClient.Disconnect()
			c.pairingClient = nil
			c.pairingMu.Unlock()
			return true
		}
		c.pairingMu.Unlock()
		return false
	}
	c.pairingMu.Unlock()

	ctx := context.Background()
	devices, err := c.waStore.GetAllDevices(ctx)
	if err != nil {
		return false
	}
	return len(devices) > 0
}

// StartPairing initiates a phone-number pairing flow.
// phoneNumber should be in E.164 format (with or without leading +).
//
// IMPORTANT: this function returns the pairing code but does NOT disconnect.
// The WebSocket connection must stay alive so WhatsApp can deliver the
// PairSuccess event when the user enters the code on their phone.
// Call IsLinked() to poll for completion; it cleans up the connection once
// WhatsApp confirms the link (client.Store.ID is set by whatsmeow).
func (c *Client) StartPairing(phoneNumber string) (string, error) {
	// Strip leading + — whatsmeow PairPhone does not accept it
	phone := strings.TrimPrefix(phoneNumber, "+")

	ctx := context.Background()
	deviceStore, err := c.waStore.GetFirstDevice(ctx)
	if err != nil || deviceStore == nil {
		deviceStore = c.waStore.NewDevice()
	}

	logger := waLog.Stdout("wabridge-client", "WARN", true)
	client := whatsmeow.NewClient(deviceStore, logger)

	if err := client.Connect(); err != nil {
		return "", fmt.Errorf("failed to connect for pairing: %w", err)
	}

	code, err := client.PairPhone(ctx, phone, true, whatsmeow.PairClientChrome, "Chrome (Linux)")
	if err != nil {
		client.Disconnect()
		return "", fmt.Errorf("failed to pair phone: %w", err)
	}

	// Keep the connection alive — WhatsApp will send PairSuccess over this socket.
	c.pairingMu.Lock()
	if c.pairingClient != nil {
		c.pairingClient.Disconnect() // clean up any stale previous attempt
	}
	c.pairingClient = client
	c.pairingMu.Unlock()

	return code, nil
}

// SyncHistory connects to WhatsApp, collects the HistorySync messages delivered
// on first connection, runs AI triage against all saved filters, and disconnects.
// Matched messages are persisted and delivered via callback.
// Returns the number of messages processed (across all conversations).
func (c *Client) SyncHistory(store *Store, claudeApiKey string, callback MessageCallback) (int, error) {
	ctx := context.Background()
	deviceStore, err := c.waStore.GetFirstDevice(ctx)
	if err != nil || deviceStore == nil {
		return 0, fmt.Errorf("no linked device found — call StartPairing first")
	}

	logger := waLog.Stdout("wabridge-history", "WARN", true)
	wac := whatsmeow.NewClient(deviceStore, logger)

	type rawMsg struct {
		msgID      string
		senderJID  string
		chatJID    string
		chatName   string
		senderName string
		body       string
		timestamp  int64
	}
	var mu sync.Mutex
	collected := make([]rawMsg, 0, 512)

	// done is closed when WhatsApp signals progress=100 (sync complete).
	done := make(chan struct{}, 1)
	var doneOnce sync.Once

	wac.AddEventHandler(func(evt interface{}) {
		v, ok := evt.(*events.HistorySync)
		if !ok {
			return
		}

		syncType := v.Data.GetSyncType()
		// Only process message-bearing sync types.
		if syncType != waHistorySync.HistorySync_INITIAL_BOOTSTRAP &&
			syncType != waHistorySync.HistorySync_FULL &&
			syncType != waHistorySync.HistorySync_RECENT {
			return
		}

		for _, conv := range v.Data.GetConversations() {
			chatJID := conv.GetID()
			chatName := conv.GetName()
			if chatName == "" {
				chatName = chatJID
			}
			for _, histMsg := range conv.GetMessages() {
				webMsg := histMsg.GetMessage()
				if webMsg == nil {
					continue
				}
				key := webMsg.GetKey()
				if key.GetFromMe() {
					continue
				}
				body := extractBodyFromMsg(webMsg.GetMessage())
				if body == "" {
					continue
				}
				senderJID := key.GetParticipant()
				if senderJID == "" {
					senderJID = chatJID
				}
				senderName := webMsg.GetPushName()
				if senderName == "" {
					senderName = senderJID
				}
				mu.Lock()
				collected = append(collected, rawMsg{
					msgID:      key.GetID(),
					senderJID:  senderJID,
					chatJID:    chatJID,
					chatName:   chatName,
					senderName: senderName,
					body:       body,
					timestamp:  int64(webMsg.GetMessageTimestamp()),
				})
				mu.Unlock()
			}
		}

		if v.Data.GetProgress() >= 100 {
			doneOnce.Do(func() { close(done) })
		}
	})

	if err := wac.Connect(); err != nil {
		return 0, fmt.Errorf("failed to connect for history sync: %w", err)
	}
	defer wac.Disconnect()

	// Wait until WhatsApp signals progress=100 or 45-second timeout.
	select {
	case <-done:
	case <-time.After(45 * time.Second):
	}
	wac.Disconnect() // stop event handler before reading collected

	// Always persist raw messages so they can be triaged against future filters.
	for _, msg := range collected {
		_ = store.SaveRawMessage(RawMessage{
			MessageID:  msg.msgID,
			SenderJID:  msg.senderJID,
			ChatJID:    msg.chatJID,
			ChatName:   msg.chatName,
			SenderName: msg.senderName,
			Body:       msg.body,
			ReceivedAt: msg.timestamp,
		})
	}

	if len(collected) == 0 {
		return 0, nil
	}

	// Triage against any filters that already exist (e.g. the default "All Messages" filter).
	filters, err := store.listFilters()
	if err != nil {
		return len(collected), fmt.Errorf("failed to load filters: %w", err)
	}

	triage := NewTriageClient(claudeApiKey, "")
	for _, f := range filters {
		msgs, ferr := store.GetRawMessagesForFilter(f.ID)
		if ferr != nil {
			continue
		}
		for _, msg := range msgs {
			matched, reason, confidence, triageErr := triage.TriageMessage(msg.Body, f.Prompt)
			if triageErr != nil {
				continue
			}
			if matched {
				matchJSON, saveErr := store.SaveMatch(SaveMatchParams{
					FilterID:        f.ID,
					MessageID:       msg.MessageID,
					SenderJID:       msg.SenderJID,
					ChatJID:         msg.ChatJID,
					ChatName:        msg.ChatName,
					SenderName:      msg.SenderName,
					Body:            msg.Body,
					ReceivedAt:      msg.ReceivedAt,
					RelevanceReason: reason,
					Confidence:      confidence,
				})
				if saveErr == nil && callback != nil {
					callback.OnMessage(matchJSON)
				}
			}
		}
	}

	return len(collected), nil
}

// TriageStoredMessages runs a filter against all raw messages that haven't been
// matched yet. Called when a new filter is created so users immediately see
// historical messages that match it.
func (c *Client) TriageStoredMessages(filterID string, store *Store, claudeApiKey string, callback MessageCallback) (int, error) {
	filter, err := store.getFilter(filterID)
	if err != nil {
		return 0, fmt.Errorf("filter not found: %w", err)
	}

	msgs, err := store.GetRawMessagesForFilter(filterID)
	if err != nil {
		return 0, fmt.Errorf("failed to load raw messages: %w", err)
	}
	if len(msgs) == 0 {
		return 0, nil
	}

	triage := NewTriageClient(claudeApiKey, "")
	matched := 0
	for _, msg := range msgs {
		ok, reason, confidence, triageErr := triage.TriageMessage(msg.Body, filter.Prompt)
		if triageErr != nil {
			continue
		}
		if ok {
			matchJSON, saveErr := store.SaveMatch(SaveMatchParams{
				FilterID:        filter.ID,
				MessageID:       msg.MessageID,
				SenderJID:       msg.SenderJID,
				ChatJID:         msg.ChatJID,
				ChatName:        msg.ChatName,
				SenderName:      msg.SenderName,
				Body:            msg.Body,
				ReceivedAt:      msg.ReceivedAt,
				RelevanceReason: reason,
				Confidence:      confidence,
			})
			if saveErr == nil {
				matched++
				if callback != nil {
					callback.OnMessage(matchJSON)
				}
			}
		}
	}
	return matched, nil
}

// SyncAndTriage connects to WhatsApp, collects messages, runs AI triage, then disconnects.
// It returns the number of messages that were processed (not just matched).
func (c *Client) SyncAndTriage(lastSyncTimestamp int64, store *Store, claudeApiKey string, callback MessageCallback) (int, error) {
	ctx := context.Background()
	deviceStore, err := c.waStore.GetFirstDevice(ctx)
	if err != nil || deviceStore == nil {
		return 0, fmt.Errorf("no linked device found — call StartPairing first")
	}

	logger := waLog.Stdout("wabridge-sync", "WARN", true)
	wac := whatsmeow.NewClient(deviceStore, logger)

	// Collect messages from the event handler goroutine into a mutex-protected slice.
	type rawMsg struct {
		msgID     string
		senderJID string
		chatJID   string
		body      string
		timestamp int64
	}
	var mu sync.Mutex
	collected := make([]rawMsg, 0, 64)

	wac.AddEventHandler(func(evt interface{}) {
		v, ok := evt.(*events.Message)
		if !ok {
			return
		}
		if v.Info.IsFromMe {
			return
		}
		if v.Message == nil {
			return
		}
		// Filter out protocol messages
		if v.Message.GetProtocolMessage() != nil {
			return
		}
		body := extractBodyFromMsg(v.Message)
		if body == "" {
			return
		}
		ts := v.Info.Timestamp.Unix()
		if ts <= lastSyncTimestamp {
			return
		}
		mu.Lock()
		collected = append(collected, rawMsg{
			msgID:     v.Info.ID,
			senderJID: v.Info.Sender.String(),
			chatJID:   v.Info.Chat.String(),
			body:      body,
			timestamp: ts,
		})
		mu.Unlock()
	})

	if err := wac.Connect(); err != nil {
		return 0, fmt.Errorf("failed to connect: %w", err)
	}
	defer wac.Disconnect()

	// Wait up to 30 seconds for history sync / live messages, then disconnect
	// so the event handler is stopped before we read `collected`.
	syncCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	<-syncCtx.Done()
	wac.Disconnect() // explicit disconnect stops event handler before we read collected

	if len(collected) == 0 {
		return 0, nil
	}

	// Load all filters
	filters, err := store.listFilters()
	if err != nil {
		return len(collected), fmt.Errorf("failed to load filters: %w", err)
	}

	triage := NewTriageClient(claudeApiKey, "")

	for _, msg := range collected {
		for _, f := range filters {
			matched, reason, confidence, err := triage.TriageMessage(msg.body, f.Prompt)
			if err != nil {
				// Skip on error but continue
				continue
			}
			if matched {
				matchJSON, saveErr := store.SaveMatch(SaveMatchParams{
					FilterID:        f.ID,
					MessageID:       msg.msgID,
					SenderJID:       msg.senderJID,
					ChatJID:         msg.chatJID,
					ChatName:        msg.chatJID, // best effort; whatsmeow pushgroups fill this later
					SenderName:      msg.senderJID,
					Body:            msg.body,
					ReceivedAt:      msg.timestamp,
					RelevanceReason: reason,
					Confidence:      confidence,
				})
				if saveErr == nil && callback != nil {
					callback.OnMessage(matchJSON)
				}
			}
		}
	}

	return len(collected), nil
}

// Unlink removes the stored device (logout).
func (c *Client) Unlink() error {
	ctx := context.Background()
	deviceStore, err := c.waStore.GetFirstDevice(ctx)
	if err != nil || deviceStore == nil {
		return nil // nothing to unlink
	}
	logger := waLog.Stdout("wabridge-unlink", "WARN", true)
	wac := whatsmeow.NewClient(deviceStore, logger)
	if err := wac.Connect(); err == nil {
		logoutCtx := context.Background()
		wac.Logout(logoutCtx)
		wac.Disconnect()
	}
	return deviceStore.Delete(ctx)
}

// extractBodyFromMsg pulls the text body out of a WhatsApp message proto.
// Accepts the inner *waE2E.Message type shared by both live events and history sync.
func extractBodyFromMsg(msg *waE2E.Message) string {
	if msg == nil {
		return ""
	}
	if c := msg.GetConversation(); c != "" {
		return c
	}
	if ext := msg.GetExtendedTextMessage(); ext != nil {
		return ext.GetText()
	}
	if img := msg.GetImageMessage(); img != nil {
		return img.GetCaption()
	}
	if vid := msg.GetVideoMessage(); vid != nil {
		return vid.GetCaption()
	}
	return ""
}

// extractBody is kept for compatibility with the existing SyncAndTriage call site.
func extractBody(evt *events.Message) string {
	return extractBodyFromMsg(evt.Message)
}
