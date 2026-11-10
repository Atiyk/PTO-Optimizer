# Gapless — autonomous parallel engineering / product implementation
Owner-authorized November 6, 2026. Project Atiyk/PTO-Optimizer. Production https://pto-optimizer-seven.vercel.app/.
Integration branch: gapless/eng-release-20261106. Initial baseline main SHA: 1e48a0c926a87b1ca28763ebf3208f43f72e0443. Always re-check current main rather than trusting this SHA.

## Approved scope: implement, not merely propose
1. Consumer engineering reliability, bug fixes, regression and safe release.
2. Unified personal PTO wallet, multiple leave banks and date-specific timeline.
3. Calendar-aware planning for couples, families and rotating/complex schedules.
4. Constraint-aware recommendation engine and credible, source-aware travel-demand estimates.

No other feature expansions. The user's separate Claude agent OWNS UI/UX: do not edit visual design, fonts, colors, layouts, navigation, landing or mobile presentation. Deliver stable typed data APIs, tested domain logic and integration handoff notes. Absolutely no writes to apps/teams or B2B production. packages/engine is shared: preserve every prior B2B fixture; prefer consumer-only wrappers in src/personal and src/planning.

User is away and explicitly grants autonomous repo changes, isolated branches/PRs, safe merges, and verification of final Vercel production. This run overrides CLAUDE.md's routine human approval pauses only for this scope. It does not override branch protections, CI, independent critic, security, privacy, reviewer gates, or no-direct-main policy. Never claim deployment on a preview, a stale deployment, or failed CI.

## Current verified state — audit again before each work session
On November 6 the live Vercel deployment is READY and matches main SHA 1e48a0c9, but GitHub consumer validation on the three latest main commits FAILED: 42294242927, 42293003820, 42289674402. Both the tests/types/lint/build and browser/visual evidence jobs report failures; detailed steps/log blobs were NOT accessible to the initial audit. The last passing consumer validation seen was 42063828012 on 5fa71ccb. Do not guess root cause or claim successful tests from Vercel READY.
The repo already has requestLedger, forecast, employerProfiles, familyPlan, calendarConflicts, schoolCalendar, payoutEstimate and an optimizer. Reuse rather than rewrite them. There were no open PRs at kickoff; recheck because Claude and workers may create PRs while running. GitHub Actions consumer-validation.yml is the primary validation. Current working date is November 6, 2026; travel demand currently uses 2025 US TSA daily checkpoint volumes indexed by month/day with drifting weekday patterns in later years, while non-US uses a coarse seasonal heuristic. Do not invent live pricing data.

## Agent organization and authority
Agent O — ORCHESTRATOR / integration manager. Single owner of gapless/eng-release-20261106. Reads CLAUDE.md, status, current main/PRs/CI, coordinates Claude file ownership, gives worker interfaces, resolves dependencies, integrates only reviewed code, owns one final PR to main and exact-SHA production verification. Logs durable state at docs/runs/engineering-20261106/STATUS.md. Can delegate real subagents if available; otherwise parallel scheduled isolated GitHub workers are acceptable, and logical roles may be sequential when tools cannot spawn subagents. Do not claim independent parallel execution if not actually available.
Agent B — BUG-FIXER / reliability specialist. Branch gapless/eng-bugfix-20261106, worker PR targets integration. Owns .github/workflows/consumer-validation.yml, regression scripts/fixtures and bug fixes negotiated with O. First critical path: recover failing exact-main CI; do not weaken tests. A nested diagnostic subagent may isolate runner infrastructure vs app failures.
Agent W — WALLET / ledger specialist. Branch gapless/eng-wallet-20261106, worker PR targets integration. Owns new src/personal/leaveWallet* domain, codecs, tests; O allocates any modifications to requestLedger, forecast or employerProfiles. Does not recreate policy accrual solver.
Agent C — CALENDAR / FAMILY / constraints specialist. Branch gapless/eng-calendar-20261106, worker PR targets integration. Owns consumer-only schedule/constraint modules and tests; O coordinates edits to shared calendarConflicts, familyPlan and employerProfiles.
Agent S — SOLVER / travel truth specialist. Branch gapless/eng-recommendations-20261106, worker PR targets integration. Owns src/planning recommendation adapters, travel evidence modules, tests, benchmark fixtures. Can only modify shared packages/engine after O and Q approve compatibility strategy.
Agent Q — INDEPENDENT TESTER / CRITIC. Read-only inspection of PRs and integrated candidate. Owns docs/runs/engineering-20261106/CRITIC.md. Cannot implement the feature under critique or falsely mark self-review independent. Blocks any merge when correctness, privacy, product truth, performance, tests or QA lack evidence.
Optional Agent P — Privacy/threat-model specialist reporting to Q; audit wallet import/export, sharing, feed URLs, localStorage migrations, email, personal calendars, security/limits.
Optional Agent T — Test fixtures/performance subagent reporting to S/B; solver benchmark, dates, regression/frozen B2B fixtures.

