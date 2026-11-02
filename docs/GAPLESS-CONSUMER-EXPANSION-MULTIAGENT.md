# GAPLESS — CONSUMER EXPANSION MULTI-AGENT DIRECTIVE
## Approved scope; execution gated on completion of the earlier UX run

**Status:** Owner approved the expansion on November 2, 2026. **Do not start feature implementation until Gate 0 confirms the preceding "Gapless UX deployment run" is complete.** Staging this instruction file and registering a conditional handoff automation are authorized immediately. No release or merge may be claimed until verified.

**Repo:** Atiyk/PTO-Optimizer  
**Consumer production:** https://pto-optimizer-seven.vercel.app/  
**Target:** Consumer Gapless only; do not edit the separate B2B product in apps/teams or its database, UI, branding, infrastructure or users.  
**Default branch:** main  
**Execution authorization:** Once Gate 0 passes, owner explicitly permits coding agents to branch, test, open PRs, merge safe green PRs through standard GitHub controls, and verify Vercel production without a routine human signoff between phases. No bypass of CI, reviewers, branch protection or permission limits. Unverified work must stay unmerged.

---

## 0. MANDATORY HANDOFF GATE — NEVER SKIP

This run is **strictly downstream** of the preexisting automation named **Gapless UX deployment run** (historical task identifier 6ae888a6a99c819180777bbd6ec10377). There may be a separate currently scheduled UX automation and open UX PRs. Verify live state; do not infer completion from an old chat or timestamp.

At each scheduled check, the orchestrator must:

1. Read the actual status and most recent run/result of "Gapless UX deployment run" from Automations when available. Treat enabled/scheduled, in-progress, unknown delivery, null last_run, and no_update as **NOT evidence** of completion. A "last run completed" is not the same as the overall work being finished.
2. Inspect current GitHub main, open PRs and merged PR history; particularly the UX PRs #82 and #83 and any successor PRs. Check whether required UX changes and critic evidence have landed.
3. Inspect the production Vercel deployment, with verified READY status and commit SHA consistent with the accepted UX release. A READY deployment of an older commit does not pass this gate.
4. Confirm the previous workflow explicitly reported complete, stopped/disabled or exhausted its schedule without outstanding work, AND its intended UX deliverables are merged/deployed; or locate an equivalent explicit completion handoff signed off by the earlier orchestrator and corroborated by GitHub/Vercel. Never treat a premature stop as successful completion.
5. Check there is no concurrent agent performing an overlapping consumer UX implementation. If any uncertainty, **do not start code implementation**. Record the blocker and revisit next scheduled check.
6. After Gate 0 passes, record a timestamp, previous run evidence, last merged UX SHA, and deployment SHA in a dedicated expansion status file under docs/runs/consumer-expansion/. Branch only from the then-current main.
7. Do not modify or prematurely terminate the earlier automation. Do not change existing UX PRs without coordinating their owner.

**No implementation branch, data model migration, new tool routes or visual redesign is allowed before this gate passes.** This directive file may exist on an unmerged documentation branch while waiting.

**Idempotency:** Multiple watcher invocations must not create duplicate branches, PRs, migrations or conflicting worker efforts. At most one orchestrator may own the integration/merge queue. Before starting work, inspect previously created expansion PRs and the run status.

---

## 1. ROLE AND PRODUCT MISSION

Act as the autonomous product and engineering organization for **Gapless**, a calm premium consumer utility helping individuals understand and deal with workplace time-off systems. PTO optimization remains the searchable entry point; a cohesive private time-off companion is the retention product.

**Positioning:** "Make work work better for your life."  
**Product promise:** "Understand your time off. Make more of it."

The overall user jobs:
- What PTO do I have, how is it earned, and what can I use on a specific date?
- Which dates can I take to make the most of my employer holidays and PTO?
- What could I lose due to carryover or expiration?
- What might my accrued unused PTO be worth when I leave?
- How do my work calendar, school closures, prior requests, and important appointments interact?
- What does my employer policy actually mean, and what should I confirm with HR?

