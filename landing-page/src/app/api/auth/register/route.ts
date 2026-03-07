import { NextRequest, NextResponse } from 'next/server';
import db from '@/utils/db';
import { signToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { device_id } = await req.json();

    if (!device_id || typeof device_id !== 'string' || device_id.length < 8) {
      return NextResponse.json(
        { error: 'Invalid device_id', code: 'INVALID_DEVICE_ID' },
        { status: 400 }
      );
    }

    // Upsert: return existing user or create new one
    const result = await db.query<{ id: string; device_id: string; trial_expires_at: string }>(
      `INSERT INTO mobile_users (device_id)
       VALUES ($1)
       ON CONFLICT (device_id) DO UPDATE SET device_id = EXCLUDED.device_id
       RETURNING id, device_id, trial_expires_at`,
      [device_id]
    );

    const user = result.rows[0];
    const token = signToken({ userId: user.id, deviceId: user.device_id });

    return NextResponse.json({
      token,
      trial_expires_at: user.trial_expires_at,
    });
  } catch (err) {
    console.error('[/api/auth/register]', err);
    return NextResponse.json(
      { error: 'Internal server error', code: 'SERVER_ERROR' },
      { status: 500 }
    );
  }
}
