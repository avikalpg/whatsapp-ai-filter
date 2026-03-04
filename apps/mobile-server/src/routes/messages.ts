import { Router, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { pool } from '../db/index.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res: Response): Promise<void> => {
  const userId = req.userId;
  const { filter_id, cursor, limit = '20' } = req.query as {
    filter_id?: string;
    cursor?: string;
    limit?: string;
  };

  const pageSize = Math.min(parseInt(limit, 10) || 20, 100);

  try {
    const conditions: string[] = ['m.user_id = $1'];
    const values: unknown[] = [userId];
    let idx = 2;

    if (filter_id) {
      conditions.push(`m.filter_id = $${idx++}`);
      values.push(filter_id);
    }

    if (cursor) {
      // cursor is the received_at of the last item (ISO string)
      conditions.push(`m.received_at < $${idx++}`);
      values.push(new Date(cursor));
    }

    const where = conditions.join(' AND ');

    const result = await pool.query(
      `SELECT m.id, m.filter_id, f.name AS filter_name,
              m.group_id, m.group_name, m.sender_name,
              m.content, m.is_dm, m.reasoning, m.confidence,
              m.original_timestamp, m.received_at, m.is_read
       FROM filter_matches m
       JOIN filters f ON f.id = m.filter_id
       WHERE ${where}
       ORDER BY m.received_at DESC
       LIMIT $${idx}`,
      [...values, pageSize + 1]
    );

    const rows = result.rows;
    const hasMore = rows.length > pageSize;
    const matches = hasMore ? rows.slice(0, pageSize) : rows;

    const nextCursor = hasMore
      ? matches[matches.length - 1].received_at.toISOString()
      : null;

    res.json({ matches, next_cursor: nextCursor });
  } catch (err) {
    console.error('GET /messages error:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

router.patch('/:id/read', async (req, res: Response): Promise<void> => {
  const userId = req.userId;
  const { id } = req.params;

  try {
    const result = await pool.query(
      `UPDATE filter_matches SET is_read = TRUE
       WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, userId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error('PATCH /messages/:id/read error:', err);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

export default router;