All core calculations are deterministic and explainable. Any generative AI is an optional helper, never the balance, legal or payout source of truth. Signed-out experiences work as fully as practical and never require an account for calculations. Keep private user data out of public share URLs and crawlable pages.

---

## 2. AGENT ORGANIZATION AND OWNERSHIP

### Agent O — Orchestrator / Product & Engineering Lead

**Single accountable owner** of plan, PR integration, quality decisions and production promotion. The orchestrator:

- Passes Gate 0 before any feature implementation.
- Reads root CLAUDE.md, docs/REDESIGN-SPEC.md, relevant prior PRs and tests, and current production/preview metadata.
- Audits what is already shipped; avoid replacing existing working systems with duplicates.
- Commissions independent UX research and legal primary-source verification.
- Maintains architecture/dependency graph, file ownership, phase acceptance criteria and a prioritized release backlog.
- Delegates work only when agent subdelegation is actually available. Otherwise performs the same logical roles sequentially and reports that limitation.
- Prevents simultaneous edits of central URL, policy, calendar, and app state modules. Workers use isolated worktrees/branches with explicit contracts.
- Owns all PR creation, merge sequence, post-merge smoke tests and Vercel READY-SHA verification.
- Maintains docs/runs/consumer-expansion/STATUS.md (states: waiting → building → reviewing → merging → deployed; with a terminal blocked state).
- Resolves ordinary implementation questions autonomously, documenting assumptions.
- Escalates only blocked permissions, high-stakes legal ambiguity, destructive data changes, mandatory new paid services, or material scope changes.

### Agent D — Consumer Design System & UX Research

Owns consumer visual system, desktop and mobile interaction design. Study useful interaction **patterns** from premium D2C examples such as Monarch Money (clear balances), Wise (transparent calculations), Airbnb (dates and flexible planning), Apple Calendar (calendar views), and Linear (restrained precision). Do not copy their branding, protected art, typography assets or proprietary layouts. Capture before/after screenshots of actual pages at 1440 / 768 / 375 / 320 px. Improve visual hierarchy, readability, card density, empty states, form spacing, touch targets, motion, navigation and per-feature cohesion.

### Agent P — Policy, Forecast & Ledger Engineer

Owns shared canonical policy inputs, current/forecast balance calculations, accrual, carryover, expirations, planned/requested/approved/completed ledger interaction and explanatory traces. Must reuse current src/policy, src/personal, src/ui/QuickForecast, and related engine code rather than building a second policy calculator. Provides stable typed interfaces and unit-testable pure calculations. Does not research or invent employment laws.

### Agent L — Payout and Jurisdiction Research Specialist

Owns the consumer departure payout estimator and jurisdiction rules registry. Builds **primary-source-first**, effective-dated, review-dated, leave-type-sensitive, state/country-scoped legal facts. Separates mandatory law, conditional law, employer-plan assumptions, unresolved questions and unsupported jurisdictions. Checks voluntary/involuntary departure only where relevant. Uses official agencies/statutes and short source quotations/linked citations; no unverified coverage claims. Independently cross-checks edge cases, partial accrual and monetary calculations with the policy agent.

### Agent C — Calendars & Scheduling Specialist

Owns reusable employer calendar profiles, country/region public holidays, observed holidays, custom workweeks, manual/ICS school calendars and conflict detection. Shares one date normalization and local time/all-day event handling implementation. Does not introduce mandatory Google/Microsoft OAuth. Guards against leaking imported event details.

### Agent U — Understand/Content & Information Architecture

Owns revamped Understand area, plain-English policy explanations attached to calculator outputs, linked worked examples, guides, HR question prompts, editorial standards, source attribution, country-specific disclaimers, metadata, semantic markup and routes. Content should be genuinely useful, not SEO boilerplate. Avoid unsupported legal advice and country law assumptions. Works with L to date and source legal claims.

### Agent M — Mobile/PWA & Consumer Accessibility

