# Security: Days Off for Teams

What protects customer data today, and what a SOC 2 Type I/II audit would still need. Written for
the owner and for security questionnaires. Last reviewed 2026-10-30 (Phase 6; regulated coverage reviewed in RC Phase 6).

## Data we hold

| Data | Where | Notes |
|---|---|---|
| Workspace, teams, locations, policies | Postgres (Neon in production) | `org_id` on every row |
| Members: name, email (optional), role, team, start date, work week, Slack user id | Postgres | No home address, birth date, salary or government ids |
| Leave requests, balance ledger | Postgres | Sick leave stores no reason or note unless the org turns notes on; then only the approver and admins see them |
| Audit log | Postgres | Append-only in code (no update or delete paths); who did what, as which actor, on whose behalf |
| Agent credentials | Postgres | SHA-256 hashes only; prefixes kept for display |
| Webhook signing secrets | Postgres | AES-256-GCM, key derived from `SESSION_SECRET` (HKDF) |
| AI usage | Postgres | Token counts and cost per org and feature; prompts and outputs are not stored |
| Handbook import cache | Postgres | Extracted policy JSON keyed by content hash, with the short sentences cited as evidence; the full handbook text is not stored |

## Controls that exist

**Tenant isolation.** Every business query filters by the caller's org, including lookups by id. A
test attacks every id-taking capability from another org as a person, as a personal token and as a
service API key, and checks the target org is byte-for-byte unchanged
(`src/capabilities/isolation.test.ts`). A registry test fails if a new id-taking capability has no
attack.

**Authorization.** One capability registry (R1): web, REST, MCP and the assistant all go through
`invokeCapability`, which checks scope and role, validates input, runs the handler, validates output
and writes the audit row. Roles map to scopes; tokens get at most their owner's scopes. Service agents
can never hold `admin` or `leave:approve` and can only draft for a named member (R3). Agents start at
"Draft" autonomy; raising it is an audited admin action.

**Authentication.**
- People: Sign in with Slack (OpenID Connect, state + nonce). Session is an HMAC-signed cookie
  (`HttpOnly`, `Secure` in production, `SameSite=Lax`, 14 days). Role and membership are re-read from
  the database on every request, so a removed member is out at once.
- Dev login exists for demos and e2e only and 404s unless `DEV_LOGIN=1`.
- Agents: personal tokens, API keys and OAuth client credentials (`docs/teams/AGENT-AUTH.md`). 192-bit
  random, hashed, shown once, revocable, `last_used_at` tracked. One kill switch stops all agent access
  for a workspace.

**CSRF.** Server actions use Next.js's built-in origin check. Cookie-authenticated REST and sign-out
refuse requests whose `Origin` or `Sec-Fetch-Site` shows another site (`src/lib/sameOrigin.ts`).
Bearer-token routes don't use cookies.

**Rate limits.** Fixed one-minute windows in Postgres, so they hold across serverless instances.
Read 120, write 30, AI 10, planner 10, auth 20 per minute (`RATE_LIMIT_<CLASS>` overrides). They are
counted per member for people, per token for agents, and per IP for sign-in, the OAuth token endpoint
and failed bearer authentication (throttles token guessing). A 429 carries `Retry-After`.
AI also has a per-org daily token budget and a global monthly budget (`AI_MONTHLY_TOKEN_BUDGET`) that
disables AI features gracefully.

**Input and output handling.** Zod schemas on every input and output. Text people wrote (names, notes,
handbooks) is returned to agents as `{"untrusted_text": …}` and wrapped as data in AI prompts (R5);
tests check injection strings change nothing. The LLM never produces a number the UI shows (D1).

**Webhooks.** Standard Webhooks HMAC signatures with timestamps. Destinations must be https and
public: private, loopback and link-local addresses are refused when the URL is saved and again after
DNS resolution before each send. Redirects are not followed. Payloads exclude notes and show
health-related leave only as "out".

