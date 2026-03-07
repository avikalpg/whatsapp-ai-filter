import { NextRequest, NextResponse } from 'next/server';
import db from '@/utils/db';
import { extractToken, verifyToken, encryptApiKey } from '@/lib/auth';

async function authenticate(req: NextRequest): Promise<{ userId: string } | NextResponse> {
  const rawToken = extractToken(req);
  if (!rawToken) {
    return NextResponse.json(
      { error: 'Missing auth token', code: 'UNAUTHORIZED' },
      { status: 401 }
    );
  }
  try {
    return verifyToken(rawToken);
  } catch {
    return NextResponse.json(
      { error: 'Invalid or expired token', code: 'UNAUTHORIZED' },
      { status: 401 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'BAD_REQUEST' },
      { status: 400 }
    );
  }

  const { api_key } = body as { api_key?: unknown };

  if (!api_key || typeof api_key !== 'string' || !api_key.startsWith('sk-ant-')) {
    return NextResponse.json(
      { error: 'Invalid Claude API key format', code: 'INVALID_API_KEY' },
      { status: 400 }
    );
  }

  const encrypted = encryptApiKey(api_key);
  const result = await db.query(
    'UPDATE mobile_users SET custom_api_key = $1 WHERE id = $2',
    [encrypted, auth.userId]
  );

  if (result.rowCount === 0) {
    return NextResponse.json(
      { error: 'User not found', code: 'NOT_FOUND' },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof NextResponse) return auth;

  const result = await db.query(
    'UPDATE mobile_users SET custom_api_key = NULL WHERE id = $1',
    [auth.userId]
  );

  if (result.rowCount === 0) {
    return NextResponse.json(
      { error: 'User not found', code: 'NOT_FOUND' },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true });
}
