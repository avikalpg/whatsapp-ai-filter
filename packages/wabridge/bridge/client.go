// Package bridge contains the internal implementation of the WhatsApp bridge.
package bridge

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	_ "github.com/mattn/go-sqlite3"
	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/appstate"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/proto/waHistorySync"
	waStore "go.mau.fi/whatsmeow/store"
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

	// pairingClient is kept alive after StartPairing() returns the pairing code.
	// WhatsApp needs this WebSocket to deliver PairSuccess AND the subsequent
	// INITIAL_BOOTSTRAP HistorySync events (first 90 days of messages).
	//
	// The HistorySync handler is registered on this client in StartPairing() so
	// messages are captured on the correct (first) connection.
	// SyncHistory() waits for historyCh to be signalled, then triages raw messages.
	pairingClient *whatsmeow.Client
	pairingMu     sync.Mutex

	// historyCh is closed when the pairingClient has finished receiving
	// HistorySync events (progress=100) or the 60-second timeout fires.
	historyCh   chan struct{}
	historyOnce sync.Once
}

// NewClient creates a new Client using the given dbPath for the whatsmeow SQLite device store.
func NewClient(dbPath string, store *Store) (*Client, error) {
	logger := waLog.Stdout("wabridge", "WARN", true)
	ctx := context.Background()

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
	waStore.SetOSInfo("WACI", [3]uint32{1, 0, 0})
	return &Client{
		dbPath:    dbPath,
		store:     store,
		waStore:   container,
		historyCh: make(chan struct{}),
	}, nil
}

