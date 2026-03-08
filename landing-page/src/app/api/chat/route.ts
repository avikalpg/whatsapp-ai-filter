import { NextRequest, NextResponse } from 'next/server';
import db from '@/utils/db';
import { extractToken, verifyToken, decryptApiKey } from '@/lib/auth';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const ANTHROPIC_TIMEOUT_MS = 15_000;

// Cap output tokens for trial users to prevent a single request burning too much.
const TRIAL_MAX_TOKENS = 1024;

// Dollar budget for the 24h trial period. Override via TRIAL_BUDGET_USD env var.
// Checked against cumulative spend in usage_logs before each trial request.
const TRIAL_BUDGET_USD = parseFloat(process.env.TRIAL_BUDGET_USD ?? '5.0');

// Anthropic pricing: USD per million tokens (input / output).
// Source: https://www.anthropic.com/pricing — update as pricing changes.
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-5':                  { input: 15.00, output: 75.00 },
  'claude-opus-4-latest':             { input: 15.00, output: 75.00 },
  'claude-sonnet-4-5':                { input:  3.00, output: 15.00 },
  'claude-3-7-sonnet-latest':         { input:  3.00, output: 15.00 },
  'claude-3-5-sonnet-latest':         { input:  3.00, output: 15.00 },
  'claude-3-5-haiku-latest':          { input:  0.80, output:  4.00 },
  'claude-haiku-3-5-latest':          { input:  0.80, output:  4.00 },
  'claude-3-haiku-20240307':          { input:  0.25, output:  1.25 },
};
// Conservative fallback for unknown/future models — price as Opus
const FALLBACK_PRICING = { input: 15.00, output: 75.00 };

function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = MODEL_PRICING[model] ?? FALLBACK_PRICING;
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

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

  // For trial users: check cumulative spend against dollar budget
  if (!hasCustomKey) {
    const spendResult = await db.query<{ total: string }>(
      'SELECT COALESCE(SUM(cost_usd), 0) AS total FROM usage_logs WHERE user_id = $1',
      [user.id]
    );
    const spentUsd = parseFloat(spendResult.rows[0]?.total ?? '0');
    if (spentUsd >= TRIAL_BUDGET_USD) {
      return NextResponse.json(
        {
          error: `Trial budget of $${TRIAL_BUDGET_USD.toFixed(2)} reached. Add your own Claude API key to continue.`,
          code: 'TRIAL_BUDGET_EXHAUSTED',
        },
        { status: 402 }
      );
    }
  }

  // Determine which API key to use
  let apiKey: string | undefined;
  try {
    apiKey = hasCustomKey
      ? decryptApiKey(user.custom_api_key!)
      : process.env.ANTHROPIC_API_KEY;
  } catch (err) {
    console.error('[/api/chat] failed to decrypt custom API key', err);
    return NextResponse.json(
      { error: 'Saved API key is invalid or corrupted. Please re-add it in settings.', code: 'INVALID_API_KEY' },
      { status: 422 }
    );
  }

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

  // Cap max_tokens for trial users on the shared API key.
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

  // Log cost + token usage (fire-and-forget)
  const usage = (data as { usage?: { input_tokens?: number; output_tokens?: number } })?.usage;
  const inputTokens = usage?.input_tokens ?? 0;
  const outputTokens = usage?.output_tokens ?? 0;
  const model = typeof body.model === 'string' ? body.model : 'unknown';
  const costUsd = estimateCostUsd(model, inputTokens, outputTokens);

  if (inputTokens + outputTokens > 0) {
    db.query(
      'INSERT INTO usage_logs (user_id, tokens_used, cost_usd) VALUES ($1, $2, $3)',
      [user.id, inputTokens + outputTokens, costUsd]
    ).catch((err: unknown) => console.error('[usage_log]', err));
  }

  return NextResponse.json(data, { status: anthropicRes.status });
}
