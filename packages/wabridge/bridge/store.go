package bridge

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"math/rand"
	"time"

	_ "github.com/mattn/go-sqlite3"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/types"
)

// Store manages WACI application data in SQLite.
type Store struct {
	db *sql.DB
}

// Filter represents a user-defined message filter.
type Filter struct {
	ID              string   `json:"id"`
	Name            string   `json:"name"`
	Prompt          string   `json:"prompt"`
	// DM options
	ProcessDMs      bool     `json:"process_dms"`
	DMContacts      bool     `json:"dm_contacts"`
	DMNonContacts   bool     `json:"dm_non_contacts"`
	DMBusinesses    bool     `json:"dm_businesses"`
	DMNonBusinesses bool     `json:"dm_non_businesses"`
	// Group options
	ProcessGroups   bool     `json:"process_groups"`
	GroupMode       string   `json:"group_mode"` // "inclusion", "exclusion", or empty
	GroupList       []string `json:"group_list"`
	CreatedAt       int64    `json:"created_at"`
	UpdatedAt       int64    `json:"updated_at"`
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

// RawMessage is a message stored during history sync, independent of any filter.
// When the user creates a new filter later, we triage these raw messages against it.
type RawMessage struct {
	MessageID  string `json:"message_id"`
	SenderJID  string `json:"sender_jid"`
	ChatJID    string `json:"chat_jid"`
	ChatName   string `json:"chat_name"`
	SenderName string `json:"sender_name"`
	Body       string `json:"body"`
	ReceivedAt int64  `json:"received_at"`
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
	// Use a raw file path (no file: URI scheme). go-sqlite3 wraps sqlite3_open_v2
	// with SQLITE_OPEN_URI only when compiled with that flag; when SQLITE_OPEN_URI
	// is absent (e.g. gomobile Android builds) the string "file:/path?..." is
	// treated as a literal filename that doesn't exist. A raw absolute path always
	// works. Pragmas are applied separately below.
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open waci store: %w", err)
	}
	// SQLite does not support concurrent writes; a single connection avoids
	// "database is locked" errors when sync and UI calls overlap.
	db.SetMaxOpenConns(1)
	// Apply pragmas explicitly — do not rely on URI query params, which
	// require SQLITE_OPEN_URI support that may not be present in gomobile builds.
	if _, err = db.Exec(`PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;`); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("failed to apply pragmas: %w", err)
	}
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