// StartPairing initiates a phone-number pairing flow.
// phoneNumber should be in E.164 format (with or without leading +).
//
// The connection is kept alive after this returns so WhatsApp can deliver:
//  1. PairSuccess — signals that the user entered the code
//  2. HistorySync (INITIAL_BOOTSTRAP) — the last ~90 days of messages
//
// HistorySync events are saved directly to waci_raw_messages on this connection,
// because WhatsApp only sends INITIAL_BOOTSTRAP once, on the very first connection
// after pairing. A second connection gets only RECENT (last ~30 messages).
//
// Call IsLinked() to poll for pairing completion.
// Call SyncHistory() to wait for HistorySync to finish and run filter triage.
func (c *Client) StartPairing(phoneNumber string) (string, error) {
	// Strip all non-digit characters from phone number (WhatsApp expects digits only)
	phone := strings.TrimPrefix(phoneNumber, "+")
	phone = strings.ReplaceAll(phone, "-", "")
	phone = strings.ReplaceAll(phone, " ", "")
	phone = strings.ReplaceAll(phone, "(", "")
	phone = strings.ReplaceAll(phone, ")", "")

	ctx := context.Background()
	deviceStore, err := c.waStore.GetFirstDevice(ctx)
	if err != nil || deviceStore == nil {
		deviceStore = c.waStore.NewDevice()
	}

	logger := waLog.Stdout("wabridge-client", "WARN", true)
	client := whatsmeow.NewClient(deviceStore, logger)
	deviceStore.Contacts = c.store

	// Register Contact handler for app state sync
	client.AddEventHandler(func(evt interface{}) {
		contactEvt, ok := evt.(*events.Contact)
		if !ok || contactEvt.Action == nil {
			return
		}
		firstName := contactEvt.Action.GetFirstName()
		fullName := contactEvt.Action.GetFullName()
		if fullName == "" {
			fullName = firstName
		}
		_ = c.store.PutContactName(context.Background(), contactEvt.JID, fullName, firstName)
	})

	// Register HistorySync handler BEFORE connecting so no events are missed.
	// Messages are saved directly to waci_raw_messages as they arrive.
	client.AddEventHandler(func(evt interface{}) {
		v, ok := evt.(*events.HistorySync)
		if !ok {
			return
		}
		syncType := v.Data.GetSyncType()
		log.Printf("[WACI] HistorySync event: type=%v progress=%d conversations=%d",
			syncType, v.Data.GetProgress(), len(v.Data.GetConversations()))

		if syncType != waHistorySync.HistorySync_INITIAL_BOOTSTRAP &&
			syncType != waHistorySync.HistorySync_FULL &&
			syncType != waHistorySync.HistorySync_RECENT {
			log.Printf("[WACI] HistorySync: skipping sync type %v", syncType)
			return
		}
		savedCount := 0
		skippedCount := 0
		for _, conv := range v.Data.GetConversations() {
			chatJID := conv.GetID()
			chatName := conv.GetName()
			if chatName == "" {
				chatName = chatJID
			}
			for _, histMsg := range conv.GetMessages() {
				webMsg := histMsg.GetMessage()
				if webMsg == nil {
					skippedCount++
					continue
				}
				key := webMsg.GetKey()
				if key == nil || key.GetFromMe() {
					skippedCount++
					continue
				}
				body := extractBodyFromMsg(webMsg.GetMessage())
				if body == "" {
					skippedCount++
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
				if err := c.store.SaveRawMessage(RawMessage{
					MessageID:  key.GetID(),
					SenderJID:  senderJID,
					ChatJID:    chatJID,
					ChatName:   chatName,
					SenderName: senderName,
					Body:       body,
					ReceivedAt: int64(webMsg.GetMessageTimestamp()),
				}); err != nil {
					log.Printf("[WACI] HistorySync: failed to save message %s: %v", key.GetID(), err)
					skippedCount++
				} else {
					savedCount++
				}
			}
		}
		log.Printf("[WACI] HistorySync: saved=%d skipped=%d progress=%d",
			savedCount, skippedCount, v.Data.GetProgress())

		if v.Data.GetProgress() >= 100 {
			log.Printf("[WACI] HistorySync: progress=100, signalling completion")
			c.historyOnce.Do(func() { close(c.historyCh) })
		}
	})

	if err := client.Connect(); err != nil {
		return "", fmt.Errorf("failed to connect for pairing: %w", err)
	}

	code, err := client.PairPhone(ctx, phone, true, whatsmeow.PairClientChrome, "Chrome (Linux)")
	if err != nil {
		client.Disconnect()
		return "", fmt.Errorf("failed to pair phone: %w", err)
	}

	c.pairingMu.Lock()
	if c.pairingClient != nil {
		c.pairingClient.Disconnect()
	}
	c.pairingClient = client
	c.pairingMu.Unlock()

	return code, nil
}

// IsLinked returns true if there is a stored WhatsApp session.
//
// While pairing is in progress, it checks whether whatsmeow has set Store.ID
// (which happens on PairSuccess). NOTE: we intentionally do NOT disconnect
// the pairingClient here — it must stay alive to receive HistorySync events.
// SyncHistory() is responsible for disconnecting it after history is collected.
func (c *Client) IsLinked() bool {
	c.pairingMu.Lock()
	if c.pairingClient != nil {
		linked := c.pairingClient.Store.ID != nil
		c.pairingMu.Unlock()
		return linked
	}
	c.pairingMu.Unlock()

	ctx := context.Background()
	devices, err := c.waStore.GetAllDevices(ctx)
	if err != nil {
		return false
	}
	return len(devices) > 0
}

// SyncHistory waits for the pairingClient to finish receiving HistorySync events,
// then runs all saved filters against the accumulated raw messages.
//
// If the pairingClient is no longer available (e.g. app was restarted after pairing),
// it opens a fresh connection to catch any RECENT sync events and triages what's stored.
//
// After this call the pairingClient is disconnected and released.
// Returns (matchedCount, rawMessagesStored, error).
func (c *Client) SyncHistory(store *Store, claudeApiKey string, callback MessageCallback) (int, int, error) {
	c.pairingMu.Lock()
	pc := c.pairingClient
	c.pairingMu.Unlock()

	log.Printf("[WACI] SyncHistory: starting (hasPairingClient=%v)", pc != nil)

	// Fetch contacts from app state before processing history
	if pc != nil {
		ctx := context.Background()
		log.Printf("[WACI] SyncHistory: fetching app state contacts")
		_ = pc.FetchAppState(ctx, appstate.WAPatchRegularHigh, false, false)
		// Give contacts a moment to sync
		time.Sleep(2 * time.Second)
	}

	if pc != nil {
		// pairingClient is alive and has the HistorySync handler registered.
		// Wait for WhatsApp to finish delivering history (progress=100) or timeout.
		log.Printf("[WACI] SyncHistory: waiting for historyCh (up to 60s)")
		select {
		case <-c.historyCh:
			log.Printf("[WACI] SyncHistory: historyCh closed normally (progress=100 received)")
		case <-time.After(60 * time.Second):
			log.Printf("[WACI] SyncHistory: timed out waiting for progress=100, processing what arrived")
			c.historyOnce.Do(func() { close(c.historyCh) })
		}
		// Disconnect the pairingClient now that history is collected.
		c.pairingMu.Lock()
		if c.pairingClient != nil {
			c.pairingClient.Disconnect()
			c.pairingClient = nil
		}
		c.pairingMu.Unlock()
	} else {
		// No pairingClient (app restarted, or called a second time).
		// Open a fresh connection; WhatsApp will send RECENT sync on reconnect
		// which catches any messages since the last session.
		log.Printf("[WACI] SyncHistory: no pairingClient, opening fresh connection for RECENT sync")
		ctx := context.Background()
		deviceStore, err := c.waStore.GetFirstDevice(ctx)
		if err != nil || deviceStore == nil {
			log.Printf("[WACI] SyncHistory: no device found, triaging stored messages only")
			// No device — nothing to sync; just triage whatever is already stored.
			rawCount, _ := store.RawMessageCount()
			matched, triageErr := c.triageAllFilters(store, claudeApiKey, callback)
			return matched, rawCount, triageErr
		}
		logger := waLog.Stdout("wabridge-history", "WARN", true)
		wac := whatsmeow.NewClient(deviceStore, logger)

		recentDone := make(chan struct{}, 1)
		var recentOnce sync.Once
		wac.AddEventHandler(func(evt interface{}) {
			v, ok := evt.(*events.HistorySync)
			if !ok {
				return
			}
			syncType := v.Data.GetSyncType()
			if syncType != waHistorySync.HistorySync_RECENT &&
				syncType != waHistorySync.HistorySync_FULL {
				return
			}
			log.Printf("[WACI] SyncHistory(RECENT): type=%v progress=%d conversations=%d",
				syncType, v.Data.GetProgress(), len(v.Data.GetConversations()))
			savedCount := 0
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
					if key == nil || key.GetFromMe() {
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
					if err := store.SaveRawMessage(RawMessage{
						MessageID:  key.GetID(),
						SenderJID:  senderJID,
						ChatJID:    chatJID,
						ChatName:   chatName,
						SenderName: senderName,
						Body:       body,
						ReceivedAt: int64(webMsg.GetMessageTimestamp()),
					}); err == nil {
						savedCount++
					}
				}
			}
			log.Printf("[WACI] SyncHistory(RECENT): saved=%d", savedCount)
			if v.Data.GetProgress() >= 100 {
				log.Printf("[WACI] SyncHistory(RECENT): progress=100, done")
				recentOnce.Do(func() { close(recentDone) })
			}
		})
		if err := wac.Connect(); err == nil {
			log.Printf("[WACI] SyncHistory: connected, waiting for RECENT sync (up to 30s)")
			select {
			case <-recentDone:
				log.Printf("[WACI] SyncHistory: RECENT sync completed")
			case <-time.After(30 * time.Second):
				log.Printf("[WACI] SyncHistory: RECENT sync timed out")
			}
			wac.Disconnect()
		} else {
			log.Printf("[WACI] SyncHistory: failed to connect for RECENT sync: %v", err)
		}
	}

	rawCount, _ := store.RawMessageCount()
	log.Printf("[WACI] SyncHistory: total raw messages in DB: %d", rawCount)
	matched, err := c.triageAllFilters(store, claudeApiKey, callback)
	return matched, rawCount, err
}