Parallel B/W/C/S work ONLY in their own branches and files. O synchronizes contracts and merge ordering; Q reviews independently. Workers cannot merge into main, deploy, touch Claude's UI files or change another worker's branch. O alone controls integration and final release. Do not start duplicate runs if worker branch/PR already exists.

## Stage 0 — baseline, ownership, contracts
Before code: check current main, docs, open PRs, active Claude/UX agent changes, Vercel sha and GitHub Actions. Read CLAUDE.md plus relevant policy/solver tests. Create or update run STATUS, noting each worker, branch, PR, exact head, CI, critic review and blockers. Record source contract for LeaveBank, WalletEvent, DateAvailability, ConstraintSet, RecommendationSet and TravelEvidence before conflicting modules integrate.
Own worker branch pattern and PR base gapless/eng-release-20261106. Prefer consolidated final release on main (one Vercel production push) rather than piecemeal production deployments, within GitHub and Vercel free quotas. No risky modifications to GitHub branch protection or secrets.

## Workstream B — engineering reliability / defects
B1. Investigate main CI failures via workflow run 42294242927 and other red run IDs. Retrieve actual job logs, steps and annotations where possible. Compare known green 42063828012. If logs missing, reproduce locally or in an authenticated runner/sandbox; distinguish job provisioning, action pin issues, Node/npm version, dependency install, TypeScript composite build, Vitest, runtime, Playwright, screenshot/Lighthouse, permissions or flaky tests. Never assert cause from red badge alone.
B2. Fix root cause, with before/after evidence and minimal regression assertion. Do not hide red results by disabling checks, converting failure to continue-on-error, or removing meaningful tests.
B3. Extend high-value tests across existing data flow: date-range URL roundtrip, saved employer holiday override, carryover and expiration, 9/80 schedule, annual and per-pay-period grants, leap and DST dates, pinned solver constraints, request state transitions and overlap dedup, family ICS import and privacy, optional account/feeds/reminders, absent data fallbacks.
B4. Ensure pull-request exact-head test, typecheck, lint, build, browser/mobile checks and integration commit tests. Consumer regression script must not accidentally run B2B tests unless shared engine touched; then run frozen shared-engine compatibility checks.
B5. Document any known functional bugs with severity/root cause/test and tracking links, especially notice-period expiry rescue, mismatch between last historical travel sample and advertised travel claim, missing source warnings, unbounded feeds. Do not spin up massive unrelated bug backlog.
B6. Introduce non-destructive production-gate check where supported, after CI green. A successful Vercel build is not a replacement for passing GitHub Actions checks.
Exit: reproducible failure explained, fixed verified exact SHA, CI green and critic acknowledgment. If platform CI broken beyond code and cannot be fixed with existing permissions, document as hard blocker and do not merge feature PRs into main.

## Workstream W — unified PTO wallet and timeline
W1. Design a versioned local-first model spanning multiple separate LeaveBank types: vacation/PTO, sick, personal, floating holiday, comp time, custom; explicit units/hoursPerDay and individual accrual/cap/reset/carryover rules. Reuse TimeOffPolicy and projectBalance/forecastWithRequests for calculations, don't add a second accrual engine. Preserve current single-policy default and legacy URLs.
W2. Define typed WalletEvent with id, effective date, category (opening, earned, grant, planned hold, approved debit, completed debit, adjustment, carryover, expiration, cap loss), leaveBankId, amount, unit, source reference, provenance; deterministic same-day ordering and idempotency. Pending/requested leave should affect tentative scenario only; approved/completed leave should not debit more than once.
W3. Provide deterministic snapshot and time-series selectors: balance today, as-of future date, accrued, already used, pending scenario, at-risk and projected next bank event, with readable explanation traces suitable for Claude's UI. Multiple bank policies remain independent; payout only applies to categories where supported.
W4. Versioned local migration/adapters from requestLedger and existing saved policy, with corruption defense, bounded collection sizes and no silent deletion. Keep private balance/salary, notes and identity out of public share URLs and analytics.
W5. Provide versioned JSON export/import codec with validation, conflict preview/explicit opt-in replacement; if implementing full import is too risky in first PR, deliver domain model + codec + tests and mark UI handoff rather than enabling unsafe partial importing.
W6. Tests: two bank types, 1.25 monthly fractional accrual, 9/80, partial pay periods, two overlapping approved requests, tentative vs confirmed, carried expired bank, month/year boundaries, invalid dates, malformed storage and idempotency.
Exit: canonical pure wallet model, future timeline and stable API, tests, minimal adapter, no duplicate deduction. Do not undertake unauthorised backend sync.

