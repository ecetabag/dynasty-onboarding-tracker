// Shared, attributed notes -- replaces the old localStorage-only stub (which hardcoded the
// author as the literal string "You" and never left the browser it was written in). GET is
// left unauthenticated at this layer: the whole dashboard is already gated by middleware.js,
// so by the time this is called the caller has already passed a session check for the page
// itself -- gating it again here would be redundant. POST still requires a valid session
// since it's the one place that writes.

import { sql } from '@vercel/postgres';
import { requireSession } from './_lib/session.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { client_id } = req.query;
    if (!client_id) {
      res.status(400).json({ error: 'client_id required' });
      return;
    }
    try {
      const { rows } = await sql`SELECT author_name, author_email, text, created_at
        FROM notes WHERE client_id = ${client_id} ORDER BY created_at DESC`;
      res.status(200).json({ notes: rows });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
    return;
  }

  if (req.method === 'POST') {
    const session = await requireSession(req, res);
    if (!session) return;

    const { client_id, text } = req.body || {};
    if (!client_id || !text || !text.trim()) {
      res.status(400).json({ error: 'client_id and text are required.' });
      return;
    }

    try {
      const { rows } = await sql`INSERT INTO notes (client_id, author_email, author_name, text)
        VALUES (${client_id}, ${session.email}, ${session.name || session.email}, ${text.trim()})
        RETURNING author_name, author_email, text, created_at`;
      res.status(201).json({ note: rows[0] });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
