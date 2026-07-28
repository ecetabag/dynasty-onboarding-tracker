import { getSql, hasDatabaseConfig } from './_lib/db.js';
import { getSession } from './_lib/session.js';

export const maxDuration = 60;

const GROQ_MODEL = 'groq/compound-mini';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'GET') {
    const { client_id } = req.query;
    if (!hasDatabaseConfig()) {
      return res.status(200).json(client_id ? { check: null } : { checks: [] });
    }

    try {
      const sql = getSql();
      if (client_id) {
        const rows = await sql`
          SELECT company, verdict, rationale, checked_at
          FROM company_checks
          WHERE client_id = ${client_id}
          ORDER BY checked_at DESC
          LIMIT 1
        `;
        return res.status(200).json({ check: rows[0] || null });
      }

      const rows = await sql`
        SELECT DISTINCT ON (client_id)
          client_id, verdict, rationale, checked_at
        FROM company_checks
        ORDER BY client_id, checked_at DESC
      `;
      return res.status(200).json({ checks: rows });
    } catch (err) {
      console.error('Company status GET error:', err);
      return res.status(500).json({ error: err?.message || String(err) });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(501).json({ error: 'GROQ_API_KEY not configured on this deployment.' });
  }

  const { client_id, company } = req.body || {};
  if (!client_id || !company || !company.trim()) {
    return res.status(400).json({ error: 'client_id and company are required.' });
  }

  try {
    const cleanCompany = company.trim();
    const prompt = `Research the company "${cleanCompany}" and determine whether there is evidence it has shut down, gone out of business, been acquired and dissolved, or otherwise stopped operating. Check recent news, its website status, and shutdown announcements. Respond with ONLY a JSON object in exactly this shape: {"verdict":"likely_active"|"possibly_defunct"|"unknown","rationale":"one or two sentences explaining what you found"}.`;

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
      }),
    });

    const groqText = await groqRes.text();
    if (!groqRes.ok) {
      return res.status(502).json({
        error: `Groq API error (${groqRes.status}): ${groqText.slice(0, 300)}`,
      });
    }

    let data;
    try {
      data = JSON.parse(groqText);
    } catch {
      return res.status(502).json({ error: 'Groq returned an invalid API response.' });
    }

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
        // Keep the raw response as the rationale and use the unknown verdict.
      }
    }

    const session = await getSession(req).catch(() => null);
    const checkedAt = new Date().toISOString();

    if (hasDatabaseConfig()) {
      try {
        const sql = getSql();
        await sql`
          INSERT INTO company_checks
            (client_id, company, verdict, rationale, checked_by_email, checked_at)
          VALUES
            (${client_id}, ${cleanCompany}, ${verdict}, ${rationale}, ${session?.email || null}, ${checkedAt})
        `;
      } catch (dbErr) {
        console.warn('Failed to log company check:', dbErr?.message || dbErr);
      }
    }

    return res.status(200).json({ verdict, rationale, checked_at: checkedAt });
  } catch (err) {
    console.error('Company status POST error:', err);
    return res.status(500).json({ error: err?.message || String(err) });
  }
}
