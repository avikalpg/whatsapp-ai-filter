import jwt from 'jsonwebtoken';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// Lazy-initialized so missing env vars crash at call time, not module load
// (prevents Next.js build failures when env vars aren't set at build time)
function getJwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET env var is not set');
  return s;
}

/**
 * ENCRYPTION_KEY must be a 64-character lowercase hex string (32 bytes).
 * Generate with: openssl rand -hex 32
 */
function getEncryptionKey(): Buffer {
  const k = process.env.ENCRYPTION_KEY;
  if (!k) throw new Error('ENCRYPTION_KEY env var is not set');
  const buf = Buffer.from(k, 'hex');
  if (buf.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY must be 64 hex characters (32 bytes), got ${k.length} chars → ${buf.length} bytes`
    );
  }
  return buf;
}

export interface JWTPayload {
  userId: string;
  deviceId: string;
}

export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '30d' });
}

export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, getJwtSecret()) as JWTPayload;
}

/**
 * Encrypt using AES-256-GCM (authenticated encryption).
 * Format: <iv_hex>:<authTag_hex>:<ciphertext_hex>
 * The auth tag protects against tampering — CBC does not provide this.
 */
export function encryptApiKey(apiKey: string): string {
  const iv = randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt AES-256-GCM ciphertext. Throws if auth tag verification fails.
 */
export function decryptApiKey(encrypted: string): string {
  const parts = encrypted.split(':');
  // Support old CBC format (2 parts) for backwards compatibility during migration
  if (parts.length === 2) {
    const [ivHex, dataHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const data = Buffer.from(dataHex, 'hex');
    const { createDecipheriv: cdiv } = require('crypto');
    const decipher = cdiv('aes-256-cbc', getEncryptionKey(), iv);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  }
  const [ivHex, authTagHex, dataHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export function extractToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  return auth.slice(7);
}
