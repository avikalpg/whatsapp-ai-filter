import { Router, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  initLinkSession,
  destroySession,
  getGroups,
} from '../services/sessionManager.js';
import { pool } from '../db/index.js';

const router = Router();
router.use(requireAuth);

router.get('/status', async (req, res: Response): Promise<void> => {
  const userId = req.userId;
  try {
    const result = await pool.query(
      `SELECT status, phone_number, linked_at FROM whatsapp_sessions WHERE user_id = $1`,
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

router.post('/init-link', async (req, res: Response): Promise<void> => {
  const userId = req.userId;
  const { phone_number } = req.body as { phone_number?: string };

  if (!phone_number) {
    res.status(400).json({ error: 'phone_number is required' });
    return;
  }

  // Strip non-digits and ensure starts with country code
  const digits = phone_number.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) {
    res.status(400).json({ error: 'Invalid phone number format. Include country code (e.g. 14155551234).' });
    return;
  }

  try {
    const code = await initLinkSession(userId, digits);
    res.json({ code, expires_in_seconds: 60 });
  } catch (err: any) {
    console.error('POST /whatsapp/init-link error:', err);
    res.status(500).json({ error: err.message ?? 'Failed to initiate WhatsApp link' });
  }
});

router.delete('/unlink', async (req, res: Response): Promise<void> => {
  const userId = req.userId;
  try {
    await destroySession(userId);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /whatsapp/unlink error:', err);
    res.status(500).json({ error: 'Failed to unlink' });
  }
});

router.get('/groups', async (req, res: Response): Promise<void> => {
  const userId = req.userId;
  try {
    const groups = await getGroups(userId);
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
