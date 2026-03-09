import type { Message } from 'whatsapp-web.js';
import { pool } from '../db/index.js';
import { analyzeMessageWithLLM } from './llm/index.js';

interface FilterRow {
  id: string;
  prompt: string;
  include_dms: boolean;
}

interface GroupRuleRow {
  group_id: string;
  rule_type: 'include' | 'exclude';
}

export async function processIncomingMessage(userId: string, msg: Message): Promise<void> {
  const chat = await msg.getChat();
  const isGroup = chat.isGroup;
  const isDm = !isGroup;
  const groupId = isGroup ? chat.id._serialized : null;
  const groupName = isGroup ? chat.name : null;

  let senderName = msg.author ?? msg.from;
  try {
    const contact = await msg.getContact();
    senderName = contact.pushname ?? contact.name ?? senderName;
  } catch {
    // ignore
  }

  const body = msg.body;
  if (!body.trim()) return;

  // Load active filters for this user
  const filtersResult = await pool.query<FilterRow>(
    `SELECT id, prompt, include_dms FROM filters WHERE user_id = $1 AND is_active = TRUE`,
    [userId]
  );

  // Batch-fetch all group rules for active filters in one query
  const filterIds = filtersResult.rows.map((f) => f.id);
  const rulesByFilter = new Map<string, GroupRuleRow[]>();
  if (filterIds.length > 0 && isGroup) {
    const rulesResult = await pool.query<GroupRuleRow & { filter_id: string }>(
      `SELECT filter_id, group_id, rule_type FROM filter_group_rules WHERE filter_id = ANY($1)`,
      [filterIds]
    );
    for (const row of rulesResult.rows) {
      if (!rulesByFilter.has(row.filter_id)) rulesByFilter.set(row.filter_id, []);
      rulesByFilter.get(row.filter_id)!.push(row);
    }
  }

  for (const filter of filtersResult.rows) {
    // DM check
    if (isDm && !filter.include_dms) continue;

    // Group rule check
    if (isGroup && groupId) {
      const rules = rulesByFilter.get(filter.id) ?? [];
      if (rules.length > 0) {
        const includeRules = rules.filter((r) => r.rule_type === 'include');
        const excludeRules = rules.filter((r) => r.rule_type === 'exclude');

        if (includeRules.length > 0) {
          if (!includeRules.some((r) => r.group_id === groupId)) continue;
        } else if (excludeRules.length > 0) {
          if (excludeRules.some((r) => r.group_id === groupId)) continue;
        }
      }
    }

    // Analyze with LLM
    let result: Awaited<ReturnType<typeof analyzeMessageWithLLM>>;
    try {
      result = await analyzeMessageWithLLM(body, filter.prompt);
      if (!result.relevant) continue;
    } catch (err) {
      console.error(`[MessageProcessor] LLM error for filter ${filter.id}:`, err);
      continue;
    }

    try {
      await pool.query(
        `INSERT INTO filter_matches
           (user_id, filter_id, group_id, group_name, sender_name, content,
            is_dm, reasoning, confidence, original_timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          userId,
          filter.id,
          groupId,
          groupName,
          senderName,
          body,
          isDm,
          result.reasoning ?? null,
          result.confidence ?? null,
          new Date(msg.timestamp * 1000),
        ]
      );
      console.log(`[MessageProcessor] Match stored: filter="${filter.id}" confidence=${result.confidence}`);
    } catch (err) {
      console.error(`[MessageProcessor] DB write error for filter ${filter.id}:`, err);
    }
  }
}