Owns responsive patterns, mobile menu, compact balance summaries, readable calendar and breakdowns, keyboard/touch access, PWA checks and native-app architecture recommendation. Do not start a full native iOS/Android codebase or app store release without separate approved credentials and requirements. Treat mobile web/PWA as the shipping target now; architecture should allow later shared logic.

### Agent A — Agent-Readability and AI Feature Evaluator

Owns semantic/pre-rendered discoverability, accessible controls, site links, useful structured data, accurate robots/sitemap and optional llms.txt navigation. Evaluate deterministic "Why this forecast / payout / plan?" explanations first. Propose optional consent-based handbook extraction and natural language constraint entry only after explicit privacy, cost, citations and prompt-injection review. No generic chat widget, fake AI, paid model subscriptions or unapproved private-data uploads.

### Agent Q — Independent QA / Security / Critic

**Must not implement the feature being reviewed. Has blocking authority over merge recommendations.** Reviews against acceptance criteria, correctness, legal claims, security/privacy, mobile usability, keyboard navigation, regression behavior, performance and the actual visual design. Must reject a visually rough but technically green release. Maintains test matrix and unresolved issue log. Only the orchestrator performs merges, and only after Q signs off and all required checks pass.

---

## 3. DESIGN DIRECTIVE — CALM PREMIUM UTILITY

**Brand:** In app chrome, prefer short **Gapless** wordmark; retain descriptive PTO Optimizer language in SEO titles and first-visit context. Existing logo may be simplified with care; no generic AI iconography.

**Candidate palette, subject to contrast tests:** page #F7F8F5, surface #FFFFFF, ink #1F2933, muted #62706B, primary forest-sage #345F50, soft selected #E4EDE7, border #E2E7E2, warm secondary #B89B79. Avoid saturated orange as ubiquitous brand accent. Do not use inaccessible low-contrast sage text.

**Typography:** Keep Figtree unless a tested alternative is clearly superior. Strong numerical hierarchy, tabular balances, calm spacing, readable labels, meaningful headings, restrained shapes and surfaces. Avoid nested outlined card overload, decorative badges and numerous competing primary CTAs.

**Information architecture:** Consumer first-level navigation should conceptually support **Plan**, **My time off**, **Understand**, **Tools** and a single useful action. Desktop header must remain uncluttered; mobile nav is touch-friendly and explicit. Relevant subfeatures are surfaced through contextual entry points, not an enormous top-level navigation. Do not create links to incomplete destinations.

**Homepage:** Lead with real solver-backed vacation benefit, inputs and visible resulting dates/observed holidays; then concise links to Plan, Know what you have, Stay on top of it. Include what is private, what is estimated, and easy next actions.

**Planner:** Both existing planning sliders remain directly accessible (not hidden in More Options or replaced by a select-only planning style). Results update live without Generate; keyboard and touch work. Keep complex calendar rules in advanced sections. Mobile hierarchy: result → essential inputs and sliders → top three breaks → compact calendar → advanced options.

**Shared style:** Forecast, payout, carryover, school calendar and conflict features reuse design tokens, cards, input patterns, help copy and sensible loading/error states. Every feature has one strong user-facing question and one understandable next action. Preserve visual identity between desktop, mobile web and potential future native application.

---

## 4. FEATURE REQUIREMENTS AND ACCEPTANCE CRITERIA

### F1 — Consumer PTO payout estimator at departure (highest acquisition priority)

Route suggestion **/tools/pto-payout**, integrated with policy and relevant Understand guides. Never link the consumer calculator to the B2B payout database/API. Prior PR #72 primarily targets B2B; **do not merge or repurpose B2B changes blindly**.

**Core question:** "If I leave my job on this date, what could my unused PTO be worth?"

Inputs: work jurisdiction (not merely home address), leave type/category, departure date, current balance/as-of date, accrual method and rate, future approved leave, relevant waiting/vesting rules, employer policy selection (pays all / pays capped / does not pay / unknown / custom), hourly wage or annual salary and work-hour assumptions, separation type only where legally material.

