import wwebjs from 'whatsapp-web.js';
import type { Client as ClientType } from 'whatsapp-web.js';
import path from 'path';
import { pool } from '../db/index.js';
import { processIncomingMessage } from './messageProcessor.js';

const { Client, LocalAuth } = wwebjs;

const SESSION_DIR = process.env.SESSION_DIR ?? './.sessions';

// Established sessions keyed by userId
interface SessionEntry {
  client: ClientType;
  status: 'linking' | 'ready' | 'disconnected';
}
const sessions = new Map<string, SessionEntry>();

// In-progress pairing flows keyed by sessionId
interface LinkingEntry {
  phoneNumber: string;
  status: 'pending' | 'ready';
  userId?: string;
}
const linkingSessions = new Map<string, LinkingEntry>();

async function updateDbStatus(
  userId: string,
  status: 'unlinked' | 'linking' | 'ready' | 'disconnected',
  extra?: { linked_at?: Date }
): Promise<void> {
  await pool.query(
    `UPDATE whatsapp_sessions
     SET status = $2, linked_at = COALESCE($3, linked_at), updated_at = NOW()
     WHERE user_id = $1`,
    [userId, status, extra?.linked_at ?? null]
  );
}

/** Find-or-create a user by phone number; seed preset filters on first creation. */
async function findOrCreateUser(phoneNumber: string): Promise<string> {
  const existing = await pool.query<{ id: string }>(
    'SELECT id FROM users WHERE phone_number = $1',
    [phoneNumber]
  );
  if (existing.rows.length > 0) return existing.rows[0].id;

  // New user — create with preset filters inside a transaction
  const { PRESET_FILTERS } = await import('../presets.js');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<{ id: string }>(
      'INSERT INTO users (phone_number) VALUES ($1) RETURNING id',
      [phoneNumber]
    );
    const userId = result.rows[0].id;
    await client.query(
      'INSERT INTO whatsapp_sessions (user_id, phone_number) VALUES ($1, $2)',
      [userId, phoneNumber]
    );
    for (const preset of PRESET_FILTERS) {
      await client.query(
        `INSERT INTO filters (user_id, name, prompt, category, include_dms, is_preset)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, preset.name, preset.prompt, preset.category, preset.include_dms, preset.is_preset]
      );
    }
    await client.query('COMMIT');
    return userId;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Start a WhatsApp pairing flow. Returns the 8-character pairing code.
 * sessionId is a caller-generated UUID used to poll for completion.
 */
export async function initLinkSession(
  phoneNumber: string,
  sessionId: string
): Promise<string> {
  // Resolve userId BEFORE creating the client so LocalAuth uses userId as clientId,
  // matching restoreActiveSessions and surviving server restarts.
  const userId = await findOrCreateUser(phoneNumber);
  await updateDbStatus(userId, 'linking');
  linkingSessions.set(sessionId, { phoneNumber, status: 'pending' });

  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: userId,
      dataPath: path.resolve(SESSION_DIR),
    }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });

  return new Promise((resolve, reject) => {
    let settled = false;

    const timeoutId = setTimeout(() => {
      if (!settled) {
        settled = true;
        client.destroy().catch(() => {});
        linkingSessions.delete(sessionId);
        reject(new Error('WhatsApp linking timed out after 2 minutes'));
      }
    }, 120_000);

    client.on('qr', async () => {
      try {
        const code: string = await client.requestPairingCode(phoneNumber);
        if (!settled) {
          settled = true;
          clearTimeout(timeoutId);
          resolve(code);
        }
      } catch (err) {
        if (!settled) { settled = true; clearTimeout(timeoutId); reject(err); }
      }
    });

    client.on('ready', async () => {
      try {
        sessions.set(userId, { client, status: 'ready' });
        linkingSessions.set(sessionId, { phoneNumber, status: 'ready', userId });
        await updateDbStatus(userId, 'ready', { linked_at: new Date() });
        console.log(`[SessionManager] User ${userId} (${phoneNumber}) ready`);
        attachMessageHandler(userId, client);
      } catch (err) {
        console.error('[SessionManager] Error on ready:', err);
      }
    });

    client.on('disconnected', async () => {
      await updateDbStatus(userId, 'disconnected');
      sessions.delete(userId);
      linkingSessions.delete(sessionId);
    });

    client.on('auth_failure', async () => {
      await updateDbStatus(userId, 'disconnected');
      linkingSessions.delete(sessionId);
      if (!settled) { settled = true; clearTimeout(timeoutId); reject(new Error('WhatsApp authentication failed')); }
    });

    client.initialize().catch((err) => {
      if (!settled) { settled = true; clearTimeout(timeoutId); reject(err); }
    });
  });
}

/** Returns the linking session status + userId when ready, or null if not found. */
export function getLinkingSession(sessionId: string): LinkingEntry | null {
  return linkingSessions.get(sessionId) ?? null;
}

/** Removes a linking session after a token has been issued to prevent repeated minting. */
export function consumeLinkingSession(sessionId: string): void {
  linkingSessions.delete(sessionId);
}

function attachMessageHandler(userId: string, client: ClientType): void {
  client.on('message_create', async (msg) => {
    if (msg.fromMe) return;
    try {
      await processIncomingMessage(userId, msg);
    } catch (err) {
      console.error(`[SessionManager] Message processing error for user ${userId}:`, err);
    }
  });
}

export async function destroySession(userId: string): Promise<void> {
  const entry = sessions.get(userId);
  if (entry) {
    try { await entry.client.destroy(); } catch { /* ignore */ }
    sessions.delete(userId);
  }
  await updateDbStatus(userId, 'unlinked');
}

export async function getGroups(userId: string): Promise<{ id: string; name: string }[]> {
  const entry = sessions.get(userId);
  if (!entry || entry.status !== 'ready') {
    throw new Error('WhatsApp session is not ready');
  }
  const chats = await entry.client.getChats();
  return chats
    .filter((c) => c.isGroup)
    .map((c) => ({ id: c.id._serialized, name: c.name }));
}

export async function restoreActiveSessions(): Promise<void> {
  const result = await pool.query<{ user_id: string; phone_number: string }>(
    `SELECT ws.user_id, u.phone_number
     FROM whatsapp_sessions ws
     JOIN users u ON u.id = ws.user_id
     WHERE ws.status = 'ready'`
  );

  for (const row of result.rows) {
    const userId = row.user_id;
    console.log(`[SessionManager] Restoring session for user ${userId}`);
    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: userId,
        dataPath: path.resolve(SESSION_DIR),
      }),
      puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] },
    });

    sessions.set(userId, { client, status: 'linking' });

    client.on('ready', async () => {
      const entry = sessions.get(userId);
      if (entry) entry.status = 'ready';
      console.log(`[SessionManager] Restored session ready for user ${userId}`);
      attachMessageHandler(userId, client);
    });

    client.on('disconnected', async () => {
      await updateDbStatus(userId, 'disconnected');
      sessions.delete(userId);
    });

    client.on('auth_failure', async () => {
      console.error(`[SessionManager] Auth failure restoring session for user ${userId}`);
      await updateDbStatus(userId, 'disconnected');
      sessions.delete(userId);
    });

    client.initialize().catch((err) => {
      console.error(`[SessionManager] Failed to restore session for ${userId}:`, err);
      updateDbStatus(userId, 'disconnected').catch(() => {});
      sessions.delete(userId);
    });
  }
}
