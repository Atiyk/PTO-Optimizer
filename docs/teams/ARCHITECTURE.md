# Days Off for Teams: architecture

Working name lives in `apps/teams/src/lib/brand.ts`. This document is the map; `SPEC.md`
(Phase 1) is the contract.

## Boxes

```
                    ┌──────────────────────────── surfaces (thin adapters) ────────────────────────────┐
                    │  Web UI          REST /api/v1     MCP server       Slack app      In-app assistant │
                    │  (server         (+ OpenAPI)      (Streamable      (Phase 7)      (Phase 3; a      │
                    │   actions)                         HTTP, Phase 5)                  client of the   │
                    │                                                                     same tools, R8) │
                    └───────┬───────────────┬───────────────┬──────────────┬───────────────┬─────────────┘
                            │ resolve actor │ (session / API key / OAuth token / Slack user link)
                            ▼               ▼               ▼              ▼               ▼
                    ┌───────────────────── capability registry  apps/teams/src/capabilities ────────────┐
                    │ validate input (zod) → authorize (scope + role + visibility) → autonomy level (R6) │
                    │ → handler → validate output → audit (actor type, client id, on-behalf-of)         │
                    └───────┬──────────────────────────┬─────────────────────────┬───────────────────────┘
                            │                          │                         │
                            ▼                          ▼                         ▼
               ┌─────────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
               │ packages/engine (pure)  │  │ AI module (R7)       │  │ DB (Drizzle)         │
               │ solver, dates, holidays,│  │ provider interface,  │  │ Postgres: Neon prod, │
               │ ledger + balance        │  │ model map, budgets,  │  │ PGlite dev/tests     │
               │ projection, coverage,   │  │ usage table, mock    │  │ append-only ledger,  │
               │ team planner            │  │ mode, evals          │  │ audit log            │
               └─────────────────────────┘  └──────────────────────┘  └──────────┬───────────┘
                                                                                   │ outbox
                                                                                   ▼
                                                                       signed webhooks (Phase 5)
```

- **packages/engine** is the Days Off engine, extracted with no behaviour change (Phase 0
  proves `dist/` is byte-identical). It has no React, DOM or DB imports. Phase 1 adds the
  ledger/policy model; Phase 4 adds the multi-person planner. Days Off (repo root) and
  `apps/teams` both import it.
- **Capability registry (R1)** is the only place business actions live. Each entry
  declares input/output schemas with model-readable descriptions, scope, optional role
  gate, effect class (read | draft | commit), idempotency, MCP annotations, rate-limit
  class, which surfaces expose it, and an audit template. `invokeCapability()` runs the
  pipeline above. Surfaces only translate transport (cookies/headers/JSON-RPC/Slack
  payloads) into `(actor, input)` and the result back.
- **AI module (R7)** wraps every model call. Feature code never imports the SDK. The LLM
  turns language into drafts and engine facts into prose; it never produces a number the
  UI shows (D1).

## Data flow: a leave request from a human

1. Employee picks dates in the web form (or types a sentence; Phase 3 turns it into a
   structured draft via the AI module).
2. As dates change, the UI calls `draftLeaveRequest` (effect `draft`). The engine computes
   working days (holidays and non-work days excluded), the balance after, blackouts and
   coverage conflicts. Live, no submit-then-error.
3. The employee confirms → `submitLeaveRequest` (effect `commit`, idempotency key). The
   engine decides auto-approval eligibility (D4); the LLM only writes the one-line reason.
4. Approval/decline → `decideLeaveRequest`; a `usage` ledger row is appended on approval.
   Webhooks `leave.requested` / `leave.decided` fire from an outbox row in the same
   transaction.

## Data flow: a leave request from an external agent

1. The agent calls the MCP tool `draftLeaveRequest` with a scoped token. The surface
   resolves the token to an actor: `agent-on-behalf-of-user` (personal token or OAuth
   user grant) or `service-agent` (client credentials; no user identity).
2. Same registry pipeline, same visibility and health-data rules (R4). The draft is
   stored and the tool returns a confirmation token plus a plain-language summary (R2).
3. `submitLeaveRequest` from an agent commits directly only if the org's autonomy level
   for that capability and actor type allows it (R6, L3). Otherwise it stays a draft until
   the member confirms in the web app, Slack, or the agent's own confirmation UI with the
   token. A service agent can never commit on a member's behalf (R3).
4. Audit rows record actor type, client id, on-behalf-of member and scopes used.

## Where the rules are enforced

| Rule | Where |
|---|---|
| D1 exact numbers | Numbers only come from `packages/engine`; explanation text is checked so every number appears in its input facts (Phase 3 test). |
| R1 one capability layer | `apps/teams/src/capabilities/registry.ts`; surfaces import only `invokeCapability` / `runForSession`. |
| R2 draft → confirm | Commit capabilities consult the autonomy level; agent commits below L3 become drafts. |
| R3 actor model | `Actor` type in `capabilities/types.ts`; resolved per surface; written on every audit row. |
| R4 same rules for agents | Authorization and visibility live in the registry pipeline, not the surface. Tests run each check as human and as agent. |
| R5 untrusted text | Tool output wraps user-authored text in a delimited `untrusted` field; injection suite per free-text tool. |
| R6 autonomy levels | `autonomy_settings` table per org × capability × actor type (Phase 3). |
| R7 model-agnostic AI | `src/ai/` provider interface, model map in config, evals in `tests/evals/`. |
| R8 assistant = client | The assistant's tool list is generated from the registry (same as MCP). |
| R9 machine-readable | OpenAPI and MCP tool list generated from the registry; llms.txt; webhooks; A2A card behind a flag. |

## Actor model

| Actor type | Identity | Can read | Can commit |
|---|---|---|---|
| `human` | signed session cookie (Slack OIDC or dev login) | per role + visibility rules | per role |
| `agent-on-behalf-of-user` | personal access token or OAuth user grant; `onBehalfOfMemberId` set | what that member can, ∩ token scopes | per autonomy level; otherwise a draft the member confirms |
| `service-agent` | API key or OAuth client credentials; no member | org-level data its scopes allow (never health notes) | never on a member's behalf; may create drafts addressed to a named member |

Roles map to scopes in `capabilities/scopes.ts`. Role is re-read from the DB on every
request, so demotion takes effect immediately.

## Tenant isolation

- Every business table has `org_id`. The actor carries the org id resolved from a
  verified credential; capability handlers filter every query by `actor.orgId`, including
  lookups by primary key (a member id from another org returns "not found", never data).
- Sessions bind member **and** org and are re-checked against the DB; a cookie that pairs
  a member with a different org is rejected.
- Tests (Phase 2, Phase 5) attempt cross-org reads and writes through every route and MCP
  tool and assert 403/404.
- Later hardening (logged in SECURITY.md): Postgres row-level security as a second wall.

## Runtime and hosting

- Next.js 16 App Router, deployed as a separate Vercel project rooted at `apps/teams`.
- DB: `DATABASE_URL` (free Neon project recommended) via postgres-js with `prepare:false`
  for the pooled endpoint. Without it, dev uses PGlite under `.pglite/`; tests use
  in-memory PGlite with migrations applied.
- AI: off in tests and CI (`AI_DISABLED=1`); real calls only from the explicit eval
  script.
