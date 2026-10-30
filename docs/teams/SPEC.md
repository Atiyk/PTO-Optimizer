# Days Off for Teams: product spec (MVP)

Status: Phase 1 draft, written before feature code. Architecture: `ARCHITECTURE.md`.
Working name is a placeholder (`apps/teams/src/lib/brand.ts`).

Target: teams of 10–200 people at SMBs without Workday. The thesis: incumbents are
records (request → approve → balance); we do the **planning** people do in their heads,
on an engine that is never wrong about numbers (D1–D6 in the run prompt).

---

## 1. Personas and weekly jobs

### Employee
1. Check how many days they have, and what they will have at year end.
2. Request time off (full day, half day, hours), ideally by typing a sentence.
3. See whether the dates clash with a teammate, a blackout or a holiday before asking.
4. Cancel or change a request.
5. See who on their team is out this week.
6. Accept or tweak a proposed plan for expiring days.
7. Understand "why is my balance this number?"

### Manager
1. Approve or decline requests, seeing coverage, balance after and overlaps at a glance.
2. Check who is out today / this week / next month.
3. Spot days where the team would drop below minimum coverage.
4. Clear expiring leave across the team without leaving the team short (team planner).
5. Answer "can I take the Friday after Thanksgiving?" for a report.
6. Reverse an auto-approval within the window when it was wrong.

### Admin / owner (often the founder or office manager)
1. Set up the org: locations, teams, leave types, policies (from the handbook), coverage
   rules, blackouts.
2. Invite people and fix roles.
3. Import from Timetastic / Vacation Tracker / a spreadsheet.
4. Make balance adjustments with a reason.
5. Export everything (payroll hand-off, audits).
6. Decide autonomy levels and connect agents (Agentforce, Copilot Studio, Claude…).
7. Watch AI usage and cost.
8. Answer a policy question with a citation to the handbook.

---

## 2. Entities and fields

All tables have `id uuid`, `created_at`. Every business table has `org_id` (tenant key).
Soft delete (`deleted_at`) where history must survive.

| Entity | Fields |
|---|---|
| **Organization** | name, slug, default_location_id, plan_year_start (MM-DD, default 01-01), week_start (0/1), sick_notes_enabled (bool, default false), visibility_default, agent_access_enabled (kill switch, default true), autonomy settings (see §8) |
| **Location** | org_id, name, country_code (ISO 3166-1), subdivision_code (ISO 3166-2, nullable), timezone. Holiday calendar comes from the engine's per-country data (Nager.Date + US state fallback), plus org-defined extra closures |
| **Team** | org_id, name, parent_team_id (nullable, for one level of grouping) |
| **Member** | org_id, name, email (nullable; no email sending in MVP), slack_user_id, role (owner / admin / manager / employee), work_week (7 booleans, Mon-first), hours_per_day (default 8), start_date, end_date, location_id, team_id, manager_id, deleted_at |
| **LeaveType** | org_id, key (vacation, sick, personal, unpaid, parental, custom-*), name, paid (bool), counts_against_balance (bool), requires_approval (bool), is_health_related (bool: drives minimisation), color token, auto_approve (§7), max_auto_approve_days, archived |
| **LeavePolicy** | org_id, leave_type_id, applies_to (all / team ids / location ids), effective_from, the policy model in §3, source citations (for handbook-imported fields) |
| **LeaveRequest** | org_id, member_id, leave_type_id, status (draft / pending / approved / declined / cancelled), start_date, end_date, part (full / am / pm / hours), hours (when part = hours), note (nullable; never stored for health-related types unless the org enables notes), engine snapshot (working days/hours deducted, holidays excluded, computed at submit), created_by actor, decided_by, decided_at, decision_note, auto_approved (bool) + reason, reversible_until, idempotency_key |
| **BalanceLedger** | APPEND-ONLY. org_id, member_id, leave_type_id, kind (accrual / usage / adjustment / carryover / forfeiture / import), amount (numeric 12,4; signed), unit (days / hours), effective_date, request_id (for usage), reason (required for adjustment), created_by actor. Corrections are new rows, never updates |
| **CoverageRule** | org_id, team_id, min_present (int), role_tag (nullable: e.g. "engineer"), weekdays (mask), effective range |
| **Blackout** | org_id, team_id (nullable = org-wide), start_date, end_date, reason, hard (block) or soft (warn) |
| **AuditLog** | org_id, at, actor_type, actor_member_id, client_id, on_behalf_of_member_id, scopes, capability, effect, outcome, summary, data (no health detail) |
| **AiUsage** | org_id, feature, model, input_tokens, output_tokens, cache_read_tokens, at, cache_hit |
| **Invite** | org_id, role, team_id, token_hash, expires_at, max_uses, uses, created_by, revoked_at |
| **Draft / Proposal** (agent R2) | org_id, capability, payload, addressed_to_member_id, created_by actor, confirmation_token_hash, expires_at, status |
| **ApiToken / OAuthClient** (Phase 5) | org_id, kind, name, token_hash, scopes, member_id (personal tokens), last_used_at, revoked_at |

