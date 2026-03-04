import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { requireAuth } from '../middleware/auth.js';
import {
  initLinkSession,
  getLinkingSession,
  consumeLinkingSession,
  destroySession,
  getGroups,
} from '../services/sessionManager.js';
import { pool } from '../db/index.js';

const router = Router();

// ── Unauthenticated: linking flow ─────────────────────────────────────────────

router.post('/init-link', async (req: Request, res: Response): Promise<void> => {
  const { phone_number } = req.body as { phone_number?: string };

  if (typeof phone_number !== 'string' || !phone_number.trim()) {
    res.status(400).json({ error: 'phone_number is required' });
    return;
  }

  const digits = phone_number.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) {
    res.status(400).json({ error: 'Invalid phone number. Include country code, digits only (e.g. 14155551234).' });
    return;
  }

  const sessionId = randomUUID();
  try {
    const code = await initLinkSession(digits, sessionId);
    res.json({ session_id: sessionId, code, expires_in_seconds: 60 });
  } catch (err) {
    console.error('POST /whatsapp/init-link error:', err);
    res.status(500).json({ error: 'Failed to initiate WhatsApp link' });
  }
});

router.get('/link-status', async (req: Request, res: Response): Promise<void> => {
  const { session_id } = req.query as { session_id?: string };

  if (!session_id) {
    res.status(400).json({ error: 'session_id is required' });
    return;
  }

  const session = getLinkingSession(session_id);
  if (!session) {
    res.status(404).json({ error: 'Session not found or expired' });
    return;
  }

  if (session.status !== 'ready' || !session.userId) {
    res.json({ status: 'pending' });
    return;
  }

  // Issue JWT — consume the session so repeated calls can't mint fresh tokens
  consumeLinkingSession(session_id);

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    res.status(500).json({ error: 'Server misconfiguration' });
    return;
  }
  const token = jwt.sign({ userId: session.userId }, secret, { expiresIn: '30d' });
  res.json({
    status: 'ready',
    token,
    user: { id: session.userId, phone_number: session.phoneNumber },
  });
});

// ── Authenticated ─────────────────────────────────────────────────────────────

router.get('/status', requireAuth, async (req, res: Response): Promise<void> => {
  const userId = req.userId;
  try {
    const result = await pool.query(
      `SELECT ws.status, u.phone_number, ws.linked_at
       FROM whatsapp_sessions ws
       JOIN users u ON u.id = ws.user_id
       WHERE ws.user_id = $1`,
      [userId]
    );
    if (result.rows.length === 0) {
      res.json({ status: 'unlinked', phone_number: null, linked_at: null });
      return;
    }
    const row = result.rows[0];
    res.json({ status: row.status, phone_number: row.phone_number, linked_at: row.linked_at });
  } catch (err) {
    console.error('GET /whatsapp/status error:', err);
    res.status(500).json({ error: 'Failed to fetch status' });
  }
});

router.delete('/unlink', requireAuth, async (req, res: Response): Promise<void> => {
  try {
    await destroySession(req.userId!);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /whatsapp/unlink error:', err);
    res.status(500).json({ error: 'Failed to unlink' });
  }
});

router.get('/groups', requireAuth, async (req, res: Response): Promise<void> => {
  try {
    const groups = await getGroups(req.userId!);
    res.json(groups);
  } catch (err: any) {
    const msg = err.message ?? 'Failed to fetch groups';
    if (msg.includes('not ready')) {
      res.status(409).json({ error: 'WhatsApp session is not ready. Link your account first.' });
    } else {
      res.status(500).json({ error: msg });
    }
  }
});

export default router;