CREATE TABLE IF NOT EXISTS waci_raw_messages (
  message_id  TEXT    PRIMARY KEY,
  sender_jid  TEXT    NOT NULL,
  chat_jid    TEXT    NOT NULL,
  chat_name   TEXT    NOT NULL,
  sender_name TEXT    NOT NULL,
  body        TEXT    NOT NULL,
  received_at INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS waci_contacts (
  jid        TEXT    PRIMARY KEY,
  first_name TEXT,
  full_name  TEXT,
  updated_at INTEGER NOT NULL
);
`)
	if err != nil {
		return err
	}

	// Migrate to schema v3: granular DM/group options
	var schemaV3 int
	_ = s.db.QueryRow(`SELECT COUNT(*) FROM waci_sync_state WHERE key = 'schema_v3'`).Scan(&schemaV3)
	if schemaV3 == 0 {
		_, _ = s.db.Exec(`
ALTER TABLE waci_filters ADD COLUMN process_dms INTEGER DEFAULT 1;
ALTER TABLE waci_filters ADD COLUMN dm_contacts INTEGER DEFAULT 1;
ALTER TABLE waci_filters ADD COLUMN dm_non_contacts INTEGER DEFAULT 1;
ALTER TABLE waci_filters ADD COLUMN dm_businesses INTEGER DEFAULT 0;
ALTER TABLE waci_filters ADD COLUMN dm_non_businesses INTEGER DEFAULT 1;
ALTER TABLE waci_filters ADD COLUMN process_groups INTEGER DEFAULT 1;
ALTER TABLE waci_filters ADD COLUMN group_mode TEXT DEFAULT '';
ALTER TABLE waci_filters ADD COLUMN group_list TEXT DEFAULT '[]';
`)
		_, _ = s.db.Exec(`INSERT INTO waci_sync_state (key, value) VALUES ('schema_v3', '1')`)
	}

	// Seed the built-in default filters exactly once.
	// Tracked via sync_state so a user who deletes them doesn't see them reappear.
	var seeded int
	_ = s.db.QueryRow(`SELECT COUNT(*) FROM waci_sync_state WHERE key = 'default_filters_seeded_v2'`).Scan(&seeded)
	if seeded == 0 {
		_, _ = s.db.Exec(`
INSERT INTO waci_filters (
  id, name, prompt, 
  process_dms, dm_contacts, dm_non_contacts, dm_businesses, dm_non_businesses,
  process_groups, group_mode, group_list,
  created_at, updated_at
)
VALUES 
  ('flt_default_all', 'All Messages', '*', 1, 1, 1, 1, 1, 1, '', '[]', strftime('%s','now'), strftime('%s','now')),
  ('flt_default_dms', 'All DMs', '*:dm', 1, 1, 1, 1, 1, 0, '', '[]', strftime('%s','now'), strftime('%s','now')),
  ('flt_default_dms_contacts', 'DMs from Contacts', '*:dm:contact', 1, 1, 0, 0, 0, 0, '', '[]', strftime('%s','now'), strftime('%s','now'))
`)
		_, _ = s.db.Exec(`INSERT INTO waci_sync_state (key, value) VALUES ('default_filters_seeded_v2', '1')`)
	}
	return nil
}

// listFilters returns all filters (internal use).
func (s *Store) listFilters() ([]Filter, error) {
	rows, err := s.db.Query(`
		SELECT id, name, prompt, 
		       COALESCE(process_dms, 1), COALESCE(dm_contacts, 1), COALESCE(dm_non_contacts, 1), 
		       COALESCE(dm_businesses, 0), COALESCE(dm_non_businesses, 1),
		       COALESCE(process_groups, 1), COALESCE(group_mode, ''), COALESCE(group_list, '[]'),
		       created_at, updated_at 
		FROM waci_filters ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Filter
	for rows.Next() {
		var f Filter
		var processDMs, dmContacts, dmNonContacts, dmBusinesses, dmNonBusinesses, processGroups int
		var groupListJSON string
		if err := rows.Scan(
			&f.ID, &f.Name, &f.Prompt,
			&processDMs, &dmContacts, &dmNonContacts, &dmBusinesses, &dmNonBusinesses,
			&processGroups, &f.GroupMode, &groupListJSON,
			&f.CreatedAt, &f.UpdatedAt,
		); err != nil {
			return nil, err
		}
		f.ProcessDMs = processDMs == 1
		f.DMContacts = dmContacts == 1
		f.DMNonContacts = dmNonContacts == 1
		f.DMBusinesses = dmBusinesses == 1
		f.DMNonBusinesses = dmNonBusinesses == 1
		f.ProcessGroups = processGroups == 1
		_ = json.Unmarshal([]byte(groupListJSON), &f.GroupList)
		if f.GroupList == nil {
			f.GroupList = []string{}
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

	// Ensure array is not nil
	if f.GroupList == nil {
		f.GroupList = []string{}
	}

	groupListJSON, _ := json.Marshal(f.GroupList)

	// Convert bools to integers for SQLite
	processDMs := boolToInt(f.ProcessDMs)
	dmContacts := boolToInt(f.DMContacts)
	dmNonContacts := boolToInt(f.DMNonContacts)
	dmBusinesses := boolToInt(f.DMBusinesses)
	dmNonBusinesses := boolToInt(f.DMNonBusinesses)
	processGroups := boolToInt(f.ProcessGroups)

	_, err := s.db.Exec(`
INSERT INTO waci_filters (
  id, name, prompt, 
  process_dms, dm_contacts, dm_non_contacts, dm_businesses, dm_non_businesses,
  process_groups, group_mode, group_list,
  created_at, updated_at
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  name              = excluded.name,
  prompt            = excluded.prompt,
  process_dms       = excluded.process_dms,
  dm_contacts       = excluded.dm_contacts,
  dm_non_contacts   = excluded.dm_non_contacts,
  dm_businesses     = excluded.dm_businesses,
  dm_non_businesses = excluded.dm_non_businesses,
  process_groups    = excluded.process_groups,
  group_mode        = excluded.group_mode,
  group_list        = excluded.group_list,
  updated_at        = excluded.updated_at
`, f.ID, f.Name, f.Prompt,
		processDMs, dmContacts, dmNonContacts, dmBusinesses, dmNonBusinesses,
		processGroups, f.GroupMode, string(groupListJSON),
		f.CreatedAt, f.UpdatedAt)
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
		
		// Enrich sender name with contact name if available
		if jid, err := types.ParseJID(m.SenderJID); err == nil {
			if contactName, _ := s.GetContactName(jid); contactName != "" {
				m.SenderName = contactName
			}
		}
		
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

// SaveRawMessage stores a message from history sync for later triage.
// Uses INSERT OR IGNORE so re-syncing is idempotent.
func (s *Store) SaveRawMessage(m RawMessage) error {
	_, err := s.db.Exec(`
INSERT OR IGNORE INTO waci_raw_messages
  (message_id, sender_jid, chat_jid, chat_name, sender_name, body, received_at, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`, m.MessageID, m.SenderJID, m.ChatJID, m.ChatName, m.SenderName, m.Body, m.ReceivedAt, time.Now().Unix())
	return err
}

// GetRawMessagesForFilter returns all raw messages that have NOT yet been
// matched against filterID. Used when a new filter is created so we can
// retroactively triage stored history.
func (s *Store) GetRawMessagesForFilter(filterID string) ([]RawMessage, error) {
	rows, err := s.db.Query(`
SELECT r.message_id, r.sender_jid, r.chat_jid, r.chat_name, r.sender_name, r.body, r.received_at
FROM waci_raw_messages r
WHERE NOT EXISTS (
    SELECT 1 FROM waci_filter_matches m
    WHERE m.message_id = r.message_id AND m.filter_id = ?
)
ORDER BY r.received_at DESC
`, filterID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []RawMessage
	for rows.Next() {
		var m RawMessage
		if err := rows.Scan(&m.MessageID, &m.SenderJID, &m.ChatJID, &m.ChatName, &m.SenderName, &m.Body, &m.ReceivedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// getFilter returns a single filter by ID.
func (s *Store) getFilter(id string) (Filter, error) {
	var f Filter
	var processDMs, dmContacts, dmNonContacts, dmBusinesses, dmNonBusinesses, processGroups int
	var groupListJSON string
	err := s.db.QueryRow(`
		SELECT id, name, prompt,
		       COALESCE(process_dms, 1), COALESCE(dm_contacts, 1), COALESCE(dm_non_contacts, 1),
		       COALESCE(dm_businesses, 0), COALESCE(dm_non_businesses, 1),
		       COALESCE(process_groups, 1), COALESCE(group_mode, ''), COALESCE(group_list, '[]'),
		       created_at, updated_at
		FROM waci_filters WHERE id = ?
	`, id).Scan(
		&f.ID, &f.Name, &f.Prompt,
		&processDMs, &dmContacts, &dmNonContacts, &dmBusinesses, &dmNonBusinesses,
		&processGroups, &f.GroupMode, &groupListJSON,
		&f.CreatedAt, &f.UpdatedAt,
	)
	if err != nil {
		return f, err
	}
	f.ProcessDMs = processDMs == 1
	f.DMContacts = dmContacts == 1
	f.DMNonContacts = dmNonContacts == 1
	f.DMBusinesses = dmBusinesses == 1
	f.DMNonBusinesses = dmNonBusinesses == 1
	f.ProcessGroups = processGroups == 1
	_ = json.Unmarshal([]byte(groupListJSON), &f.GroupList)
	if f.GroupList == nil {
		f.GroupList = []string{}
	}
	return f, nil
}

// RawMessageCount returns the number of raw messages stored from history sync.
func (s *Store) RawMessageCount() (int, error) {
	var count int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM waci_raw_messages`).Scan(&count)
	return count, err
}

// boolToInt converts a bool to int for SQLite storage (1 or 0).
func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

// ── Contact Store Methods ───────────────────────────────────────────────────
// These methods implement whatsmeow's ContactStore interface for app state sync

// PutContactName signature matches whatsmeow ContactStore: (ctx, user, fullName, firstName)
func (s *Store) PutContactName(ctx context.Context, jid types.JID, fullName, firstName string) error {
	_, err := s.db.Exec(`
INSERT INTO waci_contacts (jid, first_name, full_name, updated_at)
VALUES (?, ?, ?, strftime('%s','now'))
ON CONFLICT(jid) DO UPDATE SET
  first_name = excluded.first_name,
  full_name = excluded.full_name,
  updated_at = excluded.updated_at
`, jid.String(), firstName, fullName)
	return err
}

func (s *Store) PutAllContactNames(ctx context.Context, contacts []store.ContactEntry) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`
INSERT INTO waci_contacts (jid, first_name, full_name, updated_at)
VALUES (?, ?, ?, strftime('%s','now'))
ON CONFLICT(jid) DO UPDATE SET
  first_name = excluded.first_name,
  full_name = excluded.full_name,
  updated_at = excluded.updated_at
`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, contact := range contacts {
		_, err = stmt.Exec(contact.JID.String(), contact.FirstName, contact.FullName)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (s *Store) GetContactName(jid types.JID) (string, error) {
	var fullName string
	err := s.db.QueryRow(`SELECT full_name FROM waci_contacts WHERE jid = ?`, jid.String()).Scan(&fullName)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return fullName, err
}

func (s *Store) GetAllContacts(ctx context.Context) (map[types.JID]types.ContactInfo, error) {
	rows, err := s.db.Query(`SELECT jid, first_name, full_name FROM waci_contacts`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	contacts := make(map[types.JID]types.ContactInfo)
	for rows.Next() {
		var jidStr, firstName, fullName string
		if err := rows.Scan(&jidStr, &firstName, &fullName); err != nil {
			continue
		}
		jid, err := types.ParseJID(jidStr)
		if err != nil {
			continue
		}
		contacts[jid] = types.ContactInfo{
			Found:     true,
			FirstName: firstName,
			FullName:  fullName,
		}
	}
	return contacts, rows.Err()
}

func (s *Store) GetContact(ctx context.Context, user types.JID) (types.ContactInfo, error) {
	var firstName, fullName string
	err := s.db.QueryRow(`SELECT first_name, full_name FROM waci_contacts WHERE jid = ?`, user.String()).Scan(&firstName, &fullName)
	if err == sql.ErrNoRows {
		return types.ContactInfo{Found: false}, nil
	}
	if err != nil {
		return types.ContactInfo{}, err
	}
	return types.ContactInfo{
		Found:     true,
		FirstName: firstName,
		FullName:  fullName,
	}, nil
}

func (s *Store) PutPushName(ctx context.Context, user types.JID, pushName string) (bool, string, error) {
	var old string
	_ = s.db.QueryRow(`SELECT full_name FROM waci_contacts WHERE jid = ?`, user.String()).Scan(&old)
	_, err := s.db.Exec(`
INSERT INTO waci_contacts (jid, full_name, first_name, updated_at)
VALUES (?, ?, '', strftime('%s','now'))
ON CONFLICT(jid) DO UPDATE SET
  full_name = CASE WHEN full_name = '' OR full_name IS NULL THEN excluded.full_name ELSE full_name END,
  updated_at = excluded.updated_at
`, user.String(), pushName)
	return old != pushName, old, err
}

func (s *Store) PutBusinessName(ctx context.Context, user types.JID, businessName string) (bool, string, error) {
	var old string
	_ = s.db.QueryRow(`SELECT full_name FROM waci_contacts WHERE jid = ?`, user.String()).Scan(&old)
	_, err := s.db.Exec(`
INSERT INTO waci_contacts (jid, full_name, first_name, updated_at)
VALUES (?, ?, '', strftime('%s','now'))
ON CONFLICT(jid) DO UPDATE SET
  full_name = CASE WHEN full_name = '' OR full_name IS NULL THEN excluded.full_name ELSE full_name END,
  updated_at = excluded.updated_at
`, user.String(), businessName)
	return old != businessName, old, err
}

func (s *Store) PutManyRedactedPhones(ctx context.Context, entries []store.RedactedPhoneEntry) error {
	// We don't need to store redacted phones for our use case
	return nil
}