Member tags (e.g. "engineer") for role-based coverage are a text array on Member.

---

## 3. The policy model

A policy is pure data, interpreted by the engine. Every field may carry `source`
(the quoted handbook sentence) or `"not stated"`.

| Field | Values |
|---|---|
| `accrual.method` | `front_loaded` (full allowance at plan-year start) · `per_pay_period` (allowance / periods, credited on each period end) · `per_hour_worked` (rate × hours) · `unlimited` (no balance; usage still recorded) |
| `accrual.annualAllowance` | number, in `unit` |
| `accrual.payPeriods` | weekly 52 · biweekly 26 · semimonthly 24 · monthly 12 |
| `accrual.ratePerHour` | for per-hour (e.g. 1 hour per 30 worked = 0.0333) |
| `unit` | `days` · `hours` (hours mode converts requests with the member's hours_per_day) |
| `planYear` | `calendar` · `anniversary` (from member start_date) · `custom` (MM-DD) |
| `accrualCap` | max balance; accrual pauses while at cap, resumes after usage drops it below (no retroactive catch-up) |
| `carryover` | `none` · `all` · `upTo: N`, optional `useBy` (MM-DD in the new plan year) after which unused carried days are forfeited |
| `waitingPeriodDays` | accrual starts / balance usable after N days from start_date (`waitingMode`: `accrue_but_locked` or `no_accrual`) |
| `negativeAllowance` | how far below zero a request may take the balance (0 = none) |
| `proRateFirstYear` | front-loaded allowance pro-rated by remaining fraction of the plan year at start date |

**Balances are derived, never stored.** `balance(member, type, asOf) = Σ ledger
entries with effective_date ≤ asOf` plus the engine's **projection** of not-yet-posted
accruals, carryover and forfeiture events for a future date. The projection is pure:
`project(policy, member, ledger, bookedRequests, holidays, asOf)`.

Ledger posting: the engine produces scheduled events (accruals, reset carryover /
forfeiture); a job (on read, idempotent by event key) appends them as ledger rows when
their date passes, so the ledger stays the auditable record.

### Policy change mid-year
A new LeavePolicy row with `effective_from`. The ledger before that date is untouched;
the engine applies the new policy only to events after it. No recomputation of history.

---

## 4. Visibility rules

Incumbent complaint: rigid visibility. Org setting with team overrides:

| Level | Sees |
|---|---|
| `org` (default for SMBs ≤ 50) | everyone's out/in status, org-wide |
| `team` | only their own team(s) |
| `custom` | named groups |
| always | own requests; managers see their reports; admins see all |

**"Out" without the reason by default.** Others see "Out" and the dates, not the leave
type, unless the org turns on "show leave type" (and even then, health-related types
always show as "Out"). The same rules apply to agents, Slack, webhooks and exports (R4).

## 5. Health-data minimisation (legal)

- Leave types flagged `is_health_related` (sick, and any custom type the admin flags)
  store **no reason and no notes** by default; the API rejects a note on them.
- If an org enables sick notes, the note is visible only to the approver and admins;
  never to teammates, service agents, webhooks, Slack channels, the LLM (it is not sent
  to the model), or exports run by non-admins.
- Audit rows for health-related types never include the note.
- Why: health data is special-category data under GDPR Art. 9 and similar regimes;
  the safest MVP posture is not to hold it. Needs legal review before launch.

---

## 6. Edge cases (decided)

| Case | Behaviour |
|---|---|
| Overlapping requests (same member) | Rejected at draft time with the conflicting request's dates. |
| Retroactive request | Allowed for the member up to 30 days back, flagged to the manager; always requires approval (never auto). |
| Editing an approved request | Becomes cancel + new request linked by `replaces_request_id`; ledger gets a reversing usage row then a new one. |
| Policy change mid-year | Forward-only (§3). |
| Member changes location | Location history row with effective date; holidays for each day come from the location in force that day. |
| Holidays inside a request | Not deducted; shown as "includes 1 holiday (not deducted)". Non-working days per work_week also not deducted. |
| Part-time / hours-based | work_week mask + hours_per_day; hours mode deducts hours; half day = hours_per_day / 2. |
| Leap years | Date math is serial-day based (engine dateUtils); Feb 29 is a normal day; anniversary on Feb 29 resets on Feb 28 in non-leap years. |
| Deleted member | Soft delete; ledger and requests kept for export/audit; hidden from pickers and coverage. |
| Negative balance | Allowed down to `negativeAllowance`; beyond that the draft shows the shortfall and cannot be submitted. |
| Unlimited PTO | No balance shown; usage still recorded, "days taken this year" shown instead. |

---

## 7. Auto-approval (D4)

The engine decides eligibility: leave type has auto-approve on, request ≤ max days,
balance after ≥ −negativeAllowance, no coverage rule violated, no hard blackout, not
retroactive, policy waiting period passed. The LLM only writes the one-line rationale
from these facts. Auto-approved requests are reversible by the manager until
`reversible_until` (default 48h). Everything is audited.

---

## 8. Scopes, actor model, autonomy

### Scopes
`leave:read` · `leave:request` · `leave:approve` · `policy:read` · `policy:draft` ·
`planner:run` · `admin`. Roles map to scopes (employee: read/request/policy:read;
manager: + approve, planner; admin/owner: everything). Tokens carry an explicit subset,
intersected with the member's role scopes for personal tokens.

### Actor model (R3)
| | human | agent-on-behalf-of-user | service-agent |
|---|---|---|---|
| Identity | session | personal token / OAuth user grant | API key / client credentials |
| On-behalf-of member | n/a | required | none |
| Reads | role + visibility | member's view ∩ scopes | org data its scopes allow; never health notes |
| Commits | per role | per autonomy level, else draft | **never** on a member's behalf; may create drafts addressed to a named member |

### Autonomy levels (R6)
Per org × capability × actor class: `L0` off · `L1` suggest · `L2` draft, human confirms
· `L3` act within policy (audited, reversible within a window). Defaults: agents `L2`;
in-app assistant `L1`–`L2`. Raising a level is an admin action shown with the current
eval score.

---

## 9. Capability catalog

Effect: R = read, D = draft, C = commit (idempotency key). Surfaces: U = web UI, A = REST
API, M = MCP, S = Slack, I = in-app assistant. Autonomy default for agents in brackets.

| Capability | Purpose | Scope | Effect | Surfaces | Agent autonomy |
|---|---|---|---|---|---|
| getMyBalance | balance + year-end projection for the caller or on-behalf-of member | leave:read | R | UAMSI | n/a |
| explainBalance | ledger walk + plain-language explanation | leave:read | R | UAMSI | n/a |
| draftLeaveRequest | structured request (dates/part/type) → engine impact (days deducted, holidays, balance after, coverage, blackouts) | leave:request | D | UAMSI | n/a |
| parseLeaveRequestText | natural language → draft (AI, 3A) | leave:request | D | UAMSI | L2 |
| submitLeaveRequest | submit a draft; auto-approve if eligible | leave:request | C | UAMSI | L2 (agents get a confirmation token) |
| confirmDraft | member/manager confirms an agent's draft by token | leave:request | C | UAS | human only |
| cancelLeaveRequest | cancel own pending/approved future request | leave:request | C | UAMSI | L2 |
| listMyRequests | history | leave:read | R | UAMSI | n/a |
| whoIsOut | out list for a date range, visibility-filtered, no reasons | leave:read | R | UAMSI | n/a |
| listPendingApprovals | manager queue with impact | leave:approve | R | UAMSI | n/a |
| decideLeaveRequest | approve/decline (or reverse an auto-approval) with note | leave:approve | C | UAMSI | L2 |
| getPolicySummary | the member's effective policy in plain terms | policy:read | R | UAMSI | n/a |
| draftPolicyFromText | handbook → cited policy draft (AI, 3B) | policy:draft | D | UAI | L2 |
| savePolicy | confirm a policy (form or confirmed draft) | admin | C | UA | human only |
| runTeamPlan | multi-person plan for expiring days under coverage | planner:run | R | UAMSI | n/a |
| sendPlanProposals | send per-member proposals | planner:run | C | UAMI | L2 |
| respondToProposal | member accepts (→ requests) or edits | leave:request | C | UAMSI | L2 |
| adjustBalance | ledger adjustment with reason | admin | C | UA | human only |
| manageMembers | invite, role, team, location changes | admin | C | UA | human only |
| manageOrgSetup | locations, teams, leave types, coverage, blackouts | admin | C | UA | human only |
| importCsv | map/preview/validate/commit import with rollback | admin | C | U A | human only |
| exportData | org/member export (CSV/JSON) | admin | R | UA | human only |
| setAutonomyLevel | per capability | admin | C | U | human only |
| getAiUsage | token totals per feature | admin | R | UA | n/a |

MCP exposure: 15 tools (≤ 25 budget). Admin setup stays off MCP for the MVP.

---

## 10. Acceptance scenarios

A1–A12 as defined in the run prompt (Phase 8), each with an automated test and
screenshots. Per phase:

- **Phase 1**: policy engine unit tests incl. 15 days/yr biweekly = 0.577/period and
  exactly 15 over 26 periods; cap pause/resume; front-loaded 20, 8 used, carry ≤ 5 → 7
  forfeited; carried days with Mar 31 use-by; anniversary year with mid-year start
  (pro-rated); hours mode at 7.5h/day; holiday inside a request not deducted.
- **Phase 2**: A1 (setup + CSV in < 5 min of clicks), A6 (cross-org), A7 forms path.
- **Phase 3**: A2, A3, A4, A7 with AI off.
- **Phase 4**: A5.
- **Phase 5**: A9, A10, A11, A12.
- **Phase 7**: A8.

---

## 11. Out of scope (MVP)

Payroll, HRIS sync, billing (static pricing placeholder only), native mobile apps,
Microsoft Teams, email sending (invite links instead), SSO beyond Slack OIDC.
