# Consumer payout scenario foundation — draft contract (2026-11-02)

**Branch:** `gapless/expansion-payout-scenarios-20261102`  
**Status:** isolated consumer-only domain code, not a live estimator, not approved for merge or deployment. UX predecessor release Gate 0 remains closed.

## Scope and ownership

- New `src/personal/payoutEstimate.ts` uses **the existing** `forecastWithRequests` and `TimeOffPolicy` projection. No second accrual/ledger engine, B2B payout code, database, route, URL parameter, analytics event or storage key.
- Caller supplies departure date, **work** jurisdiction, currency, gross pay rate (hourly or annual with explicit annual work hours), and **separate** leave-category policy/balance and employer payout assumption.
- Company scenarios: pays all, pays none, capped native units, unknown. The result carries native days/hours, converted hours, gross cents, accrual/consumption/expiry trace, unresolved categories and explicit caveats.
- The existing request ledger does **not** encode leave category. Callers must pass category-scoped requests per line; never silently apply the same unfiltered ledger to both vacation and sick leave.
- Future approved UI must store private salary, balance, requests and work location locally (or in an expressly authorized private account), **never in public share URLs, metadata, analytics, prerendered HTML or AI requests**.
- Unlimited PTO is **unsupported** as a banked cash payout. Unknown employer rule is `null`, not zero. Sick leave never inherits vacation's payout assumption.

## Critical legal boundary

There is **no jurisdiction registry or verified mandatory-law rule in this PR**. All mandatory payout, legal comparison and source-review fields are explicitly `not-verified` / `null`, for **every** work jurisdiction and departure type. The code is a **gross company-policy what-if**, not a legal entitlement estimate or promised final payroll.

Before a jurisdiction-informed mode can ship, a separate primary-source-reviewed registry must include: work jurisdiction, effective date and last reviewed date, statutory/agency link, leave category, conditions (including separation type where relevant), applicability exclusions, rule provenance and an independent legal critic's review. Unknown rules must remain unknown. No fake 50-state coverage, tax calculation or implicit FX conversion.

## Numeric and ledger conventions

- Native policy units stay unchanged through `forecastWithRequests`; days convert to hours via `hoursPerDay`; hourly gross = payable hours × rate; annual salary requires **explicit** annual work hours, never a hidden 2,080 assumption.
- Round to the nearest cent **only after** multiplication. Reject non-finite, unsafe, out-of-range values and duplicate leave categories. Negative bank balances have zero positive unused units; an unfunded-leave warning is included.
- Approved/completed requests are deducted only for dates **after** `balanceAsOf`; overlaps are unioned by the existing forecast. Requested/planned remain tentative, not a confirmed payout deduction. Plan-year resets, carryover, expiry, accrual caps and pay-period timing come from the existing policy projection.
- Unknown or unsupported category makes the **total** null; a separately named known subtotal is shown for audit, not misrepresented as a complete estimate.

## Independent review / release blockers

1. GitHub exact-head consumer tests, typecheck, lint, build, and existing browser/visual checks must pass.
2. Independent tester/critic must review calculation correctness, malformed inputs, privacy and legal unknown-state behavior. Implementer-authored tests are not independent approval.
3. A separate user-facing integration PR must provide accessible desktop/mobile 1440/768/375/320 evidence, verified legal sources if jurisdiction-informed mode is enabled, and source-review dates.
4. The UX predecessor must explicitly finish and all its releases must be merged/QA-approved and Vercel production READY at matching main SHA.
5. Vercel quota must recover, exact-head preview must be READY, and final production SHA must match after permitted merge.

Do not claim this module is a shipped payout calculator. No Vercel deployment is attempted while quota is exhausted.
