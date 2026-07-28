// Shared session helpers, used by api/auth/*.js, api/notes.js, api/check-company.js,
// and middleware.js. The session is a compact JWT (HS256) signed with SESSION_SECRET,
// stored as an HttpOnly cookie -- no server-side session table, so logout only clears
// the cookie client-side (a copied token stays valid until it expires). Acceptable
// tradeoff for an internal tool at this scale.

import { SignJWT, jwtVerify } from 'jose';

const COOKIE_NAME = 'session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET not configured on this deployment.');
  return new TextEncoder().encode(secret);
}

export async function createSessionCookie(user) {
  const jwt = await new SignJWT({ email: user.email, name: user.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecretKey());
  return `${COOKIE_NAME}=${jwt}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  const match = header.split(';').map(p => p.trim()).find(p => p.startsWith(name + '='));
  return match ? match.slice(name.length + 1) : null;
}

export async function getSession(req) {
  const token = readCookie(req, COOKIE_NAME);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return { email: payload.email, name: payload.name };
  } catch {
    return null;
  }
}

// For API routes: resolves the session or sends a 401 and returns null.
// Callers must `if (!session) return;` immediately after calling this.
export async function requireSession(req, res) {
  const session = await getSession(req);
  if (!session) {
    res.status(401).json({ error: 'Sign in with your @getdynasty.com Google account first.' });
    return null;
  }
  return session;
}
