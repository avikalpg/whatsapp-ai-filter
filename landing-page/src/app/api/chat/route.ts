import { NextRequest, NextResponse } from 'next/server';
import db from '@/utils/db';
import { extractToken, verifyToken, decryptApiKey } from '@/lib/auth';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

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
    trial_expires_at: string;
    custom_api_key: string | null;
  }>(
    'SELECT id, trial_expires_at, custom_api_key FROM mobile_users WHERE id = $1',
    [payload.userId]
  );

  if (userResult.rows.length === 0) {
    return NextResponse.json(
      { error: 'User not found', code: 'NOT_FOUND' },
      { status: 404 }
    );
  }

  const user = userResult.rows[0];
  const trialActive = new Date(user.trial_expires_at) > new Date();
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
    : process.env.ANTHROPIC_API_KEY!;

  // Forward request to Anthropic
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'BAD_REQUEST' },
      { status: 400 }
    );
  }

  const anthropicRes = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
  });

  const data = await anthropicRes.json();

  // Log token usage (fire-and-forget, don't block response)
  const tokensUsed =
    (data as { usage?: { input_tokens?: number; output_tokens?: number } })?.usage?.input_tokens ?? 0 +
    ((data as { usage?: { input_tokens?: number; output_tokens?: number } })?.usage?.output_tokens ?? 0);

  if (tokensUsed > 0) {
    db.query('INSERT INTO usage_logs (user_id, tokens_used) VALUES ($1, $2)', [
      user.id,
      tokensUsed,
    ]).catch((err: unknown) => console.error('[usage_log]', err));
  }

  return NextResponse.json(data, { status: anthropicRes.status });
}