## Workstream C — intelligent calendars, partner/family feasibility, constraints
C1. Reuse calendarConflicts, familyPlan, schoolCalendar, employerProfiles and existing ICS parser. Define pure DateAvailability and ConstraintSet with event date, provenance, severity hard-block/review-needed/context, confidence, partial-source flags and missing data. No private event titles, contacts or child's identity in shared links.
C2. Explicit recurring work schedule adapter: standard weekdays, 4x10, 9/80, alternate weekends, phase-anchored rotating shift cycle, bounded custom recurrence. A 9/80 pattern must match existing default if used; no silent workday assumption.
C3. Constraint-aware planning BEFORE solving: hard excluded dates are passed into consumer solver; possible conflicts are scored and disclosed, not treated as hard unless user elects. Existing already-approved PTO is time already off, not always a scheduling conflict. School closure is planning context, not automatic obstacle.
C4. Two separate adults with independent budgets, workweeks, observed company holidays, request dates, regions and blackout calendars. Produce joint feasible spans, PTO cost for A and B, nonoverlapping alternatives, and sensible missing-data warnings. Avoid overwriting recipient local profiles with shared link data.
C5. Family school/childcare coverage should distinguish school off, parent already off, other adult off, paid PTO needed and uncovered days, without inventing household responsibility. Sourced district presets/manual/ICS stay supported. Date-only calendar and timezone-safe behavior.
C6. All external ICS parsing stays local unless user approves otherwise, with file-size/count bounds and recurrence truncation warnings. No mandatory Google or Microsoft account connections.
C7. Integration contracts for recommendation worker: exclusions, review-needed dates, secondary scoring and descriptive shortfall reasons. Source modules are pure and typed; no visual redesign.
C8. Tests for alternating Fridays, rotating shifts across DST/leap year, two jurisdictions, different observed holidays, school year spanning calendar year, incomplete data, double count, hard/soft behavior, ICS input bounds and different partner PTO costs.
Exit: common date availability model and tested two-person/family planning selectors, existing defaults unchanged, handoff to Claude.

## Workstream S — recommendation engine and travel evidence
S1. Build a typed recommendation set from existing solver with distinct objectives: maximize longest uninterrupted break, maximize number of useful getaways, balanced and best constraint fit. Each result must be feasible and genuinely different (or omit duplicates); provide dates, PTO costs, holidays used, remaining budget, objective and reason. No fake alternatives.
S2. Hard constraints must affect solver BEFORE candidate selection, soft constraints only ranking/penalty. Provide deterministic relaxation suggestions for impossible requested combinations. Include notice requirements, current balance/reserve, explicit blackouts, preferred dates; preserve pinned-day and minimum-length semantics and URL roundtrip. Favor consumer-only adapter so shared B2B engine behavior remains unchanged.
S3. Reassess travel-data methodology. Existing US source is 2025 TSA counts keyed MM-DD: weekday effect drifts in later years. Non-US is a four-branch coarse seasonal heuristic. Two safe strategies: (a) demote travel signal to transparent seasonal heuristic, remove false day precision and percentiles; (b) source-corrected multi-year weekday-relative estimate with explicit source/review date and data quality. Do not claim pricing, fares, live demand, or global measurement. Do not invent sourced observations.
S4. Define TravelEvidence data structure: observed vs modeled vs heuristic vs unknown, source/year, geography, sampling base, level of confidence, dates covered, caveats, comparison population. Distinguish exact PTO maths from estimated travel input. If no credible evidence, use neutral option rather than force misleading ranking.
S5. Preserve no-travel-preference w=0 result and frozen solver fixtures. No new algorithmic exponential cost; run benchmark windows 60/365/730 days with PTO 0/15/60/80 and varied workweeks/constraints; compare previous runtimes and output equivalence on legacy inputs.
S6. Tests US 2025/26/27 weekday drift, Feb 29, US federal moving holidays, selected non-US unsupported regions, same preference result determinism, blocked dates, conflicting soft preferences, duplicates, performance.
S7. UI handoff: machine-readable alternatives, tradeoff sentences from engine facts and travel evidence labels. Claude owns presentation. Correct misleading FAQ/marketing claims only via coordinated copy-only file changes.
Exit: feasible, distinct, source-honest recommendations with regression/benchmark evidence and B2B compatibility proof where shared code changes.