Modes:
1. **Company-policy scenario:** calculate per user-entered employer rule, clearly identified as an assumption.
2. **Jurisdiction-informed scenario:** enforce verified mandatory state/country legal conditions **only when adequately sourced and applicable**. Otherwise display unverified/unsupported, not a guessed yes/no.
3. **Comparison:** identify divergence between a company-policy scenario and a mandatory legal baseline without claiming to adjudicate a dispute.

Result: projected unused days/hours on departure, eligible payable portion, estimated **gross** monetary amount, breakdown, official links and review dates, assumptions and questions for HR. Explain ambiguity; no promised payroll, legal entitlement or tax take-home estimate.

Build a typed versioned jurisdiction registry with scope/effective date/source reviewed date/applicability/leave categories/conditionality. Initial rollout must be limited to genuinely verified jurisdictions; progressively expand. Federal/state/country rules are not interchangeable. Monetary conversion must define annual hours, fractional accrual, prorating and units. **No fake 50-state coverage.**

Tests: leave already deducted from starting balance not deducted twice; partial pay periods; arbitrary separation date; hours/days; voluntary/involuntary conditionality; unlimited PTO unsupported in a cash-balance context where appropriate; multiple leave categories; unknown law; company rule conflicts; gross amount and rounding.

### F2 — Connected policy explainer

The existing policy page and glossary should feel like one conversation: "Here's how your policy works." For each user-entered policy rule (front-loaded/per-period/per-hour, cap, carryover, expiration, plan-year, negative balance, waiting period, unlimited, payout) show plain explanation + scenario + exact projection impact + relevant linked guide + HR verification question. Use deterministic traces from policy model; preserve advanced inputs. Handbook paragraph keyword matching may not be labeled verified legal extraction or AI interpretation. Optional AI parsing is future gated experimentation only.

### F3 — Country-specific planner

Preserve and improve existing US, UK, Canada, Australia, Germany, Ireland, and India routes. Correct national/regional and substitute/observed holidays, workweek/date conventions and locale terminology. Each country route needs a genuine grounded example, upcoming holiday bridges, data explanation and contextual solver link. Clearly distinguish **holiday planning supported** from **local law/payout rules supported**. Do not imply global employment-law coverage. Localized content must be sourced, dates checked by region and year, and SEO pages have unique real content.

### F4 — Quick PTO balance forecast

Refine existing QuickForecast; do not duplicate. Minimal current balance, as-of date, accrual mechanism/rate, future date, expected approved leave. Preselect 1/3/6 months and year-end while preserving arbitrary date. Show current → earned → scheduled used → forfeited/carryover adjustments → expected available. Immediate results, saved local preferences where appropriate, graceful unknown-state handling.

### F5 — Date-specific balance forecast

Use identical engine and policy model as F4. Any future date, scenario comparison before/after proposed vacation, planned/requested/approved separately where appropriate, accrued portion and reset/expiry timeline. Approved and completed requests must never be double charged against a present balance. Units/precision explicit. Share reproducible planning assumptions without leaking private ledger entries.

### F6 — Expiration & carryover planner

Build on existing ExpirationGuard and policy alerts, not parallel alerts. Show projected reset-date balance, eligible carryover, expiring days, at-risk carried portion with separate deadline, accrual-cap lost credits, after-reset balance. "Use them" opens feasible PTO optimization range; "Carry them" shows policy-based future balance. ICS reminders and in-app alerts only unless an actual verified scheduled delivery system exists. Full carryover and non-calendar plan years must not cause false forfeiture claims. Test partial carryover, no expiry, approved future leave, reset boundaries and source unit conversions.

### F7 — Employer holiday profile & reusable work calendar

Unify existing employerCalendar preferences with country/region, public holiday opt-outs, company holidays, workweek, alternating Fridays, custom recurring unavailable days and planning-year configuration. Save/edit/reset named local profiles, scoped by jurisdiction and version. Explicit URL overrides take precedence only within an opened plan; do not overwrite recipient's saved profile. Reuse same calendar in solver, tracker, forecasts where scheduling relevant, school planner and conflict checker. No employer identification required; no sensitive details in public URLs. Preserve old shared URLs.

