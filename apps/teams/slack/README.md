# Slack app setup

The Slack app is a thin adapter over the capability registry: `/daysoff` and DMs go through the
same request pipeline as the web form, approvals call `decideLeaveRequest`, and "who's out" calls
`whoIsOut`. Code: `src/slack/`, routes under `src/app/api/slack/`.

## Click-path (about 10 minutes)

1. https://api.slack.com/apps → **Create New App** → **From a manifest** → pick your workspace.
2. Paste `manifest.yml` after replacing `https://YOUR-TEAMS-DOMAIN` with the teams URL
   (e.g. your Vercel production domain). **Next** → **Create**.
3. **Basic Information** → App Credentials: copy **Client ID**, **Client Secret**, **Signing Secret**.
4. Vercel → the teams project → **Settings** → **Environment Variables** → add
   `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET` (Production and Preview) →
   **Save** → **Deployments** → **Redeploy**.
5. In Slack app settings → **Event Subscriptions**: Slack verifies the request URL; it should show
   "Verified" (our `/api/slack/events` answers the challenge).
6. In Days Off as an admin: **Admin → Agents & API → Slack app → Add to Slack** → Allow.
7. Each person signs in once with Slack (that links their Slack user), or is matched by work
   email the first time they use `/daysoff`.

## How it behaves

- Every request is checked against `SLACK_SIGNING_SECRET` (HMAC, 5-minute window) before anything
  else; bad signatures get 401.
- Slack needs an answer within 3 seconds. Commands, clicks and events are acknowledged at once and
  the work runs after the response (`next/server` `after()`, which uses Vercel's `waitUntil`).
- Events are deduplicated by `event_id` (Slack retries with `X-Slack-Retry-Num`), clicks by
  message and action, so nothing happens twice. Requests also carry an idempotency key.
- People act as themselves (actor type human, client `slack` in the audit log), with the same
  permissions and rate limits as the web.
- Names and notes are escaped, so they can't become mentions or links.
- Status updates are opt-in per person ("My agents → Slack status"); the text is generic
  ("Out of office until Mon 3 Nov", "Out this afternoon", "Out for 3 h today") and expires by itself.

## Slackbot and MCP

Slack's Slackbot can also call our MCP server directly (Slack "Slackbot MCP client": Streamable
HTTP, 60 s tool timeout, per-call allow prompts, "Slack identity" auth). That covers questions and
drafting: balances, who's out, holidays, drafting a request for confirmation. It does not cover
what this app does: pushing approval requests into a manager's DMs with buttons, telling people
the decision, and setting status. Recommendation: keep both. The app for push and approvals,
MCP for conversation, once per-person sign-in (docs/teams/AGENT-AUTH.md) or Slack identity
auth is wired up.