**HTTP headers.** On every response: Content-Security-Policy (same-origin, `frame-ancestors 'none'`,
`object-src 'none'`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, a restrictive `Permissions-Policy`, HSTS.

**Secrets.** Only from environment variables: `SESSION_SECRET`, `DATABASE_URL`, `SLACK_CLIENT_ID`,
`SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET` (Phase 7), `ANTHROPIC_API_KEY`, `CRON_SECRET`. None are
in the repository. The cron route compares its secret in constant time.

**Logging.** Server logs carry error class names only (five `console.error` calls, all checked):
no tokens, no request bodies, no names or emails. The audit log is the record of business actions.

**Data rights.** Admins export everything for the org or one member (CSV/JSON) and can delete a
member or the whole workspace (Phase 6, `docs/teams/PRIVACY.md`).

**Housekeeping.** A daily job prunes rate-limit windows, expired OAuth access tokens and webhook
deliveries older than 90 days, and marks expired drafts.

**Dependencies.** `npm audit --omit=dev`: 0 vulnerabilities (2026-10-30). The full audit lists 4
moderate advisories in `esbuild@0.18`, pulled in by `drizzle-kit` (a developer CLI for migrations,
never deployed); the fix is a breaking drizzle-kit downgrade, so it's accepted until drizzle-kit drops
`@esbuild-kit`.

## Regulated coverage (childcare and clinics)

Reviewed 2026-10-30, RC Phase 6. The tests named here are in `apps/teams/src`.

| Data | Where | Notes |
|---|---|---|
| Rooms or posts, and demand per room and time block | Postgres | Children are **counts per age group** only, never names, birthdays or anything that identifies a child. The schema has no column that could hold one. |
| Rule packs | Postgres | Each rule cites its source, or is marked "needs verification" or "your policy". Drafts from pasted text quote their source sentence (prompt-injection checks in `coverAi.test.ts`). |
| Weekly shifts and dated changes | Postgres | |
| Staff credentials (e.g. CPR) | Postgres | Key, issue date, expiry date and verified flag. No document images. |
| Hours worked | Postgres | For sick-leave accrual only. |
| Cover requests, offers and events | Postgres | Append-only events. A call-off has **no reason field** anywhere (input, table, message, webhook). |
| Staff phone (SMS opt-in) | Postgres | Only if the person opts in. SMS is behind an adapter that is a mock unless Twilio is configured, and it is off by default. |
| Passkeys and sign-in codes | Postgres | Public keys only. Codes are single-use, stored hashed, short-lived and rate-limited per IP. |
| Push subscriptions | Postgres | Endpoint plus its public keys. |
| Pay rates | Postgres | The table exists only for cost-aware ranking. Nothing in the app writes to it yet, it is owner/admin only, and it is never sent to the LLM. Turning cost-aware ranking off deletes every rate (`security.test.ts`). |

Controls added or checked in this pass:
- **Tenant isolation.** Every coverage, cover, forecast and rule capability is in the cross-org
  attack list (`isolation.test.ts`).
- **Push endpoints (SSRF), fixed in this pass.** The browser supplies the push endpoint, and the
  server POSTs to it. Before this fix, any https URL was accepted, so a signed-in person could have
  made the server call an internal address. Now only the browsers' push services are allowed: FCM,
  Mozilla autopush, Apple (`*.push.apple.com`, as Apple's web push documentation says to allow) and
  WNS (`*.notify.windows.com`). The list is checked when a device subscribes and again before each
  send.
- **Removed staff, fixed in this pass.** A removed person's weekly shifts used to keep counting
  toward ratios. That could show a room "in ratio" when it was not. They now stop counting from the
  day of removal (`forecast.test.ts`).
- **Erasure and export, fixed in this pass.**
  - Erasing a person now also deletes their passkeys, sign-in codes, phone number and cover
    preferences, push devices, credentials, pay rates and rota.
  - Hours worked and past cover events stay, under "Former member", because CA sick-leave law
    requires keeping records.
  - Per-person export now includes credentials, shifts, hours worked, cover preferences, cover
    offers and pay rates (`privacy.test.ts`).
- **Webhooks.** `coverage.gap_detected`, `cover.requested`, `cover.filled` and
  `credential.expiring` carry rule facts and staff ids only. Tests check every real payload against
  its published schema, with no extra keys, and check that no child, pay or reason data appears
  (`coverageEvents.test.ts`).
- **The LLM.** It drafts rules, explanations and parsed messages; the engine computes every number.
  Explanations get anonymised facts ("#1", "#2", no names, no pay, overtime only as a yes/no).
  Numbers in output are checked against the facts.
- **No real messages in tests or demos.** The SMS channel is a mock, and push is off without VAPID
  keys and stubbed in tests.

Known gaps specific to coverage:
1. **Push endpoint takeover.** Subscribing with an endpoint that is already stored moves it to the
   new person. Endpoints are unguessable capability URLs, so the risk is low. A stricter fix is
   to refuse an endpoint owned by another member.
2. **Credential documents.** Uploading and checking certificates is out of scope. "Verified" is an
   admin's yes/no.
3. **Rules accuracy.** Seed packs cite primary sources with the date they were read, but they are
   not legal advice and need periodic review. There is no automatic change detection.

## Known gaps (fix before selling to security-sensitive customers)

1. **Session revocation.** Sessions are stateless signed cookies: "sign out everywhere" isn't possible
   short of rotating `SESSION_SECRET` (which also breaks webhook secrets, see below). Add a session
   table or a per-member session epoch.
2. **Encryption key separation.** Webhook secrets use a key derived from `SESSION_SECRET`. Move to a
   dedicated `ENCRYPTION_KEY` with versioned rotation, ideally from a KMS.
3. **Webhook DNS rebinding.** The private-address check resolves DNS, then `fetch` resolves again.
   Pin the checked IP with a custom undici dispatcher.
4. **CSP nonces.** The CSP allows inline scripts for Next's runtime. Move to per-request nonces via
   middleware.
5. **Per-person OAuth sign-in for agents** is designed, not built (`AGENT-AUTH.md`).
6. **MFA / SSO.** Sign-in relies on Slack's own MFA and SSO. Customers without Slack would need email
   magic links plus TOTP, or SAML/OIDC SSO.

## What a SOC 2 audit would still need

| Area | Missing today |
|---|---|
| Policies | Written information security, access control, change management, incident response, vendor management, data retention and business continuity policies, reviewed yearly |
| Access reviews | Quarterly review of who can reach production (Vercel, Neon, GitHub, Anthropic, Slack app config), with evidence |
| Change management | Exists in practice (PRs, CI, preview deploys); needs branch protection with required review on `main` and a recorded approval for every production change |
| Monitoring and alerting | Central log retention (e.g. Vercel log drains), uptime checks, alerts on 5xx rate, auth failures and budget exhaustion, on-call |
| Incident response | Runbook, contact tree, customer notification process, a tabletop exercise |
| Backups and recovery | Neon point-in-time restore is available; needs a documented RPO/RTO and a tested restore |
| Vulnerability management | Dependabot or Renovate, secret scanning and code scanning in CI, a yearly penetration test |
| Vendors | Subprocessor list (Vercel, Neon, Anthropic, Slack) with DPAs and SOC reports on file |
| People | Security training, background checks, onboarding and offboarding checklists |
| Audit log | Retention period, export for customers, tamper evidence (hash chain or WORM storage) |
