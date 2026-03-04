import { Router, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { pool } from '../db/index.js';

const router = Router();
router.use(requireAuth);

interface GroupRuleInput {
  group_id: string;
  group_name: string;
  rule_type: 'include' | 'exclude';
}

function isValidGroupRules(rules: unknown): rules is GroupRuleInput[] {
  if (!Array.isArray(rules)) return false;
  return rules.every(
    (r) =>
      r &&
      typeof r.group_id === 'string' && r.group_id.trim() &&
      typeof r.group_name === 'string' && r.group_name.trim() &&
      (r.rule_type === 'include' || r.rule_type === 'exclude')
  );
}

router.get('/', async (req, res: Response): Promise<void> => {
  const userId = req.userId;
  try {
    const filtersResult = await pool.query(
      `SELECT id, name, prompt, category, include_dms, is_active, is_preset, created_at
       FROM filters WHERE user_id = $1 ORDER BY created_at ASC`,
      [userId]
    );

    const filters = filtersResult.rows;
    if (filters.length === 0) {
      res.json([]);
      return;
    }

    const filterIds = filters.map((f) => f.id);
    const rulesResult = await pool.query(
      `SELECT filter_id, group_id, group_name, rule_type
       FROM filter_group_rules WHERE filter_id = ANY($1)`,
      [filterIds]
    );

    const rulesByFilter = new Map<string, GroupRuleInput[]>();
    for (const rule of rulesResult.rows) {
      if (!rulesByFilter.has(rule.filter_id)) rulesByFilter.set(rule.filter_id, []);
      rulesByFilter.get(rule.filter_id)!.push(rule);
    }

    const response = filters.map((f) => ({
      ...f,
      group_rules: rulesByFilter.get(f.id) ?? [],
    }));

    res.json(response);
  } catch (err) {
    console.error('GET /filters error:', err);
    res.status(500).json({ error: 'Failed to fetch filters' });
  }
});

router.post('/', async (req, res: Response): Promise<void> => {
  const userId = req.userId;
  const { name, prompt, category = 'all', include_dms = true, group_rules = [] } =
    req.body as {
      name?: string;
      prompt?: string;
      category?: string;
      include_dms?: boolean;
      group_rules?: GroupRuleInput[];
    };

  if (!name || !prompt) {
    res.status(400).json({ error: 'name and prompt are required' });
    return;
  }

  if (!isValidGroupRules(group_rules)) {
    res.status(400).json({ error: 'group_rules contains invalid entries' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<{ id: string }>(
      `INSERT INTO filters (user_id, name, prompt, category, include_dms)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [userId, name, prompt, category, include_dms]
    );
    const filterId = result.rows[0].id;

    for (const rule of group_rules) {
      await client.query(
        `INSERT INTO filter_group_rules (filter_id, group_id, group_name, rule_type)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (filter_id, group_id) DO UPDATE SET rule_type = $4`,
        [filterId, rule.group_id, rule.group_name, rule.rule_type]
      );
    }

    await client.query('COMMIT');

    const filterResult = await pool.query(
      `SELECT id, name, prompt, category, include_dms, is_active, is_preset, created_at
       FROM filters WHERE id = $1`,
      [filterId]
    );
    res.status(201).json({ ...filterResult.rows[0], group_rules });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /filters error:', err);
    res.status(500).json({ error: 'Failed to create filter' });
  } finally {
    client.release();
  }
});

router.patch('/:id', async (req, res: Response): Promise<void> => {
  const userId = req.userId;
  const { id } = req.params;

  const { name, prompt, category, include_dms, is_active, group_rules } =
    req.body as Partial<{
      name: string;
      prompt: string;
      category: string;
      include_dms: boolean;
      is_active: boolean;
      group_rules: GroupRuleInput[];
    }>;

  if (group_rules !== undefined && !isValidGroupRules(group_rules)) {
    res.status(400).json({ error: 'group_rules contains invalid entries' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const ownership = await client.query(
      'SELECT id FROM filters WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (ownership.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Filter not found' });
      return;
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (name !== undefined) { updates.push(`name = $${idx++}`); values.push(name); }
    if (prompt !== undefined) { updates.push(`prompt = $${idx++}`); values.push(prompt); }
    if (category !== undefined) { updates.push(`category = $${idx++}`); values.push(category); }
    if (include_dms !== undefined) { updates.push(`include_dms = $${idx++}`); values.push(include_dms); }
    if (is_active !== undefined) { updates.push(`is_active = $${idx++}`); values.push(is_active); }

    if (updates.length > 0) {
      await client.query(
        `UPDATE filters SET ${updates.join(', ')} WHERE id = $${idx}`,
        [...values, id]
      );
    }

    if (group_rules !== undefined) {
      await client.query('DELETE FROM filter_group_rules WHERE filter_id = $1', [id]);
      for (const rule of group_rules) {
        await client.query(
          `INSERT INTO filter_group_rules (filter_id, group_id, group_name, rule_type)
           VALUES ($1, $2, $3, $4)`,
          [id, rule.group_id, rule.group_name, rule.rule_type]
        );
      }
    }

    await client.query('COMMIT');

    const filterResult = await pool.query(
      `SELECT id, name, prompt, category, include_dms, is_active, is_preset, created_at
       FROM filters WHERE id = $1`,
      [id]
    );
    const rulesResult = await pool.query(
      `SELECT group_id, group_name, rule_type FROM filter_group_rules WHERE filter_id = $1`,
      [id]
    );
    res.json({ ...filterResult.rows[0], group_rules: rulesResult.rows });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('PATCH /filters/:id error:', err);
    res.status(500).json({ error: 'Failed to update filter' });
  } finally {
    client.release();
  }
});

router.delete('/:id', async (req, res: Response): Promise<void> => {
  const userId = req.userId;
  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM filters WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Filter not found' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /filters/:id error:', err);
    res.status(500).json({ error: 'Failed to delete filter' });
  }
});

export default router;
