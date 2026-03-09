package bridge

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"math/rand"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

// Store manages WACI application data in SQLite.
type Store struct {
	db *sql.DB
}

// Filter represents a user-defined message filter.
type Filter struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Prompt    string `json:"prompt"`
	CreatedAt int64  `json:"created_at"`
	UpdatedAt int64  `json:"updated_at"`
}

// FilterMatch represents a message that matched a filter.
type FilterMatch struct {
	ID              string  `json:"id"`
	FilterID        string  `json:"filter_id"`
	MessageID       string  `json:"message_id"`
	SenderJID       string  `json:"sender_jid"`
	ChatJID         string  `json:"chat_jid"`
	ChatName        string  `json:"chat_name"`
	SenderName      string  `json:"sender_name"`
	Body            string  `json:"body"`
	ReceivedAt      int64   `json:"received_at"`
	RelevanceReason string  `json:"relevance_reason"`
	Confidence      float64 `json:"confidence"`
	IsRead          bool    `json:"is_read"`
	CreatedAt       int64   `json:"created_at"`
}

// SaveMatchParams holds parameters for creating a new filter match.
type SaveMatchParams struct {
	FilterID        string
	MessageID       string
	SenderJID       string
	ChatJID         string
	ChatName        string
	SenderName      string
	Body            string
	ReceivedAt      int64
	RelevanceReason string
	Confidence      float64
}

// NewStore opens (or creates) the SQLite database at dbPath and runs migrations.
func NewStore(dbPath string) (*Store, error) {
	db, err := sql.Open("sqlite3", fmt.Sprintf("file:%s?_foreign_keys=on&_journal_mode=WAL", dbPath))
	if err != nil {
		return nil, fmt.Errorf("failed to open waci store: %w", err)
	}
	// SQLite does not support concurrent writes; a single connection avoids
	// "database is locked" errors when sync and UI calls overlap.
	db.SetMaxOpenConns(1)
	s := &Store{db: db}
	if err := s.migrate(); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("migration failed: %w", err)
	}
	return s, nil
}

// newID returns a random-suffix identifier with the given prefix.
// Using nanosecond time + random bits makes collisions astronomically unlikely.
func newID(prefix string) string {
	return fmt.Sprintf("%s_%d_%04x", prefix, time.Now().UnixNano(), rand.Intn(0x10000))
}

func (s *Store) migrate() error {
	_, err := s.db.Exec(`
CREATE TABLE IF NOT EXISTS waci_filters (
  id         TEXT    PRIMARY KEY,
  name       TEXT    NOT NULL,
  prompt     TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS waci_filter_matches (
  id               TEXT    PRIMARY KEY,
  filter_id        TEXT    NOT NULL REFERENCES waci_filters(id) ON DELETE CASCADE,
  message_id       TEXT    NOT NULL,
  sender_jid       TEXT    NOT NULL,
  chat_jid         TEXT    NOT NULL,
  chat_name        TEXT    NOT NULL,
  sender_name      TEXT    NOT NULL,
  body             TEXT    NOT NULL,
  received_at      INTEGER NOT NULL,
  relevance_reason TEXT,
  confidence       REAL,
  is_read          INTEGER DEFAULT 0,
  created_at       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS waci_sync_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`)
	return err
}

