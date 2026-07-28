// Vercel Edge Middleware -- runs before any request to this project is served, including
// the static index.html (which bakes the full client dataset into the page). This is what
// actually protects that data: without it, Google OAuth would only gate note-writing, and
// the dashboard itself would remain readable by anyone with the URL.
//
// Excluded from the matcher: /api/auth/* (the login/callback/logout flow itself must be
// reachable without a session) and favicon.ico.
//
// API requests get a 401 JSON response instead of a redirect, since a redirect would be
// followed transparently by fetch() and confuse callers expecting JSON.

import { jwtVerify } from 'jose';

export const config = {
  matcher: ['/((?!api/auth|favicon.ico).*)'],
};

function readCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  const match = cookieHeader.split(';').map(p => p.trim()).find(p => p.startsWith(name + '='));
  return match ? match.slice(name.length + 1) : null;
}

async function hasValidSession(req) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return false;
  const token = readCookie(req.headers.get('cookie'), 'session');
  if (!token) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(secret));
    return true;
  } catch {
    return false;
  }
}

export default async function middleware(req) {
  if (await hasValidSession(req)) return;

  const url = new URL(req.url);
  if (url.pathname.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'Sign in with your @getdynasty.com Google account first.' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }
  return Response.redirect(new URL('/api/auth/login', req.url), 302);
}
