// Package wabridge provides a gomobile-compatible bridge to whatsmeow (WhatsApp).
// It is designed to be compiled with gomobile bind for Android and iOS.
//
// GOMOBILE CONSTRAINTS:
// - Only types from this top-level package are exported to native code
// - No chan, map, or slice-of-non-byte-slices in exported signatures
// - Use (Type, error) return pattern
package wabridge

import (
	"github.com/avikalpg/whatsapp-ai-filter/wabridge/bridge"
)

// MessageCallback is implemented by the native layer to receive messages.
type MessageCallback interface {
	OnMessage(jsonPayload string)
}

// SyncResult is returned by SyncAndTriage.
type SyncResult struct {
	MessagesSynced int
	Error          string
}

// Bridge is the main object exposed to native code via gomobile.
type Bridge struct {
	dbPath       string
	claudeApiKey string
	internal     *bridge.Client
	store        *bridge.Store
}

// NewBridge creates a new Bridge instance, opening the SQLite database at dbPath.
// claudeApiKey is used for AI triage calls.
func NewBridge(dbPath string, claudeApiKey string) (*Bridge, error) {
	store, err := bridge.NewStore(dbPath)
	if err != nil {
		return nil, err
	}
	client, err := bridge.NewClient(dbPath, store)
	if err != nil {
		return nil, err
	}
	return &Bridge{
		dbPath:       dbPath,
		claudeApiKey: claudeApiKey,
		internal:     client,
		store:        store,
	}, nil
}

// StartPairing initiates a phone-number pairing flow.
// Returns the pairing code that the user must enter in WhatsApp → Linked Devices.
func (b *Bridge) StartPairing(phoneNumber string) (string, error) {
	return b.internal.StartPairing(phoneNumber)
}

// IsLinked returns true if this bridge has a stored WhatsApp session.
func (b *Bridge) IsLinked() bool {
	return b.internal.IsLinked()
}

// SyncAndTriage connects to WhatsApp, collects messages since lastSyncTimestamp,
// runs AI triage against all saved filters, and disconnects.
// Results are persisted to the local DB; matched messages are also delivered via callback.
func (b *Bridge) SyncAndTriage(lastSyncTimestamp int64, callback MessageCallback) (*SyncResult, error) {
	var cb bridge.MessageCallback
	if callback != nil {
		cb = &messageCallbackAdapter{callback}
	}
	synced, err := b.internal.SyncAndTriage(lastSyncTimestamp, b.store, b.claudeApiKey, cb)
	result := &SyncResult{MessagesSynced: synced}
	if err != nil {
		result.Error = err.Error()
	}
	return result, nil
}

// GetFilters returns a JSON array of all saved filters.
func (b *Bridge) GetFilters() (string, error) {
	return b.store.GetFilters()
}

// SaveFilter creates or updates a filter from a JSON object.
// Returns the saved filter as JSON (with id/timestamps populated).
func (b *Bridge) SaveFilter(filterJson string) (string, error) {
	return b.store.SaveFilter(filterJson)
}

// DeleteFilter removes a filter and all its matches by id.
func (b *Bridge) DeleteFilter(id string) error {
	return b.store.DeleteFilter(id)
}

// GetMatches returns a JSON array of filter matches for the given filterId.
// Pass limit=0 for all matches.
func (b *Bridge) GetMatches(filterId string, limit int) (string, error) {
	return b.store.GetMatches(filterId, limit)
}

// Unlink removes the stored WhatsApp session (logout).
func (b *Bridge) Unlink() error {
	return b.internal.Unlink()
}

// messageCallbackAdapter bridges the gomobile interface to the internal bridge interface.
type messageCallbackAdapter struct {
	outer MessageCallback
}

func (a *messageCallbackAdapter) OnMessage(jsonPayload string) {
	a.outer.OnMessage(jsonPayload)
}
