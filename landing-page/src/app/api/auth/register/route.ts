import { NextRequest, NextResponse } from 'next/server';
import db from '@/utils/db';
import { signToken } from '@/lib/auth';

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

  const { device_id } = body as { device_id?: unknown };

  if (
    !device_id ||
    typeof device_id !== 'string' ||
    device_id.length < 8 ||
    device_id.length > 255
  ) {
    return NextResponse.json(
      { error: 'Invalid device_id', code: 'INVALID_DEVICE_ID' },
      { status: 400 }
    );
  }

  try {
    // Insert only — do not upsert. A known device_id must not yield a new JWT.
    const result = await db.query<{ id: string; device_id: string }>(
      `INSERT INTO mobile_users (device_id)
       VALUES ($1)
       ON CONFLICT (device_id) DO NOTHING
       RETURNING id, device_id`,
      [device_id]
    );

    if (result.rows.length === 0) {
      // device_id already registered — client should use stored token
      return NextResponse.json(
        { error: 'Device already registered', code: 'ALREADY_REGISTERED' },
        { status: 409 }
      );
    }

    const user = result.rows[0];
    const token = signToken({ userId: user.id, deviceId: user.device_id });

    return NextResponse.json({ token });
  } catch (err) {
    console.error('[/api/auth/register]', err);
    return NextResponse.json(
      { error: 'Internal server error', code: 'SERVER_ERROR' },
      { status: 500 }
    );
  }
}
