# Setting up sign-in, shared notes, and the company status check

This covers the three pieces added on top of the base dashboard + Slack refresh (see
`SLACK_LIVE_DATA_SETUP.md` for that one). All three need one-time setup in the Vercel
project and Google Cloud before they'll work on a deployment.

## 1. Google sign-in (protects the whole dashboard)

The dashboard now requires signing in with a `@getdynasty.com` Google account before
it loads at all -- the client list (names, emails, status) is baked into the page, so
gating just the notes feature wouldn't actually protect that data.

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create
   an **OAuth 2.0 Client ID** of type "Web application."
2. Add an **Authorized redirect URI**: `https://<your-deployment-domain>/api/auth/callback`
   (use your actual Vercel production domain -- this must match exactly, byte for byte,
   whatever you set as `OAUTH_REDIRECT_URI` below).
3. If your Google Workspace supports it, restrict the OAuth consent screen's user type
   to "Internal" -- this is an extra layer on top of (not a replacement for) the
   `@getdynasty.com` email check the app does itself in `api/auth/callback.js`.
4. Copy the Client ID and Client Secret.
5. In Vercel: Settings -> Environment Variables (Production + Preview), add:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `OAUTH_REDIRECT_URI` -- the exact URL from step 2
   - `SESSION_SECRET` -- a random secret used to sign session cookies, e.g. generate one with:
     ```bash
     openssl rand -base64 32
     ```

**Note:** sign-in only works on your production domain, since Google requires an exact,
pre-registered redirect URI and Vercel preview-deployment URLs are unique per-deployment.
Preview deployments simply won't support login -- acceptable for an internal tool.

## 2. Shared notes storage (Vercel Postgres)

1. In the Vercel dashboard, provision a **Postgres** database and link it to this project.
   This automatically adds a `POSTGRES_URL` environment variable (and a few related ones)
   for you -- nothing to copy by hand.
2. Open the database's **Query** tab in the Vercel dashboard and run the contents of
   `schema.sql` (in this repo) once, to create the `notes`, `company_checks`, and
   `review_actions` tables.
   There's no migration tooling here -- it's a one-time manual step.
3. Redeploy so the app picks up the new environment variables.

Once this is done, signed-in users can leave notes on any client from the drawer, and
everyone viewing the dashboard sees the same notes, with the author's name and timestamp.
The same database also backs "Needs Your Input" (resolving live-vs-churned conflicts and
approving/rejecting fuzzy Slack matches) -- those decisions are shared the same way, so
once one person resolves something there, it's resolved for everyone.

## 3. Company status check (Groq)

1. Get an API key from [Groq](https://console.groq.com/keys).
2. In Vercel: add `GROQ_API_KEY` as an environment variable (Production + Preview).
3. Redeploy.

Once configured, the "Check company status" button in a client's drawer (and the
"Check all active companies" button in the header) will ask Groq to research whether
that company shows signs of having shut down. Results are always a suggestion for a
human to confirm -- nothing here changes a client's status automatically. Results are
logged to the `company_checks` table (see step 2 above) so a company doesn't need to be
re-checked every time someone looks.

## Summary of environment variables

| Var | Used by | Purpose |
|---|---|---|
| `SLACK_BOT_TOKEN` | `api/slack-refresh.js` | Live Slack refresh (see `SLACK_LIVE_DATA_SETUP.md`) |
| `GOOGLE_CLIENT_ID` | `api/auth/*.js` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | `api/auth/callback.js` | Google OAuth client secret (server-side only) |
| `OAUTH_REDIRECT_URI` | `api/auth/login.js`, `api/auth/callback.js` | Fixed, exact-match OAuth callback URL |
| `SESSION_SECRET` | `api/_lib/session.js`, `middleware.js` | Signs/verifies the session cookie |
| `POSTGRES_URL` | `api/notes.js`, `api/check-company.js` | Auto-added by Vercel Postgres |
| `GROQ_API_KEY` | `api/check-company.js` | Company status research |

Without any one of these set, the corresponding feature fails gracefully (501 for the
missing-config APIs, or a "not signed in" banner) rather than breaking the rest of the
dashboard.