### F8 — School-calendar mode

A family/education-focused planning mode. Phase 1 **must work via manual dates and local ICS import** for school breaks, school closures, staff days and academic year; a selected verified district catalog may follow only when source data can be reliably maintained. Compare school off-days with employer off-days, display mismatch and suggest qualifying vacations; label in-session school days and school closure days differently. No guessing district dates, exposing child identity or claiming a universal district directory. Tests: all-day timezone events, DST, school-year crossing, duplicates, local/offline import failure and family schedule conflicts.

### F9 — Calendar conflict detector

Check selected vacation against declared blackouts, approved/requested leave ledger, local ICS busy events, school calendar and user-entered commitments. Use clear categories **hard block**, **review needed**, **no conflict found in available data**. Never assert complete freedom from conflicts when the calendar is partial. Inline conflict indicators on suggested break cards, accessible conflict detail and easy action to exclude days. Reuse current calendar import and avoid storing full event titles/participants unnecessarily. Process files locally, bound file size and event count, reject malformed payloads and provide clear deletion. No mandatory OAuth integration.

### F10 — Understand as a substantive learning destination

Provide Understand index plus topical guides:
- How accrual works (front-loaded versus earned per pay period).
- What happens to unused PTO and when it expires.
- Carryover and policy resets.
- Employer-observed holidays versus public holidays.
- How to read a PTO handbook and questions for HR.
- What may happen to unused vacation when leaving a job.
- Estimating PTO on a future date.
- Planning around school schedules and calendar conflicts.

Each guide: immediate plain-language answer, worked numerical example validated against engine or labeled illustrative, action link to calculator, jargon definitions, common mistakes, primary-source citations for legal claims, effective/review date and uncertainty. Prefer 8 exceptional pages over 50 thin pages. Update navigation, routes, prerendering, sitemap, metadata, responsive readability and links. Do not overpromise FAQ rich result eligibility.

### F11 — Agent-readable site and constrained AI exploration

Use semantic accessible HTML, stable descriptive URLs, real server/prerendered text, explicit labels/values, accurate structured data, robots/sitemap and optional non-authoritative llms.txt. Do not claim llms.txt is required by AI Search. A future read-only agent planning interface requires strict input bounds, no private defaults, clear rate limits/abuse analysis and deterministic calculations; propose it before implementation if no safe infrastructure exists.

Evaluate four AI-adjacent ideas in docs:
1. Deterministic "Why this plan/forecast/payout?" narratives derived from calculation traces.
2. Natural-language request mapped to transparent editable solver fields.
3. Consented handbook clause extraction with highlighted original quotes and user confirmation.
4. Personalized leave recommendations with strictly tool-calculated totals.

Ship (1) if tested. Do not provision an AI API, paid provider, unreviewed upload or legal advice chatbot without a separate authorization. LLM output never overrides deterministic results or legal sources.

---

## 5. SHARED DATA MODEL AND ARCHITECTURE CONTRACTS

Before worker implementation, O/P/C/L agree on a written canonical contract:
- Policy: accrual unit, rate, reset, carryover, cap, effective dates, current balance/as-of date.
- Leave ledger: planned/requested/approved/rejected/canceled/completed, future/past, deduplication and overlap.
- Employer calendar: country/region, selected observed holidays, workweek/alternate schedule, blocked days.
- School calendar: event category, UTC/local date normalization, source and verification.
- Conflict: start/end, severity, category, data provenance; never silently infer hard conflicts.
- Payout: jurisdiction + leave category + rule provenance + employer scenario + departure balance + gross pay assumptions.
- Privacy: private local profile/ledger versus intentional minimal public share.

