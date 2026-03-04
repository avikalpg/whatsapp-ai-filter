-- mobile-server database schema
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- v2 migration: drop email/password columns if upgrading from old schema
ALTER TABLE users DROP COLUMN IF EXISTS email;
ALTER TABLE users DROP COLUMN IF EXISTS password_hash;

CREATE TABLE IF NOT EXISTS filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'all' CHECK (category IN ('personal', 'work', 'all')),
  include_dms BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_preset BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS filter_group_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filter_id UUID NOT NULL REFERENCES filters(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL,
  group_name TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('include', 'exclude')),
  UNIQUE (filter_id, group_id)
);

CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  phone_number TEXT,
  status TEXT NOT NULL DEFAULT 'unlinked'
    CHECK (status IN ('unlinked', 'linking', 'ready', 'disconnected')),
  linked_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Message content stored plaintext for MVP; E2E encryption planned (see roadmap)
CREATE TABLE IF NOT EXISTS filter_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filter_id UUID NOT NULL REFERENCES filters(id) ON DELETE CASCADE,
  group_id TEXT,
  group_name TEXT,
  sender_name TEXT,
  content TEXT,
  is_dm BOOLEAN NOT NULL DEFAULT FALSE,
  reasoning TEXT,
  confidence FLOAT,
  original_timestamp TIMESTAMPTZ,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  is_read BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_filter_matches_user ON filter_matches(user_id, received_at DESC);
