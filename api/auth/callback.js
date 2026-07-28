// Exchanges the OAuth code for tokens, verifies the Google ID token, and enforces the
// @getdynasty.com restriction server-side by checking the email suffix directly -- not
// relying solely on the `hd` claim, which Google documents as a convenience hint rather
// than an authoritative authorization boundary.

import { jwtVerify, createRemoteJWKSet } from 'jose';
import { createSessionCookie } from '../_lib/session.js';

const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  const match = header.split(';').map(p => p.trim()).find(p => p.startsWith(name + '='));
  return match ? match.slice(name.length + 1) : null;
}

export default async function handler(req, res) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    res.status(501).send('Google OAuth not configured on this deployment.');
    return;
  }

  const { code, state } = req.query;
  const expectedState = readCookie(req, 'oauth_state');
  if (!code || !state || !expectedState || state !== expectedState) {
    res.status(400).send('Invalid or expired sign-in attempt. Please try signing in again.');
    return;
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.id_token) {
      res.status(502).send('Google sign-in failed during token exchange.');
      return;
    }

    const { payload } = await jwtVerify(tokenData.id_token, GOOGLE_JWKS, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: clientId,
    });

    const email = String(payload.email || '').toLowerCase();
    if (!payload.email_verified || !email.endsWith('@getdynasty.com')) {
      res.status(403).send('Only @getdynasty.com Google accounts can sign in to this dashboard.');
      return;
    }

    const sessionCookie = await createSessionCookie({ email, name: payload.name || email });
    res.setHeader('Set-Cookie', [
      sessionCookie,
      'oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0',
    ]);
    res.writeHead(302, { Location: '/' });
    res.end();
  } catch (err) {
    res.status(500).send('Sign-in failed: ' + (err.message || err));
  }
}
