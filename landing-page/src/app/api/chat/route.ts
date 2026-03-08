import { NextRequest, NextResponse } from 'next/server';
import db from '@/utils/db';
import { extractToken, verifyToken, decryptApiKey } from '@/lib/auth';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const ANTHROPIC_TIMEOUT_MS = 15_000;

// Cap output tokens for trial users (shared API key) to limit spend.
// No model restriction — client can use any Claude model during the trial.
const TRIAL_MAX_TOKENS = 1024;

export async function POST(req: NextRequest) {
  // Authenticate
  const rawToken = extractToken(req);
  if (!rawToken) {
    return NextResponse.json(
      { error: 'Missing auth token', code: 'UNAUTHORIZED' },
      { status: 401 }
    );
  }

  let payload: { userId: string; deviceId: string };
  try {
    payload = verifyToken(rawToken);
  } catch {
    return NextResponse.json(
      { error: 'Invalid or expired token', code: 'UNAUTHORIZED' },
      { status: 401 }
    );
  }

  // Fetch user + trial status
  const userResult = await db.query<{
    id: string;
    trial_expires_at: string | null;
    whatsapp_linked: boolean;
    custom_api_key: string | null;
  }>(
    'SELECT id, trial_expires_at, whatsapp_linked, custom_api_key FROM mobile_users WHERE id = $1',
    [payload.userId]
  );

  if (userResult.rows.length === 0) {
    return NextResponse.json(
      { error: 'User not found', code: 'NOT_FOUND' },
      { status: 404 }
    );
  }

  const user = userResult.rows[0];
  const trialActive = user.trial_expires_at != null && new Date(user.trial_expires_at) > new Date();
  const hasCustomKey = !!user.custom_api_key;

  if (!trialActive && !hasCustomKey) {
    return NextResponse.json(
      {
        error: 'Free trial expired. Add your own Claude API key in app settings to continue.',
        code: 'TRIAL_EXPIRED',
      },
      { status: 402 }
    );
  }

  // Determine which API key to use
  const apiKey = hasCustomKey
    ? decryptApiKey(user.custom_api_key!)
    : process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.error('[/api/chat] ANTHROPIC_API_KEY is not set');
    return NextResponse.json(
      { error: 'Server misconfiguration', code: 'SERVER_ERROR' },
      { status: 500 }
    );
  }

  // Parse request body — must be a plain object (not null, array, or primitive)
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return NextResponse.json(
        { error: 'Request body must be a JSON object', code: 'BAD_REQUEST' },
        { status: 400 }
      );
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'BAD_REQUEST' },
      { status: 400 }
    );
  }

  // Cap max_tokens for trial users to limit spend on the shared API key.
  // Custom-key users are uncapped (they pay their own bill).
  if (!hasCustomKey) {
    const requested = typeof body.max_tokens === 'number' ? body.max_tokens : TRIAL_MAX_TOKENS;
    body = { ...body, max_tokens: Math.min(requested, TRIAL_MAX_TOKENS) };
  }

  // Forward to Anthropic with timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ANTHROPIC_TIMEOUT_MS);

  let anthropicRes: Response;
  try {
    anthropicRes = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    return NextResponse.json(
      { error: 'Upstream AI provider unavailable', code: 'UPSTREAM_UNAVAILABLE' },
      { status: 502 }
    );
  } finally {
    clearTimeout(timeout);
  }

  let data: unknown;
  try {
    data = await anthropicRes.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid response from upstream', code: 'UPSTREAM_INVALID_RESPONSE' },
      { status: 502 }
    );
  }

  // Log token usage (fire-and-forget)
  const tokensUsed =
    ((data as { usage?: { input_tokens?: number } })?.usage?.input_tokens ?? 0) +
    ((data as { usage?: { output_tokens?: number } })?.usage?.output_tokens ?? 0);

  if (tokensUsed > 0) {
    db.query('INSERT INTO usage_logs (user_id, tokens_used) VALUES ($1, $2)', [
      user.id,
      tokensUsed,
    ]).catch((err: unknown) => console.error('[usage_log]', err));
  }

  return NextResponse.json(data, { status: anthropicRes.status });
}