// triageAllFilters runs every filter against its unmatched raw messages.
func (c *Client) triageAllFilters(store *Store, claudeApiKey string, callback MessageCallback) (int, error) {
	filters, err := store.listFilters()
	if err != nil {
		return 0, fmt.Errorf("failed to load filters: %w", err)
	}
	log.Printf("[WACI] triageAllFilters: found %d filters", len(filters))
	if len(filters) == 0 {
		log.Printf("[WACI] triageAllFilters: no filters to triage against — matches will be created when user creates filters")
		return 0, nil
	}
	triage := NewTriageClient(claudeApiKey, "")
	totalMatched := 0
	for _, f := range filters {
		msgs, ferr := store.GetRawMessagesForFilter(f.ID, 0)
		if ferr != nil {
			log.Printf("[WACI] triageAllFilters: failed to get messages for filter %s: %v", f.ID, ferr)
			continue
		}
		log.Printf("[WACI] triageAllFilters: filter=%q prompt=%q unmatched_messages=%d", f.Name, f.Prompt, len(msgs))
		filterMatched := 0
		filterSkipped := 0
		filterErrors := 0
		for _, msg := range msgs {
			// Check if filter should process this message (DM/group options)
			shouldProcess, skipReason := store.shouldProcessMessage(f, msg.ChatJID, msg.SenderJID)
			if !shouldProcess {
				log.Printf("[WACI] triageAllFilters: skipping msg %s for filter %s: %s", msg.MessageID, f.ID, skipReason)
				filterSkipped++
				continue
			}
			// Check metadata-based filter first
			matched, reason, confidence, handled := matchesMetadataFilter(f.Prompt, msg.ChatJID, msg.SenderJID)
			var triageErr error
			if !handled {
				matched, reason, confidence, triageErr = triage.TriageMessage(msg.Body, f.Prompt)
			}
			if triageErr != nil {
				log.Printf("[WACI] triageAllFilters: triage error for msg %s: %v", msg.MessageID, triageErr)
				filterErrors++
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
				if saveErr == nil {
					totalMatched++
					filterMatched++
					if callback != nil {
						callback.OnMessage(matchJSON)
					}
				} else {
					log.Printf("[WACI] triageAllFilters: failed to save match for msg %s: %v", msg.MessageID, saveErr)
				}
			}
		}
		log.Printf("[WACI] triageAllFilters: filter=%q matched=%d skipped=%d errors=%d",
			f.Name, filterMatched, filterSkipped, filterErrors)
	}
	log.Printf("[WACI] triageAllFilters: total matched=%d across %d filters", totalMatched, len(filters))
	return totalMatched, nil
}

