import { getSql } from './_lib/db.js';
import { requireSession } from './_lib/session.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  try {
    const sql = getSql();

    if (req.method === 'GET') {
      const rows = await sql`
        SELECT client_id, kind, decision, reason,
               decided_by_email, decided_by_name, decided_at
        FROM review_actions
      `;
      return res.status(200).json({ actions: rows });
    }

    if (req.method === 'POST') {
      const session = await requireSession(req, res);
      if (!session) return;

      const { client_id, kind, decision, reason } = req.body || {};
      if (!client_id || !kind || !decision) {
        return res.status(400).json({ error: 'client_id, kind, and decision are required.' });
      }
      if (!['conflict', 'fuzzy_review'].includes(kind)) {
        return res.status(400).json({ error: 'kind must be "conflict" or "fuzzy_review".' });
      }

      const rows = await sql`
        INSERT INTO review_actions
          (client_id, kind, decision, reason, decided_by_email, decided_by_name)
        VALUES
          (${client_id}, ${kind}, ${decision}, ${reason || null}, ${session.email}, ${session.name || session.email})
        ON CONFLICT (client_id, kind) DO UPDATE SET
          decision = EXCLUDED.decision,
          reason = EXCLUDED.reason,
          decided_by_email = EXCLUDED.decided_by_email,
          decided_by_name = EXCLUDED.decided_by_name,
          decided_at = now()
        RETURNING client_id, kind, decision, reason,
                  decided_by_email, decided_by_name, decided_at
      `;

      return res.status(200).json({ action: rows[0] });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Review actions API error:', err);
    return res.status(500).json({ error: err?.message || String(err) });
  }
}
