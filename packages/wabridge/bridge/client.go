// Package bridge contains the internal implementation of the WhatsApp bridge.
package bridge

import (
	"context"
	"fmt"
	"strings"
	"time"

	_ "github.com/mattn/go-sqlite3"
	"go.mau.fi/whatsmeow"
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
}

// NewClient creates a new Client using the given dbPath for the whatsmeow SQLite device store.
func NewClient(dbPath string, store *Store) (*Client, error) {
	logger := waLog.Stdout("wabridge", "WARN", true)
	ctx := context.Background()
	container, err := sqlstore.New(ctx, "sqlite3", fmt.Sprintf("file:%s?_foreign_keys=on", dbPath), logger)
	if err != nil {
		return nil, fmt.Errorf("failed to open whatsmeow store: %w", err)
	}
	return &Client{
		dbPath:  dbPath,
		store:   store,
		waStore: container,
	}, nil
}

// IsLinked returns true if there is at least one device stored.
func (c *Client) IsLinked() bool {
	ctx := context.Background()
	devices, err := c.waStore.GetAllDevices(ctx)
	if err != nil {
		return false
	}
	return len(devices) > 0
}

// StartPairing initiates a phone-number pairing flow.
// phoneNumber should be in E.164 format (with or without leading +).
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

	// Connect without a message handler for pairing
	if err := client.Connect(); err != nil {
		return "", fmt.Errorf("failed to connect for pairing: %w", err)
	}
	defer client.Disconnect()

	pairCtx := context.Background()
	code, err := client.PairPhone(pairCtx, phone, true, whatsmeow.PairClientChrome, "Chrome (Linux)")
	if err != nil {
		return "", fmt.Errorf("failed to pair phone: %w", err)
	}
	return code, nil
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

	// Collect messages before registering to avoid races
	type rawMsg struct {
		msgID     string
		senderJID string
		chatJID   string
		body      string
		timestamp int64
	}
	collected := make([]rawMsg, 0, 64)

	wac.AddEventHandler(func(evt interface{}) {
		switch v := evt.(type) {
		case *events.Message:
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
			body := extractBody(v)
			if body == "" {
				return
			}
			ts := v.Info.Timestamp.Unix()
			if ts <= lastSyncTimestamp {
				return
			}
			collected = append(collected, rawMsg{
				msgID:     v.Info.ID,
				senderJID: v.Info.Sender.String(),
				chatJID:   v.Info.Chat.String(),
				body:      body,
				timestamp: ts,
			})
		}
	})

	if err := wac.Connect(); err != nil {
		return 0, fmt.Errorf("failed to connect: %w", err)
	}
	defer wac.Disconnect()

	// Wait up to 30 seconds for history sync / live messages
	syncCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	<-syncCtx.Done()

	if len(collected) == 0 {
		return 0, nil
	}

	// Load all filters
	filters, err := store.listFilters()
	if err != nil {
		return len(collected), fmt.Errorf("failed to load filters: %w", err)
	}

	triage := NewTriageClient(claudeApiKey)

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

// extractBody pulls the text body out of a WhatsApp message.
func extractBody(evt *events.Message) string {
	if evt.Message == nil {
		return ""
	}
	if c := evt.Message.GetConversation(); c != "" {
		return c
	}
	if ext := evt.Message.GetExtendedTextMessage(); ext != nil {
		return ext.GetText()
	}
	if img := evt.Message.GetImageMessage(); img != nil {
		return img.GetCaption()
	}
	if vid := evt.Message.GetVideoMessage(); vid != nil {
		return vid.GetCaption()
	}
	return ""
}
