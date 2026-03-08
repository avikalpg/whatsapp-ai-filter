import { NextRequest, NextResponse } from 'next/server';
import db from '@/utils/db';
import { extractToken, verifyToken } from '@/lib/auth';

/**
 * POST /api/auth/activate
 *
 * Called by the mobile app once WhatsApp linking succeeds (pairing code confirmed).
 * Sets whatsapp_linked = TRUE and starts the 24-hour free trial clock.
 * Idempotent — if already activated, returns the existing expiry.
 */
export async function POST(req: NextRequest) {
  const rawToken = extractToken(req);
  if (!rawToken) {
    return NextResponse.json(
      { error: 'Missing auth token', code: 'UNAUTHORIZED' },
      { status: 401 }
    );
  }

  let payload: { userId: string };
  try {
    payload = verifyToken(rawToken);
  } catch {
    return NextResponse.json(
      { error: 'Invalid or expired token', code: 'UNAUTHORIZED' },
      { status: 401 }
    );
  }

  const result = await db.query<{ trial_expires_at: string }>(
    `UPDATE mobile_users
     SET
       whatsapp_linked = TRUE,
       trial_expires_at = CASE
         WHEN trial_expires_at IS NULL THEN NOW() + INTERVAL '24 hours'
         ELSE trial_expires_at
       END
     WHERE id = $1
     RETURNING trial_expires_at`,
    [payload.userId]
  );

  if (result.rows.length === 0) {
    return NextResponse.json(
      { error: 'User not found', code: 'NOT_FOUND' },
      { status: 404 }
    );
  }

  return NextResponse.json({ trial_expires_at: result.rows[0].trial_expires_at });
}