Existing code wins when it already has correct interfaces. No second calculation engine, no parallel conflicting localStorage keys for the same domain object. Separate pure functions from React and browser APIs. Add migrations for persisted state and test old versions and bad data. Use UTC-based date utilities already in repo; never locale-ambiguous parse.

**Every planning input rounds trips through the existing versioned URL approach; private notes, private request statuses, personal salary, balances, imported calendars and employer name MUST NOT automatically enter URLs.** User consent is required for any deliberate sharing of personal financial details. Preserve existing routes and SEO.

---

## 6. DELIVERY PHASES — SEQUENTIAL GATED RELEASES

### Gate 0: Earlier UX workflow complete
No feature code until predecessor explicitly finished, merged changes verified, production SHA matches, no overlapping worker ownership.

### Release A1: Baseline/architecture and calm premium
Audit latest repo, screens and CI; create design tokens and navigation, restore/protect visible planning sliders, mobile-first fixes. Ship in focused PRs and verify deployment.

### Release A2: Connected policy + unified calendar foundation
Refine quick and date-specific forecast, shared calendar profile and policy explainer. Cross-feature deterministic tests.

### Release A3: Consumer PTO payout estimator
Build source-backed policy/law engine, company scenario, sourced jurisdiction coverage and monetary UI. Keep jurisdiction scope limited to what can be verified. Independent legal critic review required.

### Release B1: Expiration / carryover
Use one policy model and make existing guard actionable. Integrate with optimizer and ledger.

### Release B2: School calendar + conflict detector
Build reliable manual/ICS functionality, reuse employer calendar and calendar events, integrate warnings into breaks.

### Release C1: International planning + Understand
Improve existing country routes and publish substantial guided content around calculators. Maintain distinct law-support coverage labels.

### Release C2: Agent access + AI decision memo
Improve semantic structure and documented discovery; ship deterministic explanations if safe and useful. Defer generative features lacking explicit privacy/cost authorization.

Each release must be useful on its own, merge through regular PRs and verify production SHA before progressing to dependent features. Workers may research in parallel, but integration order is serial and review-gated.

---

## 7. TESTER/CRITIC ACCEPTANCE GATES

The independent Q agent must explicitly approve each PR with:
- correctness proof, pure unit and integration tests;
- existing consumer tests, typecheck, lint, build and prerender checks;
- relevant workspace regressions if shared engine changes;
- live browser visual evidence at 1440, 768, 375 and 320 px;
- accessible headings/labels, focus order, keyboard use, touch sizes and WCAG 2.2 AA contrast;
- no horizontal mobile overflow, no hidden slider, no unintelligible forms;
- no raw employee data in URLs, analytics or AI requests;
- unknown or unsupported legal rule states are honest and sources verifiable;
- no redundant policy/calendar math or accidental B2B changes;
- SEO and existing country routes remain functional;
- Vercel preview and check status actually observed.

Mandatory scenario matrix:
1. Default 15-day PTO plan consistent across formats.
2. Change employer-observed holiday, refresh and share assumptions safely.
3. Saved employer calendar applies across planner, forecast and tracker.
4. Pay-period partial accrual through selected departure date.
5. Employer pays all, capped, none and unknown; separate law-dependent results.
6. Conditional state rule with a counterexample; missing source → unknown, not fake payout.
7. Sick leave not automatically treated like vacation.
8. Unlimited leave has no invented accrued cash balance.
9. Date forecast before/after a proposed request, including status changes.
10. Approved time off deducted only once; overlapping requests deduped.
11. Accrual cap, carried expiration and year boundary.
12. Full carryover does not falsely trigger forfeiture.
13. Country-specific regional and substitute holidays.
14. School holiday ICS import across DST and school year.
15. Calendar hard conflict versus advisory event with incomplete data.
16. Preview/private share never includes salary, policy text or notes.
17. Old URL restores and solver remains deterministic.
18. Mobile nav, visible sliders and live outputs usable with touch and keyboard.
19. Storage unavailable or maliciously malformed JSON fails safely.
20. No B2B cross-product data flow or app changes.

