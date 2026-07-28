# Dynasty Onboarding Tracker — Updated Vercel Folder

This version fixes the backend errors by using the Neon serverless driver and by safely parsing API error responses in the browser.

## Upload/deploy this folder as-is

Keep the exact file names and folder structure. Do not rename files to names such as `notes(1).js` or `index(32).html`.

## Required Vercel environment variables

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `OAUTH_REDIRECT_URI`
- `SESSION_SECRET`
- `GROQ_API_KEY`
- `DATABASE_URL` or `POSTGRES_URL`
- `SLACK_BOT_TOKEN` if live Slack refresh is enabled

After changing environment variables, redeploy the project.

## Database

Run `schema.sql` once in the Neon SQL Editor. It creates:

- `notes`
- `company_checks`
- `review_actions`

## Production callback

Use one production domain consistently. Example:

`https://onboarding-woad-pi.vercel.app/api/auth/callback`