// TriageStoredMessages runs a single filter against all raw messages not yet
// matched by it. Called when a new filter is created so users see historical
// messages immediately.
func (c *Client) TriageStoredMessages(filterID string, store *Store, claudeApiKey string, callback MessageCallback) (int, error) {
	filter, err := store.getFilter(filterID)
	if err != nil {
		return 0, fmt.Errorf("filter not found: %w", err)
	}
	// Cap at 500 most-recent messages so new-filter triage is fast.
	const triageLimit = 500
	msgs, err := store.GetRawMessagesForFilter(filterID, triageLimit)
	if err != nil {
		return 0, fmt.Errorf("failed to load raw messages: %w", err)
	}
	log.Printf("[WACI] TriageStoredMessages: filter=%q msgs=%d (limit=%d)", filter.Name, len(msgs), triageLimit)
	if len(msgs) == 0 {
		return 0, nil
	}
	triage := NewTriageClient(claudeApiKey, "")
	matched := 0
	errors := 0
	skipped := 0
	firstErr := ""
	for _, msg := range msgs {
		// Check if filter should process this message (DM/group options)
		shouldProcess, _ := store.shouldProcessMessage(filter, msg.ChatJID, msg.SenderJID)
		if !shouldProcess {
			skipped++
			continue
		}
		// Check metadata-based filter first
		ok, reason, confidence, handled := matchesMetadataFilter(filter.Prompt, msg.ChatJID, msg.SenderJID)
		var triageErr error
		if !handled {
			ok, reason, confidence, triageErr = triage.TriageMessage(msg.Body, filter.Prompt)
		}
		if triageErr != nil {
			errors++
			if firstErr == "" {
				firstErr = triageErr.Error()
				log.Printf("[WACI] TriageStoredMessages: first triage error: %v", triageErr)
			}
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
	log.Printf("[WACI] TriageStoredMessages: filter=%q matched=%d skipped=%d errors=%d", filter.Name, matched, skipped, errors)
	if errors > 0 && matched == 0 {
		return 0, fmt.Errorf("triage failed for all %d messages: %s", errors, firstErr)
	}
	return matched, nil
}

// SyncAndTriage connects to WhatsApp, collects live messages, runs AI triage, then disconnects.
func (c *Client) SyncAndTriage(lastSyncTimestamp int64, store *Store, claudeApiKey string, callback MessageCallback) (int, error) {
	ctx := context.Background()
	deviceStore, err := c.waStore.GetFirstDevice(ctx)
	if err != nil || deviceStore == nil {
		return 0, fmt.Errorf("no linked device found — call StartPairing first")
	}

	logger := waLog.Stdout("wabridge-sync", "WARN", true)
	wac := whatsmeow.NewClient(deviceStore, logger)

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
		if v.Info.IsFromMe || v.Message == nil {
			return
		}
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

	syncCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	<-syncCtx.Done()
	wac.Disconnect()

	if len(collected) == 0 {
		return 0, nil
	}

	filters, err := store.listFilters()
	if err != nil {
		return len(collected), fmt.Errorf("failed to load filters: %w", err)
	}
	triage := NewTriageClient(claudeApiKey, "")
	for _, msg := range collected {
		for _, f := range filters {
			// Check if filter should process this message (DM/group options)
			shouldProcess, _ := store.shouldProcessMessage(f, msg.chatJID, msg.senderJID)
			if !shouldProcess {
				continue
			}
			// Check metadata-based filter first
			matched, reason, confidence, handled := matchesMetadataFilter(f.Prompt, msg.chatJID, msg.senderJID)
			var err error
			if !handled {
				matched, reason, confidence, err = triage.TriageMessage(msg.body, f.Prompt)
			}
			if err != nil {
				continue
			}
			if matched {
				matchJSON, saveErr := store.SaveMatch(SaveMatchParams{
					FilterID:        f.ID,
					MessageID:       msg.msgID,
					SenderJID:       msg.senderJID,
					ChatJID:         msg.chatJID,
					ChatName:        msg.chatJID,
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
		return nil
	}
	logger := waLog.Stdout("wabridge-unlink", "WARN", true)
	wac := whatsmeow.NewClient(deviceStore, logger)
	if err := wac.Connect(); err == nil {
		wac.Logout(context.Background())
		wac.Disconnect()
	}
	return deviceStore.Delete(ctx)
}

// extractBodyFromMsg pulls the text body out of a WhatsApp message proto.
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

// extractBody retained for call-site compatibility.
func extractBody(evt *events.Message) string {
	return extractBodyFromMsg(evt.Message)
}

// GetGroups returns a JSON array of groups seen in message history.
// Reads from local DB — no live WhatsApp connection required.
func (c *Client) GetGroups(store *Store) (string, error) {
	groups, err := store.GetGroupsFromDB()
	if err != nil {
		return "", fmt.Errorf("failed to get groups: %w", err)
	}
	b, err := json.Marshal(groups)
	return string(b), err
}
