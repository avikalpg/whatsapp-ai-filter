import { Router, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { pool } from '../db/index.js';

const router = Router();
router.use(requireAuth);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get('/', async (req, res: Response): Promise<void> => {
  const userId = req.userId;
  const { filter_id, cursor, limit = '20' } = req.query as {
    filter_id?: string;
    cursor?: string;
    limit?: string;
  };

  const parsedLimit = parseInt(limit, 10);
  if (isNaN(parsedLimit) || parsedLimit <= 0) {
    res.status(400).json({ error: 'limit must be a positive integer' });
    return;
  }
  const pageSize = Math.min(parsedLimit, 100);

  if (filter_id && !UUID_RE.test(filter_id)) {
    res.status(400).json({ error: 'filter_id must be a valid UUID' });
    return;
  }

  // Cursor is encoded as "received_at_iso|id" for deterministic ordering
  let cursorTime: Date | null = null;
  let cursorId: string | null = null;
  if (cursor) {
    const parts = cursor.split('|');
    if (parts.length !== 2 || !UUID_RE.test(parts[1])) {
      res.status(400).json({ error: 'Invalid cursor format' });
      return;
    }
    cursorTime = new Date(parts[0]);
    cursorId = parts[1];
    if (isNaN(cursorTime.getTime())) {
      res.status(400).json({ error: 'Invalid cursor format' });
      return;
    }
  }

  try {
    const conditions: string[] = ['m.user_id = $1'];
    const values: unknown[] = [userId];
    let idx = 2;

    if (filter_id) {
      conditions.push(`m.filter_id = $${idx++}`);
      values.push(filter_id);
    }

    if (cursorTime && cursorId) {
      // Composite cursor: rows before (received_at, id) in descending order
      conditions.push(`(m.received_at < $${idx} OR (m.received_at = $${idx} AND m.id < $${idx + 1}))`);
      values.push(cursorTime, cursorId);
      idx += 2;
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
       ORDER BY m.received_at DESC, m.id DESC
       LIMIT $${idx}`,
      [...values, pageSize + 1]
    );

    const rows = result.rows;
    const hasMore = rows.length > pageSize;
    const matches = hasMore ? rows.slice(0, pageSize) : rows;

    const lastRow = matches[matches.length - 1];
    const nextCursor = hasMore
      ? `${lastRow.received_at.toISOString()}|${lastRow.id}`
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

  if (!UUID_RE.test(id)) {
    res.status(400).json({ error: 'Invalid message id' });
    return;
  }

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
