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
CREATE INDEX IF NOT EXISTS idx_mobile_users_device_id ON mobile_users (device_id);

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
  const secret = req.headers.get('x-setup-secret');
  if (!secret || secret !== process.env.SETUP_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    await db.query(SETUP_SQL);
    return NextResponse.json({ ok: true, message: 'Database schema applied successfully.' });
  } catch (err) {
    console.error('[/api/setup]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
