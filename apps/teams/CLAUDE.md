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
