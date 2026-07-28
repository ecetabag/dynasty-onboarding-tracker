import { getSession } from '../_lib/session.js';

export default async function handler(req, res) {
  const session = await getSession(req);
  if (!session) {
    res.status(401).json({ error: 'Not signed in.' });
    return;
  }
  res.status(200).json(session);
}
