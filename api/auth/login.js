// Starts the Google OAuth flow, restricted to @getdynasty.com accounts (enforced again,
// server-side, in callback.js -- the `hd` param below is just a UI hint to Google's account
// picker, not a security boundary on its own).

export default async function handler(req, res) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.OAUTH_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    res.status(501).send('Google OAuth not configured on this deployment.');
    return;
  }

  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    hd: 'getdynasty.com',
    state,
    prompt: 'select_account',
  });

  res.setHeader('Set-Cookie', `oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=300`);
  res.writeHead(302, { Location: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
  res.end();
}