Run: npm test, npm run typecheck, npm run lint, npm run build plus existing Playwright/visual evidence workflow and any appropriate workspace checks. Do not weaken or disable tests. Critic's red status blocks merge. Missing test tooling is not equivalent to a passing test.

After merge, verify Vercel READY deployment on the exact merged main SHA, smoke test impacted production pages and capture evidence. If deployment fails, investigate and fix through an additional PR or restore last verified release through supported mechanisms. Never claim completion from a merged PR alone.

---

## 8. PRIVACY, LEGAL AND SECURITY

- Local-first baseline; no mandatory account or new server DB.
- Imported ICS parsed locally; guard against event injection and excessive file size/count.
- Do not transmit salary, private employee policy, pay rate, calendar event content, request notes or balances via analytics.
- Keep company-policy payout estimate distinct from verified mandatory legal rights. Show source and review date, leave-type and coverage caveats.
- No paid provider, native app-store publishing or law-data subscription without approval.
- No employer claims, payroll transfers, contacts to HR or promises to send reminders without actual working integration.
- Include user-driven clear/delete of local data.
- Never store private state in cacheable prerendered pages or public plan URL by default.
- Do not merge changes to apps/teams, migrations, employer-scoped code or B2B UI in this run.

---

## 9. METRICS AND PRODUCT-MARKET-FIT DISCIPLINE

Add privacy-safe meaningful analytics with no individual leave/salary values:
- Landing → optimizer meaningful plan completion.
- Employer calendar reuse.
- Quick and date-specific forecast completion.
- Payout estimate completed and informational source viewed.
- Expiry planner action to plan leave.
- School calendar import/manually configured.
- Conflict checker used and resolved.
- Request tracked, shared availability/export.
- Repeat use where available without persistent identity.

Hypotheses to evaluate: early-career salaried workers, couples coordinating two employers, families with school calendars, employees near year-end forfeiture, users exiting a job. These are hypotheses not proven PMF. UI should communicate one job per destination, not expose every tool equally on the homepage.

---

## 10. BRANCH, MERGE, DEPLOY AND PROGRESS PROTOCOL

- Docs may be staged now; implementation starts **only after Gate 0**.
- Each phase gets a dedicated feature branch based on fresh main, focused PR, test evidence, screenshot evidence, critic review and Vercel preview.
- Never direct commit to main, force push main, bypass required reviews or override protected branch checks.
- No parallel writes/merges to the same branch; no duplicated outstanding PRs across runs.
- Orchestrator only merges green PRs and verifies prod SHA. Maintain docs/runs/consumer-expansion/STATUS.md with workstream, owner, branch, PR, commit, checks, screenshots, production SHA and blocker.
- When blocked, document precisely, keep work unmerged and proceed with truly independent tasks. Do not conceal unfinished coverage behind a "completed" banner.
- Prefer safe incremental web/PWA releases; native mobile architecture is a proposal, not an unapproved app-store launch.

**Final report:** merged and deployed features with actual PR links/SHAs, production URL and READY SHA, screenshots desktop/mobile, test and critic results, jurisdiction rule coverage/source list, limits and open work. Never claim future background work without a real scheduled action or a persistent coding environment.

## 11. SINGLE-ITERATION AUTOMATION HANDOFF

A scheduled agent invocation must execute one safe unit of actual work and maintain state for the next invocation. It must first evaluate Gate 0 and **return with no source changes** if the predecessor still runs or completion is unverifiable. When predecessor is complete, continue implementation according to the phased plan, using connected GitHub/Vercel tools, persistent environments or delegated coding agents only if actually supported. Do not pretend that a chat invocation alone can keep processes running after completion.

Once all releases are finished, disable the new automation when authorized and supported to avoid duplicate work. If stopped by a hard platform blocker, report it and do not assert success.

**OWNER DIRECTIVE:** The approved scope and unattended merge authorization become active only when Gate 0 passes. Execute in this order, with one orchestrator, designated specialist workstreams and independent blocking critic.