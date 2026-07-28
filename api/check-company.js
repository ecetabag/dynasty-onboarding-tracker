// Vercel serverless function: asks Groq (using a web-search-capable "compound" model) whether
// a client's company shows signs of having shut down, so the team can manually confirm whether
// they still need their trust. This never changes any client's status automatically -- it only
// returns a verdict + rationale for a human to review, and (best-effort) logs the result to
// Postgres so it doesn't need to be re-run every time someone looks.
//
// Setup required: add GROQ_API_KEY in Vercel's Environment Variables. Without it, this
// endpoint returns 501 so the frontend can show "not configured" instead of a raw error.

import { sql } from '@vercel/postgres';
import { getSession } from './_lib/session.js';

const GROQ_MODEL = 'groq/compound';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { client_id } = req.query;
    if (!process.env.POSTGRES_URL) {
      res.status(200).json(client_id ? { check: null } : { checks: [] });
      return;
    }
    try {
      if (client_id) {
        const { rows } = await sql`SELECT company, verdict, rationale, checked_at FROM company_checks
          WHERE client_id = ${client_id} ORDER BY checked_at DESC LIMIT 1`;
        res.status(200).json({ check: rows[0] || null });
        return;
      }
      // No client_id: return the latest check per client, for the backlog table's
      // "Company status" column -- one row per client, not the full check history.
      const { rows } = await sql`SELECT DISTINCT ON (client_id) client_id, verdict, rationale, checked_at
        FROM company_checks ORDER BY client_id, checked_at DESC`;
      res.status(200).json({ checks: rows });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    res.status(501).json({ error: 'GROQ_API_KEY not configured on this deployment.' });
    return;
  }

  const { client_id, company } = req.body || {};
  if (!client_id || !company || !company.trim()) {
    res.status(400).json({ error: 'client_id and company are required.' });
    return;
  }

  try {
    const prompt = `Research the company "${company.trim()}" and determine whether there's evidence it has ` +
      `shut down, gone out of business, been acquired and dissolved, or otherwise stopped operating. This is a ` +
      `small startup/company, so check for recent news, its website status, and any shutdown announcements. ` +
      `Respond with ONLY a JSON object, no other text, in exactly this shape: ` +
      `{"verdict": "likely_active" | "possibly_defunct" | "unknown", "rationale": "one or two sentences citing what you found"}.`;

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!groqRes.ok) {
      const errBody = await groqRes.text().catch(() => '');
      res.status(502).json({ error: `Groq API error (${groqRes.status}): ${errBody.slice(0, 300)}` });
      return;
    }

    const data = await groqRes.json();
    const raw = data.choices?.[0]?.message?.content || '';

    let verdict = 'unknown';
    let rationale = raw.trim() || 'No response content from Groq.';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (['likely_active', 'possibly_defunct', 'unknown'].includes(parsed.verdict)) {
          verdict = parsed.verdict;
        }
        if (parsed.rationale) rationale = String(parsed.rationale);
      } catch {
        // fall through with verdict 'unknown' and the raw text as rationale
      }
    }

    const session = await getSession(req).catch(() => null);
    const checkedAt = new Date().toISOString();

    if (process.env.POSTGRES_URL) {
      try {
        await sql`INSERT INTO company_checks (client_id, company, verdict, rationale, checked_by_email, checked_at)
          VALUES (${client_id}, ${company.trim()}, ${verdict}, ${rationale}, ${session?.email || null}, ${checkedAt})`;
      } catch (dbErr) {
        console.warn('Failed to log company check to Postgres:', dbErr.message || dbErr);
      }
    }

    res.status(200).json({ verdict, rationale, checked_at: checkedAt });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
