import { NextRequest, NextResponse } from 'next/server';
import db from '@/utils/db';
import { signToken } from '@/lib/auth';

/**
 * POST /api/auth/reissue
 *
 * Allows a device to obtain a fresh JWT using its device_id as the credential.
 * Called when:
 *   - The stored token is expired (30-day TTL)
 *   - The app is reinstalled and the SecureStore token is lost
 *
 * Security: device_id is a SHA-256 hash of a random UUID generated at first install
 * and stored in SecureStore — it functions as a long-lived device secret.
 * This is NOT guessable from public information.
 *
 * Returns 404 if device_id is not registered (device must call /api/auth/register first).
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'BAD_REQUEST' },
      { status: 400 }
    );
  }

  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'BAD_REQUEST' },
      { status: 400 }
    );
  }

  const { device_id } = body as { device_id?: unknown };

  // device_id is the sole credential on this route — enforce exact format:
  // SHA-256 hex digest = exactly 64 lowercase hex characters
  if (
    !device_id ||
    typeof device_id !== 'string' ||
    !/^[0-9a-f]{64}$/.test(device_id)
  ) {
    return NextResponse.json(
      { error: 'Invalid device_id: must be a 64-character hex string', code: 'INVALID_DEVICE_ID' },
      { status: 400 }
    );
  }

  try {
    const result = await db.query<{ id: string; device_id: string }>(
      'SELECT id, device_id FROM mobile_users WHERE device_id = $1',
      [device_id]
    );

    if (result.rows.length === 0) {
      // Unknown device — must register first
      return NextResponse.json(
        { error: 'Device not registered', code: 'NOT_REGISTERED' },
        { status: 404 }
      );
    }

    const user = result.rows[0];
    const token = signToken({ userId: user.id, deviceId: user.device_id });

    return NextResponse.json({ token });
  } catch (err) {
    console.error('[/api/auth/reissue]', err);
    return NextResponse.json(
      { error: 'Internal server error', code: 'SERVER_ERROR' },
      { status: 500 }
    );
  }
}
