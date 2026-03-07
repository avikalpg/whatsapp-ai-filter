import { NextRequest, NextResponse } from 'next/server';
import db from '@/utils/db';
import { extractToken, verifyToken, encryptApiKey } from '@/lib/auth';

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

  const { api_key } = await req.json();

  if (!api_key || typeof api_key !== 'string' || !api_key.startsWith('sk-ant-')) {
    return NextResponse.json(
      { error: 'Invalid Claude API key format', code: 'INVALID_API_KEY' },
      { status: 400 }
    );
  }

  const encrypted = encryptApiKey(api_key);

  await db.query(
    'UPDATE mobile_users SET custom_api_key = $1 WHERE id = $2',
    [encrypted, payload.userId]
  );

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
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

  await db.query(
    'UPDATE mobile_users SET custom_api_key = NULL WHERE id = $1',
    [payload.userId]
  );

  return NextResponse.json({ success: true });
}
