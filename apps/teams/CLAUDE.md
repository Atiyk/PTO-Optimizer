# Days Off for Teams (apps/teams): rules

Read `docs/teams/ARCHITECTURE.md` and `docs/teams/SPEC.md` first. The root CLAUDE.md's
"no backend / no accounts" rule is for Days Off only; its workflow rules (feature branch,
tests + typecheck + build before pushing, screenshots at 1440/768/375) apply here too.

## Non-negotiables
- **Tenant isolation.** Every business table has `org_id`; every query filters by the
  actor's org, including lookups by id. Cross-org access must fail with 403/404, and there
  is a test for every route and tool that proves it.
- **D1: exact numbers.** Balances, accruals, dates and coverage come from
  `packages/engine`. The LLM never produces a number the UI shows. Balances are derived from
  the append-only ledger; never store a mutable balance.
- **One capability layer (R1).** Business actions are entries in `src/capabilities/`. UI,
  REST, MCP, Slack and the assistant call `invokeCapability`; none touches the DB for
  business actions directly. Same permission, visibility and audit rules for humans and
  agents.
- **No health data.** Sick-leave requests store no reason or notes by default. If an org
  enables notes, only the approver and admins can see them, never service agents,
  webhooks or exports to non-admins.
- **Untrusted text.** User-authored text (notes, handbook text, names) returned by a tool
  is delimited as data, never instructions.

## AI cost rules
- One server-side AI module (`src/ai/`) wraps every model call. Feature code never
  imports a provider SDK.
- Per-task model map; the cheapest model that passes that task's eval. Check current
  model IDs in Anthropic's docs; never guess.
- Hard caps: max tokens per call, per-org daily call budget, global monthly token budget
  (`AI_MONTHLY_TOKEN_BUDGET`). Over budget → AI features disable gracefully; forms still
  work.
- Cache handbook imports by content hash. Send only the text needed.
- Record token usage per org and feature in the DB.
- `AI_DISABLED` / mock mode is the default in tests and CI. Real calls only in the
  explicit eval script.

## Commands
- `npm run test -w apps/teams`, `npm run typecheck -w apps/teams`, `npm run build -w apps/teams`
- `npm run db:generate -w apps/teams` after editing `src/db/schema.ts` (commit the SQL).

## Regulated coverage rules (childcare, clinics)
Read `docs/teams/COVERAGE-ARCHITECTURE.md` and `docs/teams/COVERAGE-SPEC.md` first.
- **D1 for rules.** Ratios, headcounts, gaps, eligibility, rest/hours checks, rankings and
  sick-leave accruals come from `packages/engine/src/coverage/`. The LLM drafts and
  explains; every number in an explanation must appear in the engine facts it was given.
- **Citations.** Every rule shown to a customer carries `{regulation, section, url,
  retrievedOn}` or is labelled "needs verification". Never invent a ratio, rest rule or
  accrual rate. Each cited number in `packages/engine/rulepacks/` has a test. Wherever rules
  appear in the UI, say "Not legal advice".
- **No child data.** Demand is counts per age group per room per time block. Never store
  or accept child names, birthdays, addresses or any child identifier. A schema/API test
  enforces this.
- **Pay rates.** Stored only while the org has cost-aware ranking on; visible to
  owner/admin only (`payrates:read`, never grantable to tokens); never sent to the LLM,
  webhooks, logs or exports to non-admins. Ranking outputs a cost band, not a rate.
- **Call-off reasons** are not stored by default (health-data minimisation).
- **Messaging.** Business logic lives in capabilities; adapters (mock, Slack, Web Push,
  Twilio-off) only deliver. Tests use the mock. Never send a real SMS or push.
- **MCP tool budget ≤ 25.** Count before adding a tool; prefer extending a capability.

## Personal accounts (shared infrastructure)
The consumer product at the repo root (Gapless PTO Optimizer, formerly Days Off) may reuse
this app's backend infrastructure for optional personal accounts (see
`docs/REDESIGN-SPEC.md`, Phase 5 onwards). It is a separate product: no UI, link, copy or
data flow between the two.
- `personal_*` tables are owned by `account_id`, never `org_id`.
- No org-scoped route, capability, MCP tool, webhook or export may read a `personal_*`
  table, and personal routes (`/api/me/*`, `/auth/*`) never read org tables. A test per
  route proves both directions.
- Personal data gets no MCP tools; the MCP tool budget (≤ 25) is unchanged.
