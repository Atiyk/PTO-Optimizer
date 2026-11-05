# GAPLESS — CONSUMER AUTOPILOT ("SERVICE AS SOFTWARE") MULTI-AGENT DIRECTIVE

**Status:** Owner approved on November 4, 2026 ("multi agent work streams with full approval to run the new
features in the services as a software section"). Source of scope: the "Gapless: next product bets" doc,
section *Service as software*, top picks "never lose a PTO day" autopilot and request automation.

**Repo:** Atiyk/PTO-Optimizer · **Target:** the consumer Gapless app at the repo root only. Never edit
`apps/teams`, its database, UI, branding, infrastructure or users. The consumer app may share backend
*infrastructure* with teams (Vercel, providers) but never links to it or shares data with it.

**Base:** `claude/gapless-consumer-redesign` (PR #114, still open) because every UI change here lands on the
redesigned screens. Integration branch: `claude/gapless-consumer-autopilot`. If #114 merges first, rebase onto
`main`; if #114 changes again, rebase before review.

## 0. RUN MODE (overrides CLAUDE.md steps 4–6 for this run only)

The owner gave explicit approval for an unattended run. For this run:

- Agents may branch, commit, push the integration branch and open **one draft PR**. No merge, no push to `main`,
  no force-push to anyone else's branch, no branch deletion, no account or project settings changes.
- The owner reviews the draft PR and its Vercel preview and merges. Merging is never done by an agent.
- Every other CLAUDE.md rule still applies in full: no submit/Generate buttons, no multi-step forms, free-form
  date pickers, URL round-tripping, signed-out results, `npx vitest run` + `npx tsc --noEmit` + `npm run build`
  green before every push.
- Owner decisions are logged under "Questions for Atiyk" in `docs/runs/autopilot/STATUS.md` and the PR, not
  blocking the run.

## 1. MISSION

Sell the finished job, not the tool: time off that actually gets booked and never expires. The engine stays
deterministic. Anything that reads messy input (an email, a screenshot) only proposes values the user confirms;
it never produces a balance, a date plan or a legal answer on its own.

## 2. AGENTS AND FILE OWNERSHIP

| Agent | Owns | Files (exclusive unless noted) |
| --- | --- | --- |
| **O — Orchestrator** | Plan, contracts, integration, PR, preview, STATUS.md | `api/`, `vercel.json`, `package.json`, this file, `docs/runs/autopilot/` |
| **C — Calendar feed** | F1 live plan feed, F2 book-by nudges | `src/autopilot/feed*.ts`, `src/autopilot/planFromSearch.ts`, `src/ui/ExportBar.tsx`, `src/ui/SubscribeFeed.tsx` |
| **P — Expiry rescue** | F3 expiry rescue with a ready-made plan | `src/personal/expiryRescue.ts`, `src/autopilot/watchFeed.ts`, `src/ui/ExpirationGuard.tsx` |
| **R — Request autopilot** | F4 forward/paste the approval, OOO draft, calendar block | `src/personal/approvalParser.ts`, `src/personal/outOfOffice.ts`, `src/ui/ApprovalAssistant.tsx`, `src/ui/PtoTracker.tsx` |
| **V — Balance capture** | F5 balance from a screenshot | `src/personal/balanceExtract.ts`, `src/ui/BalanceFromImage.tsx`, the balance field in `src/ui/Policy.tsx` |
| **Q — Independent critic** | Blocking review | Writes only `docs/runs/autopilot/QA-*.md` |

Shared files (`src/ui/icsExport.ts`, `src/ui/useAppState.ts`, `src/ui/App.tsx`): append-only exports by the
owning agent named in its brief; O resolves conflicts at integration. Workers run in isolated worktrees.

## 3. FEATURES AND ACCEPTANCE CRITERIA

### F1 — Live plan feed (Agent C)
A calendar URL the user subscribes to once (`webcal://…/api/feed?…`, plus Google and Outlook add links). The
function re-solves the plan from the same query string the `/pto` URL already carries, so the feed is the plan
and needs **no account and no stored data**. It keeps holidays current (daily redeploys refresh data) and
re-derives book-by dates against today.
- Same inputs give byte-identical events to the downloaded `.ics` for the same day (parity test).
- Bounded input: reject query strings over 4 KB or plan ranges the app itself rejects; never echo raw input
  into ICS text without RFC 5545 escaping. `Cache-Control: public, s-maxage=21600`.
- Private data never enters the feed URL beyond what the plan URL already carries. Request notes, salary and
  imported calendars stay out.

### F2 — Book-by nudges (Agent C)
Each future break gets a "Book by <date>" event (start minus the user's notice period) with alarms 7 days
before and on the day, in both the feed and the download. Email nudges are **not** built (owner prerequisite).

### F3 — Expiry rescue (Agent P)
For each expiry risk, compute a concrete rescue plan (dates, PTO spent, days off) inside the deadline with the
existing optimizer, show it inline in the expiration guard ("Take Dec 22–24 to keep 3 days"), and put those
dates into the 60/30/7-day reminder descriptions. A "watch" feed built from the `/policy` URL recomputes risks
and rescue plans against today on each fetch. Reuse `expirationRisks`; no second policy calculator.

### F4 — Request autopilot (Agent R)
Paste the manager's approval (or denial) email. A deterministic, local parser finds the dates and the decision,
matches it to a tracked request, and shows what it found with a confirm action. On confirm: status becomes
approved, an "Out of office" calendar block (`.ics`, busy/OOF) and an out-of-office message draft are offered.
Each planned request also shows its submit-by date. The forwarding inbox is an owner prerequisite; the parser is
written so the same function can run server-side later.

### F5 — Balance from a screenshot (Agent V)
Pick or paste an image of a payslip or HR balance screen. OCR runs **in the browser** (lazy-loaded); the image
never leaves the device. Candidates ("Vacation available 12.5 days") are shown; the user taps one to use it as
the balance and as-of date. Pasting text works without OCR. A vision-model upgrade is an owner prerequisite.

### F6 — Fare watch (optional, last): not built in this run. Needs affiliate approval.

## 4. OWNER PREREQUISITES (agents do not provision these)

1. Outbound email provider (for email nudges and expiry emails): account, API key in Vercel env, sending domain
   DNS (SPF, DKIM, DMARC).
2. Inbound email address for "forward the approval": provider inbound route, MX record, webhook secret.
3. Optional vision model key for screenshot reading beyond on-device OCR.
4. Optional database (Vercel Postgres / Neon) for sign-in features: feeds that follow later plan edits, email
   reminders. Sign-in stays optional, stores only the email, plan link and notice period (docs/personal/DATA.md),
   and is deletable in one action.
5. Privacy policy update before any of 1–4 go live.

## 5. GATES

- **G1 Contracts:** O publishes interfaces (this file, briefs). Workers start in parallel.
- **G2 Worker done:** unit tests for every pure module, `npx vitest run`, `npx tsc --noEmit`, no new lint
  errors, screenshots of changed views at 1440/768/375/320.
- **G3 Integration:** O merges workers into the integration branch, `npm run build` green, `verify:dist`
  baseline refreshed only for intended changes.
- **G4 Critic:** Q reviews the integrated build against this file and CLAUDE.md, with browser evidence. A red
  finding blocks the PR leaving draft.
- **G5 Preview:** O confirms the Vercel preview serves the pages and `/api/feed` returns valid ICS.

## 6. CRITIC CHECKLIST (Q)

Deterministic numbers only; no submit/Generate button or multi-step form; confirm actions only where a value
was read from messy input; free-form dates and URL round-trip intact; nothing private in URLs, analytics or
feeds; image never uploaded; ICS validity (CRLF, folding, escaping, exclusive DTEND, unique UIDs); feed input
bounds; keyboard, focus, 44px targets, WCAG 2.2 AA contrast; no 320px overflow; no `apps/teams` changes.
