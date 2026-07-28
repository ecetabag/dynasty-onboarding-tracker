import { getSql } from './_lib/db.js';
import { requireSession } from './_lib/session.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  try {
    const sql = getSql();

    if (req.method === 'GET') {
      const { client_id } = req.query;
      if (!client_id) {
        return res.status(400).json({ error: 'client_id required' });
      }

      const rows = await sql`
        SELECT author_name, author_email, text, created_at
        FROM notes
        WHERE client_id = ${client_id}
        ORDER BY created_at DESC
      `;

      return res.status(200).json({ notes: rows });
    }

    if (req.method === 'POST') {
      const session = await requireSession(req, res);
      if (!session) return;

      const { client_id, text } = req.body || {};
      if (!client_id || !text || !text.trim()) {
        return res.status(400).json({ error: 'client_id and text are required.' });
      }

      const rows = await sql`
        INSERT INTO notes (client_id, author_email, author_name, text)
        VALUES (${client_id}, ${session.email}, ${session.name || session.email}, ${text.trim()})
        RETURNING author_name, author_email, text, created_at
      `;

      return res.status(201).json({ note: rows[0] });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Notes API error:', err);
    return res.status(500).json({ error: err?.message || String(err) });
  }
}
