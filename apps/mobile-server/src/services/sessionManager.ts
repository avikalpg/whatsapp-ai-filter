import { Client, LocalAuth } from 'whatsapp-web.js';
import path from 'path';
import { pool } from '../db/index.js';
import { processIncomingMessage } from './messageProcessor.js';

interface SessionEntry {
  client: Client;
  status: 'linking' | 'ready' | 'disconnected';
}

const sessions = new Map<string, SessionEntry>();
const SESSION_DIR = process.env.SESSION_DIR ?? './.sessions';

async function updateDbStatus(
  userId: string,
  status: 'unlinked' | 'linking' | 'ready' | 'disconnected',
  extra?: { phone_number?: string; linked_at?: Date }
): Promise<void> {
  await pool.query(
    `UPDATE whatsapp_sessions
     SET status = $2, phone_number = COALESCE($3, phone_number),
         linked_at = COALESCE($4, linked_at), updated_at = NOW()
     WHERE user_id = $1`,
    [userId, status, extra?.phone_number ?? null, extra?.linked_at ?? null]
  );
}

export async function initLinkSession(
  userId: string,
  phoneNumber: string
): Promise<string> {
  // Destroy any existing session for this user
  await destroySession(userId);

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

    client.on('qr', async (qr) => {
      // whatsapp-web.js emits 'qr' before pairing code is available
      // We request a pairing code instead of using QR
      try {
        const code: string = await client.requestPairingCode(phoneNumber);
        if (!settled) {
          settled = true;
          sessions.set(userId, { client, status: 'linking' });
          await updateDbStatus(userId, 'linking');
          resolve(code);
        }
      } catch (err) {
        if (!settled) {
          settled = true;
          reject(err);
        }
      }
    });

    client.on('ready', async () => {
      const entry = sessions.get(userId);
      if (entry) entry.status = 'ready';
      await updateDbStatus(userId, 'ready', {
        phone_number: phoneNumber,
        linked_at: new Date(),
      });
      console.log(`[SessionManager] User ${userId} WhatsApp ready`);
      attachMessageHandler(userId, client);
    });

    client.on('disconnected', async () => {
      const entry = sessions.get(userId);
      if (entry) entry.status = 'disconnected';
      await updateDbStatus(userId, 'disconnected');
      sessions.delete(userId);
      console.log(`[SessionManager] User ${userId} disconnected`);
    });

    client.on('auth_failure', async () => {
      await updateDbStatus(userId, 'disconnected');
      sessions.delete(userId);
      if (!settled) {
        settled = true;
        reject(new Error('WhatsApp authentication failed'));
      }
    });

    client.initialize().catch((err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
  });
}

function attachMessageHandler(userId: string, client: Client): void {
  client.on('message_create', async (msg) => {
    // Only handle incoming messages (not our own sends)
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
    try {
      await entry.client.destroy();
    } catch {
      // ignore errors during destroy
    }
    sessions.delete(userId);
  }
  await updateDbStatus(userId, 'unlinked');
}

export function getSessionStatus(
  userId: string
): 'unlinked' | 'linking' | 'ready' | 'disconnected' {
  return sessions.get(userId)?.status ?? 'unlinked';
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

/** Re-attach event handlers on server restart for sessions that are already authenticated */
export async function restoreActiveSessions(): Promise<void> {
  const result = await pool.query<{ user_id: string; phone_number: string }>(
    `SELECT user_id, phone_number FROM whatsapp_sessions WHERE status = 'ready'`
  );

  for (const row of result.rows) {
    const userId = row.user_id;
    console.log(`[SessionManager] Restoring session for user ${userId}`);
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

    client.initialize().catch((err) => {
      console.error(`[SessionManager] Failed to restore session for ${userId}:`, err);
      sessions.delete(userId);
    });
  }
}
