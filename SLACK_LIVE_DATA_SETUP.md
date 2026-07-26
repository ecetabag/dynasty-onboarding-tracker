# Enabling live Slack data on the Vercel deployment

This folder is a standalone copy of the dashboard plus one serverless function
(`api/slack-refresh.js`) that lets the Vercel-hosted site pull live Slack
messages, the same way the Cowork artifact does. Without this, the Vercel
copy only ever shows the snapshot baked in at export time.

## What you need

A Slack bot token with:
- `channels:history` scope (read messages)
- `users:read` scope (resolve display names)
- Installed to the getdynasty Slack workspace
- The bot invited into `#onboarding-notifications` and `#trust-funding`

If Dynasty doesn't have a Slack app for this yet, someone with Slack admin
rights creates one at api.slack.com/apps, adds those scopes under
"OAuth & Permissions," installs it to the workspace, and copies the
`xoxb-...` Bot User OAuth Token.

## Steps

1. Deploy this folder to Vercel (drag-and-drop in the dashboard, or `vercel deploy`
   from this directory with the Vercel CLI).
2. In the Vercel project: Settings -> Environment Variables -> add
   `SLACK_BOT_TOKEN` = `xoxb-...` (Production + Preview).
3. Redeploy (env var changes require a redeploy to take effect).
4. Open the deployed site and click "Refresh Slack now" -- it will call
   `/api/slack-refresh` instead of showing "Live Slack refresh unavailable."

## Notes / limits

- This endpoint only re-derives *live status* upgrades (Funding Completed,
  STA posted) the same way the in-Cowork refresh does -- it does not re-pull
  the full onboarding matrix or re-run the sign-up-date matching from
  #qsbs--purchases. For a full data refresh, rebuild and redeploy from Cowork.
- The bot token lives only in Vercel's encrypted environment variables; it is
  never included in the exported HTML or committed to any repo.
- If `SLACK_BOT_TOKEN` isn't set, the endpoint returns 501 and the dashboard
  falls back to "snapshot only" mode automatically -- nothing breaks.
