// Vercel serverless function: pulls recent messages from one or more Slack channels
// using a bot token, and returns them in the same shape the dashboard's client-side
// parser already expects (a single "messages" string of "user: text [YYYY-MM-DD HH:MM:SS TZ]"
// lines, newest first) so the existing parseFundingAndNotary()/parseSta() JS logic can be
// reused unmodified between the Cowork MCP bridge and this standalone endpoint.
//
// Setup required (one-time, done by the Dynasty team in the Vercel project dashboard):
//   1. Create a Slack bot token (Slack app with `channels:history` and `users:read` scopes,
//      installed to the workspace, invited into #onboarding-notifications and #trust-funding).
//   2. In Vercel: Project Settings -> Environment Variables -> add SLACK_BOT_TOKEN = xoxb-...
//   3. Redeploy. This endpoint will then be live at /api/slack-refresh?channel_id=C0AAS4L76E5
//
// Without a token set, this endpoint returns 501 so the frontend can fall back gracefully
// to "snapshot only" mode instead of showing a raw error.

export default async function handler(req, res) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    res.status(501).json({ error: 'SLACK_BOT_TOKEN not configured on this deployment.' });
    return;
  }

  const channelId = req.query.channel_id;
  const limit = Math.min(parseInt(req.query.limit || '60', 10), 100);
  if (!channelId) {
    res.status(400).json({ error: 'channel_id query param is required.' });
    return;
  }

  try {
    const url = `https://slack.com/api/conversations.history?channel=${encodeURIComponent(channelId)}&limit=${limit}`;
    const slackRes = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await slackRes.json();
    if (!data.ok) {
      res.status(502).json({ error: `Slack API error: ${data.error}` });
      return;
    }

    // Resolve user/bot display names (best-effort, cached per-request)
    const userCache = new Map();
    async function resolveName(userId, msg) {
      if (msg.username) return msg.username;
      if (msg.bot_profile && msg.bot_profile.name) return msg.bot_profile.name;
      if (!userId) return '';
      if (userCache.has(userId)) return userCache.get(userId);
      try {
        const uRes = await fetch(`https://slack.com/api/users.info?user=${userId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const uData = await uRes.json();
        const name = uData.ok ? (uData.user.real_name || uData.user.name) : userId;
        userCache.set(userId, name);
        return name;
      } catch {
        return userId;
      }
    }

    const lines = [];
    for (const msg of data.messages || []) {
      const name = await resolveName(msg.user, msg);
      const text = (msg.text || '').replace(/\n/g, '\n');
      const tsMs = parseFloat(msg.ts) * 1000;
      const d = new Date(tsMs);
      // Format like "2026-01-27 19:23:47 PST" (approximate, using UTC offset label PST/PDT
      // is cosmetic only -- the client parser just needs the leading YYYY-MM-DD).
      const dateStr = d.toISOString().slice(0, 19).replace('T', ' ');
      lines.push(`${name}: ${text} [${dateStr} UTC]`);
    }

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    res.status(200).json({ messages: lines.join('\n\n'), pagination_info: '' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