// listFilters returns all filters (internal use).
func (s *Store) listFilters() ([]Filter, error) {
	rows, err := s.db.Query(`SELECT id, name, prompt, created_at, updated_at FROM waci_filters ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Filter
	for rows.Next() {
		var f Filter
		if err := rows.Scan(&f.ID, &f.Name, &f.Prompt, &f.CreatedAt, &f.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

// GetFilters returns a JSON array of all filters.
func (s *Store) GetFilters() (string, error) {
	filters, err := s.listFilters()
	if err != nil {
		return "", err
	}
	if filters == nil {
		filters = []Filter{}
	}
	b, err := json.Marshal(filters)
	return string(b), err
}

// SaveFilter creates or updates a filter from a JSON object.
// If the JSON includes a non-empty "id", it performs an upsert; otherwise it assigns a new ID.
func (s *Store) SaveFilter(filterJson string) (string, error) {
	var f Filter
	if err := json.Unmarshal([]byte(filterJson), &f); err != nil {
		return "", fmt.Errorf("invalid filter JSON: %w", err)
	}
	now := time.Now().Unix()
	if f.ID == "" {
		f.ID = newID("flt")
	}
	if f.CreatedAt == 0 {
		f.CreatedAt = now
	}
	f.UpdatedAt = now

	_, err := s.db.Exec(`
INSERT INTO waci_filters (id, name, prompt, created_at, updated_at)
VALUES (?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  name       = excluded.name,
  prompt     = excluded.prompt,
  updated_at = excluded.updated_at
`, f.ID, f.Name, f.Prompt, f.CreatedAt, f.UpdatedAt)
	if err != nil {
		return "", fmt.Errorf("failed to save filter: %w", err)
	}
	b, err := json.Marshal(f)
	return string(b), err
}

// DeleteFilter removes a filter and cascades to its matches.
func (s *Store) DeleteFilter(id string) error {
	_, err := s.db.Exec(`DELETE FROM waci_filters WHERE id = ?`, id)
	return err
}

// SaveMatch persists a filter match and returns it as JSON.
func (s *Store) SaveMatch(p SaveMatchParams) (string, error) {
	now := time.Now().Unix()
	// Include FilterID so the same message matched by two different filters gets distinct IDs.
	id := fmt.Sprintf("match_%s_%s_%04x", p.FilterID, p.MessageID, rand.Intn(0x10000))
	m := FilterMatch{
		ID:              id,
		FilterID:        p.FilterID,
		MessageID:       p.MessageID,
		SenderJID:       p.SenderJID,
		ChatJID:         p.ChatJID,
		ChatName:        p.ChatName,
		SenderName:      p.SenderName,
		Body:            p.Body,
		ReceivedAt:      p.ReceivedAt,
		RelevanceReason: p.RelevanceReason,
		Confidence:      p.Confidence,
		IsRead:          false,
		CreatedAt:       now,
	}
	_, err := s.db.Exec(`
INSERT OR IGNORE INTO waci_filter_matches
  (id, filter_id, message_id, sender_jid, chat_jid, chat_name, sender_name, body, received_at, relevance_reason, confidence, is_read, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
`, m.ID, m.FilterID, m.MessageID, m.SenderJID, m.ChatJID, m.ChatName, m.SenderName, m.Body, m.ReceivedAt, m.RelevanceReason, m.Confidence, m.CreatedAt)
	if err != nil {
		return "", err
	}
	b, err := json.Marshal(m)
	return string(b), err
}

// GetMatches returns a JSON array of filter matches for filterId.
// Pass limit=0 to return all matches.
func (s *Store) GetMatches(filterId string, limit int) (string, error) {
	query := `SELECT id, filter_id, message_id, sender_jid, chat_jid, chat_name, sender_name, body, received_at, COALESCE(relevance_reason,''), COALESCE(confidence,0), is_read, created_at FROM waci_filter_matches WHERE filter_id = ? ORDER BY received_at DESC`
	args := []interface{}{filterId}
	if limit > 0 {
		query += " LIMIT ?"
		args = append(args, limit)
	}
	rows, err := s.db.Query(query, args...)
	if err != nil {
		return "", err
	}
	defer rows.Close()
	var out []FilterMatch
	for rows.Next() {
		var m FilterMatch
		var isRead int
		if err := rows.Scan(&m.ID, &m.FilterID, &m.MessageID, &m.SenderJID, &m.ChatJID, &m.ChatName, &m.SenderName, &m.Body, &m.ReceivedAt, &m.RelevanceReason, &m.Confidence, &isRead, &m.CreatedAt); err != nil {
			return "", err
		}
		m.IsRead = isRead == 1
		out = append(out, m)
	}
	if out == nil {
		out = []FilterMatch{}
	}
	b, err := json.Marshal(out)
	return string(b), err
}

// GetSyncState retrieves a sync state value by key.
func (s *Store) GetSyncState(key string) (string, error) {
	var val string
	err := s.db.QueryRow(`SELECT value FROM waci_sync_state WHERE key = ?`, key).Scan(&val)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return val, err
}

// SetSyncState persists a sync state value.
func (s *Store) SetSyncState(key, value string) error {
	_, err := s.db.Exec(`INSERT INTO waci_sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, key, value)
	return err
}
