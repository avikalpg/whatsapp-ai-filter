/**
 * POST /api/setup
 * One-shot database migration endpoint.
 * Protected by SETUP_SECRET header — safe to call repeatedly (IF NOT EXISTS everywhere).
 *
 * Usage:
 *   curl -X POST https://<domain>/api/setup \
 *     -H "x-setup-secret: <SETUP_SECRET env var>"
 */
import { NextRequest, NextResponse } from 'next/server';
import db from '@/utils/db';

const SETUP_SQL = `
CREATE TABLE IF NOT EXISTS analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    installation_id UUID NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    app_version VARCHAR(50),
    node_version VARCHAR(20),
    os_platform VARCHAR(50),
    is_running_with_pm2 BOOLEAN,
    uptime_seconds_since_last_heartbeat INTEGER,
    messages_analyzed_count INTEGER NOT NULL DEFAULT 0,
    messages_relevant_count INTEGER NOT NULL DEFAULT 0,
    ai_provider_message_counts JSONB DEFAULT '{}'::jsonb,
    ai_api_latency_ms JSONB DEFAULT '{}'::jsonb,
    ai_api_success_counts JSONB DEFAULT '{}'::jsonb,
    ai_api_failure_counts JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_analytics_installation_id ON analytics (installation_id);
CREATE INDEX IF NOT EXISTS idx_analytics_recorded_at ON analytics (recorded_at DESC);

CREATE TABLE IF NOT EXISTS mobile_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    trial_expires_at TIMESTAMPTZ,
    whatsapp_linked BOOLEAN NOT NULL DEFAULT FALSE,
    custom_api_key TEXT
);
-- Note: UNIQUE on device_id already creates an implicit B-tree index in PostgreSQL;
-- a separate CREATE INDEX is intentionally omitted to avoid redundancy.

CREATE TABLE IF NOT EXISTS usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES mobile_users(id) ON DELETE CASCADE,
    tokens_used INTEGER NOT NULL DEFAULT 0,
    cost_usd NUMERIC(10, 8) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON usage_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON usage_logs (created_at DESC);
`;

export async function POST(req: NextRequest) {
  // Fail fast with a clear 500 when the operator forgot to set SETUP_SECRET,
  // rather than returning 401 for every request with no indication why.
  if (!process.env.SETUP_SECRET) {
    console.error('[/api/setup] SETUP_SECRET env var is not configured');
    return NextResponse.json(
      { error: 'Server misconfiguration: SETUP_SECRET is not set' },
      { status: 500 }
    );
  }

  const secret = req.headers.get('x-setup-secret');
  if (!secret || secret !== process.env.SETUP_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await db.query(SETUP_SQL);
    return NextResponse.json({ ok: true, message: 'Database schema applied successfully.' });
  } catch (err) {
    // Log the full error server-side; return a generic message to avoid leaking
    // internal SQL/driver details from this privileged admin endpoint.
    console.error('[/api/setup]', err);
    return NextResponse.json(
      { error: 'Database migration failed. Check server logs for details.' },
      { status: 500 }
    );
  }
}