## Cross-cutting contracts
- Wallet uses one LeaveBank canonical policy model; no duplicated accrual arithmetic.
- Calendar produces privacy-safe date-only availability; hard exclusions not conflated with busy events.
- Recommendation wrapper consumes DateAvailability and Wallet selectors, outputs actual funded PTO cost and constraint/travel evidence.
- All dates ISO YYYY-MM-DD and bounded ranges; timezone-safe all-day handling, recurrence anchored, no local ambiguous string parsing.
- Signed-out parity; optional local/private storage; no unapproved paid API, new account requirement, employer database, OAuth, legal claims or generative chatbot.
- No private salary, policy excerpts, notes, precise location, calendar titles or balances in analytics/public URLs by default.

## Quality gates and independent critic
Q must be independent of implementing worker. For each PR review exact SHA, intent/scope/files, all new pure API behavior, tests, no B2B modifications, no secrecy violations, no claim of live data from heuristic, and type/build compatibility. Report GO/NO-GO with evidence, failures and remedial tasks. Final integration demands tests, TypeScript composite app, lint, npm run build, full browser/visual proof at 1440/768/375/320 if any UI affected, performance benchmarks, privacy verification and a complete cross-feature journey:
1. Saved employer calendar + wallet balance.
2. Multiple leave banks with independent policies.
3. Pending and approved requests never double debit.
4. Two people with different budgets and holidays.
5. A school closure and rotating work schedule.
6. Exclude hard blackout, score soft conflict.
7. Three objective-specific alternatives are feasible and genuinely distinct.
8. Travel estimate correctly labeled for source geography/year and no fake price claim.
9. Year-end carryover/expiration and time-specific forecast.
10. URL roundtrip/backward compatibility with legacy plans.
11. Storage corrupted/unavailable gracefully.
12. Pinned dates, minimum break and notice constraints.
13. No data leaked through partner links, public calendar feeds, or analytics.
14. No B2B changes or shared-engine frozen fixture drift.

Failed/unknown required checks are blockers. Never use a READY Vercel deployment to override red CI. If logs inaccessible, document the inability and collect independent test evidence; don't claim green. Critic can veto final release.

## Integration, release, and recurring execution protocol
- O creates/owns integration branch already established. B/W/C/S each create their uniquely named branch from current integration baseline and open DRAFT PRs with integration as base; no worker PR into main.
- B is merge-critical path. W/C/S implement in parallel on nonoverlapping modules. Coordinate common interfaces before edits. Q reviews independent branches as they mature. O serially integrates and reruns exact-head checks; do not merge a failing PR even into staging if it risks obscuring defects, except a documented CI repair strategy.
- Keep Claude UX changes untouched. Before final integration PR, bring latest main and resolve non-destructive conflicts without losing current consumer UX. If new main contains breaking changes, adapt your feature branch, not production UX.
- O creates ONE final pull request from integration to main. Merge through GitHub protected flow when tests and critic GO are verified, with no approval pauses beyond actual branch requirements. Verify Vercel production READY on final commit and smoke-test core routes.
- Prefer one production push to conserve Vercel free-tier quota. If CI remains red at release gate, do not merge; leave draft PRs and report exact blocker.
- Worker periodic task: read current source/status, implement substantial complete chunk, push PR/check CI, update own section of docs/runs/engineering-20261106/STATUS.md only through O to avoid write conflicts; write own issue/PR comments for status. Do not continuously emit status-only updates or duplicate worker branches.
- O periodic task: audit worker PRs, CI, Q review; integrate only safe changes, fix conflicts, deploy when fully done, then disable worker/critic/orchestrator tasks if supported. Do not stop after first successful PR or scheduled execution.
- This instruction explicitly grants ongoing execution while user is away. Actual task scheduling/subagent facilities must be used to make recurring work real; a one-off chat alone isn't continuous.
- Final report must list actual completed source changes, PR URLs, passing test runs, critic verdict, merge SHA, Vercel READY SHA, skipped/unreleased items and outstanding blockers. Never present planned work as deployed.

## Immediate first tasks
B: reproduce and diagnose red GitHub Actions runs, then fix with regression proof.
W: write wallet contract and tested pure one-to-many bank adapter without editing existing UI.
C: write schedule/constraint contract and tested recurring calendar availability adapter.
S: analyze 2025 TSA weekday drift and design source-truthful replacement with tests and frozen solver compatibility.
O: register/coordinate workers, create PRs, enforce ownership, CI repair gate and final release sequencing.
Q: independently inspect the CI regression and design exact-sha critic checklist, then review each worker PR.