// Shared "Needs Your Input" decisions -- conflict resolution (live vs churned) and
// fuzzy Slack-match approve/reject. Replaces the old localStorage-only versions of both
// (dynasty_review_decisions, and status_override piggybacking on dynasty_overrides), so
// one person's decision is visible to everyone viewing the dashboard, not just their
// own browser. GET returns the whole table -- it's small and bounded by how many items
// are actually pending review, so fetching it in full on every load is fine.

import { sql } from '@vercel/postgres';
import { requireSession } from './_lib/session.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const { rows } = await sql`SELECT client_id, kind, decision, reason, decided_by_email, decided_by_name, decided_at
        FROM review_actions`;
      res.status(200).json({ actions: rows });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
    return;
  }

  if (req.method === 'POST') {
    const session = await requireSession(req, res);
    if (!session) return;

    const { client_id, kind, decision, reason } = req.body || {};
    if (!client_id || !kind || !decision) {
      res.status(400).json({ error: 'client_id, kind, and decision are required.' });
      return;
    }
    if (!['conflict', 'fuzzy_review'].includes(kind)) {
      res.status(400).json({ error: 'kind must be "conflict" or "fuzzy_review".' });
      return;
    }

    try {
      const { rows } = await sql`INSERT INTO review_actions (client_id, kind, decision, reason, decided_by_email, decided_by_name)
        VALUES (${client_id}, ${kind}, ${decision}, ${reason || null}, ${session.email}, ${session.name || session.email})
        ON CONFLICT (client_id, kind) DO UPDATE SET
          decision = EXCLUDED.decision, reason = EXCLUDED.reason,
          decided_by_email = EXCLUDED.decided_by_email, decided_by_name = EXCLUDED.decided_by_name,
          decided_at = now()
        RETURNING client_id, kind, decision, reason, decided_by_email, decided_by_name, decided_at`;
      res.status(200).json({ action: rows[0] });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
