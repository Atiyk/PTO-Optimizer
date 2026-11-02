# Consumer release regression matrix

Release date: November 2, 2026. Scope: consumer Gapless only. B2B `apps/teams`, its data flows, database and configuration are unchanged; the full remote subtree SHA `ce2bedc3bca5c97593819583dc53506c25e70e98` matches baseline. Root Vitest excludes `apps/**`; this report does not claim B2B functional end-to-end testing.

## Final evidence

- **926 tests passed in 94 files**, with consumer types, lint and standard production build passing in [final integrated CI 41409562702](https://github.com/Atiyk/PTO-Optimizer/actions/runs/41409562702).
- **Six mobile browser journeys passed**, including the expiration/reminder flow. Reports record no application runtime errors or unexpected account requests.
- **12 responsive route/viewport combinations plus expanded options passed** at 1440/768/375. Candidate axe: zero violations in four initial-route scans and expanded PTO options. Lighthouse accessibility/SEO: 100/100 on all four routes.
- [Artifact 13124822600](https://github.com/Atiyk/PTO-Optimizer/actions/runs/41409562702/artifacts/13124822600) contains raw reports, screenshots, actual exported PNG/ICS and analytics transport evidence. CI head: `1316942b7323f063c50c8eadfd8e993a270d2f75`; reported synthetic tested merge: `d2cd0ac3c6cbd7ce08604ed80ae0249149ecfc7e`.
- All eight phase PRs [#73](https://github.com/Atiyk/PTO-Optimizer/pull/73)–[#80](https://github.com/Atiyk/PTO-Optimizer/pull/80) are merged. All eight consumer deployments reached READY at their merged commits; final production `dpl_5K3uu8ZLDPeTzoM3RDJjz3K2jYyz` serves `430c9cda7268f994160cf5a7477207e69df75b77`. Live flows and the actual production PNG were verified; inspected application-domain error logs were empty. Exact merge/deployment records appear in [the release report](CONSUMER-IMPLEMENTATION-STATUS.md).

Each row identifies the assertions actually covered. A calculation test is not described as a browser flow, and measured CI behavior is not generalized to every employer policy or browser privacy mode.

## Required 20 scenarios

| # | Scenario and asserted behavior | Actual automated source | Final evidence |
|---|---|---|---|
| 1 | US employee with 15 PTO days: deterministic meaningful breaks; unique cost fits balance after reserve | `src/planning/optimizer.test.ts` realistic consumer cases; `packages/engine/src/solver/solve.test.ts`; `src/ui/Headline.test.tsx` | Passed in final 926-test CI, including the 15-day/three-day-reserve fixture. Production planning-style/budget smoke also passed. |
| 2 | Uncheck an observed holiday: it becomes a working date, changing real PTO cost; restoring it reverses the change | `src/ui/employerCalendarIntegration.test.tsx`; `src/personal/employerCalendar.test.ts`; `src/planning/optimizer.test.ts` | Unit/live-state integration and final employer-calendar browser journey passed; production exclusion/save/reset changed the actual plan as expected. |
| 3 | Save/revisit employer calendar: refresh restores it; country and subdivision stay independent | `src/ui/employerCalendarIntegration.test.tsx`; `src/personal/employerCalendar.test.ts`; `src/ui/useRequestCalendar.test.tsx` | Country/subdivision isolation passed in unit/hooks; save/revisit and custom-day persistence passed in the real final browser journey and production smoke. |
| 4 | Shared holiday overrides outrank local settings without overwriting the recipient’s saved preferences | `src/ui/employerCalendarIntegration.test.tsx`; `src/personal/employerCalendar.test.ts`; `src/ui/Landing.test.tsx` | Passed in hooks, homepage handoff and final browser journey; actual recipient storage remained unchanged after an explicit shared override. |
| 5 | Five-day minimum changes candidate eligibility before optimization; impossible constraints never silently relax it | `src/planning/optimizer.test.ts`; `src/ui/planningUrlState.test.ts`; `packages/engine/src/solver/minimumBreakDays.test.ts` | Passed in candidate-selection, impossible-minimum and URL tests. Production planning styles recalculated live; no minimum is silently relaxed. |
| 6 | Blackout date cannot be purchased or bridged as time off, including required-date conflicts | `packages/engine/src/solver/solve.test.ts`; `src/planning/optimizer.test.ts`; `src/planning/partner.test.ts` | Passed normal/partner constraint assertions and mandatory-date conflict cases. This row relies on calculation tests rather than a separate blackout browser journey. |
| 7 | PTO is funded on the actual spending date; future accrual and break-end credit cannot fund earlier workdays | `src/planning/optimizer.test.ts`; `src/policy/projection.test.ts`; `src/personal/forecast.test.ts`; `src/planning/partner.test.ts` | Passed per-date funding, fractional-credit, carryover and repair assertions, including legacy unsafe outcomes. Forecast and policy interactions also passed the final browser journey. |
| 8 | Capped carryover produces the right at-risk amount; full carryover does not invent year-end forfeiture; carried portion has its own inclusive deadline | `src/personal/expiration.test.ts`; `src/personal/forecast.test.ts`; `src/ui/ExpirationGuard.test.tsx`; `src/policy/summary.test.ts` | Unit/component tests and final browser expiration journey passed: 8-day risk, March 31 handoff, three correctly dated ICS alarms, dismissal/refresh/restore/opt-out; production risk/handoff smoke passed. |
| 9 | Changing forecast date updates the projected balance using the existing policy model, with native units/precision and unlimited-PTO semantics | `src/personal/forecast.test.ts`; `src/ui/PolicyForecastFlow.test.tsx`; `src/policy/projection.test.ts` | Unit/full-page and final forecast journey passed. Production 20 days plus 1.25 monthly accrual yielded 23.75 on February 2 with the real breakdown. |
| 10 | Planned → requested → approved moves one unique future deduction from tentative to confirmed; correction never duplicates consumption | `src/personal/requestLedger.test.ts`; `src/personal/forecast.test.ts`; `src/ui/PtoManagement.test.tsx` | Passed unit/component assertions and real planned/requested/approved/corrected/refreshed browser flow, with exact confirmed/tentative balances. |
| 11 | Canceled/rejected requests reserve no future tentative or confirmed PTO | `src/personal/requestLedger.test.ts`; `src/personal/forecast.test.ts`; `src/ui/PtoManagement.test.tsx` | Passed ledger/forecast tests and actual cancel→approve browser corrections; canceled requests released consumption without later duplication. |
| 12 | Duplicate/overlapping dates deduct once and show conflicts; completed past leave is already in the current balance | `src/personal/requestLedger.test.ts`; `src/personal/forecast.test.ts`; `src/ui/PtoManagement.test.tsx`; `src/ui/PtoTrackerCoverage.test.tsx` | Passed overlap/duplicate/historical-cost tests. Final browser status/reload journey confirmed one deduction; no claim that every overlap combination was manually browser-tested. |
| 13 | Two-person alternatives stay within disclosed dates and the recipient’s independent budget, workweek, holidays, accrual, expiry, minimum and peak rules | `src/planning/partner.test.ts`; `src/ui/PartnerPlanner.test.tsx` | Calculation/component tests and independent two-context browser journey passed. Production partner entry and received proposed dates were smoke-verified. |
| 14 | Partner payload omits balance, employer, notes and policy; ordinary analytics never leaks query/hash state or unsafe incoming referrers | `src/planning/partner.test.ts`; `src/ui/analyticsPrivacy.test.ts`; `src/ui/analytics.test.ts`; `src/ui/PrivacyAnalytics.test.tsx` | Payload/unit tests and actual hosted-SDK transport passed: five safe intercepted POSTs, zero unsafe-referrer POSTs, no private canaries/query/hash/HTTP Referer leakage. |
| 15 | Portrait canvas is 1080×1350; dates/costs match the plan; balance is hidden by default; copy failure falls back truthfully; long plans label overflow | `src/ui/portraitExport.test.ts`; `src/ui/PortraitShare.test.tsx`; existing `src/ui/imageExport.test.ts` and `src/ui/icsExport.test.ts` | Unit/component tests and actual PNG browser journey passed: 1080×1350, hidden balance by default, privacy toggle, dimensions/costs and real clipboard-denial download fallback. Actual PNG visually reviewed. |
| 16 | Existing `w`, `count`, `ov`, policy and historical root URLs remain usable; valid old results stay exact while unsafe old spending is repaired or explained | `src/ui/urlState.test.ts`; `src/ui/planningUrlState.test.ts`; `src/ui/policyUrlState.test.ts`; `src/ui/landingState.test.ts`; `src/planning/optimizer.test.ts` | Final CI passed old URL decoding, root migration and safe legacy-result assertions; 24 frozen complete solver fingerprints preserved and optional minimum omitted/0/1 stays byte-identical. |
| 17 | Main consumer flows fit 375px without horizontal page overflow or clipped primary controls | `scripts/consumer-qa.mjs`; `scripts/consumer-journey.mjs`; `.github/workflows/consumer-validation.yml` | All 12 route/viewport combinations at 1440/768/375 and expanded options passed; all six final mobile journeys passed. Reviewed forecast/expiration/partner/portrait evidence showed no clipping. |
| 18 | Named controls and semantic headings; keyboard menu opens with Enter, closes with Escape, restores focus; usable target sizes and contrast | `src/ui/SiteHeader.test.tsx`; `src/ui/DayCell.test.tsx`; `src/ui/YearStrip.test.tsx`; `src/ui/tokens.test.ts`; `scripts/consumer-qa.mjs`; `scripts/consumer-lighthouse.mjs` | Menu/label/semantic/target tests and browser smoke passed; final candidate axe found zero violations in all five scans; Lighthouse accessibility 100 across four routes. This is not WCAG certification. |
| 19 | Unavailable/quota/security-denied local storage does not crash live use or falsely claim a successful save | `src/personal/employerCalendar.test.ts`; `src/ui/employerCalendarIntegration.test.tsx`; `src/personal/requestLedger.test.ts`; `src/ui/PtoManagement.test.tsx`; `src/personal/policyPreferences.test.ts`; `src/ui/useRequestCalendar.test.tsx` | Injected read/write/quota/security-denial tests passed for live state, employer preferences, ledger, optional policy and holiday fallback; saving failures remain truthful. No claim of testing every browser privacy mode. |
| 20 | Invalid/missing holidays, malformed URLs/dates, oversized payloads, overlong ranges, unavailable coverage and impossible constraints degrade clearly | `src/ui/validation.test.ts`; `src/ui/employerCalendarIntegration.test.tsx`; `src/personal/consumerHolidays.test.ts`; `src/ui/PtoTrackerCoverage.test.tsx`; `src/planning/optimizer.test.ts`; `src/planning/partner.test.ts`; `src/ui/Landing.test.tsx` | Passed in the complete 926-test final suite, including the added unbounded-link guard before calendar-derived allocation, malformed payloads, missing holidays and unknown request coverage. |

## Additional cross-cutting coverage

- **Holiday substitute/year boundaries:** `src/personal/consumerHolidays.test.ts`, `src/ui/useRequestCalendar.test.tsx`, `src/ui/landingCalendar.test.ts`. New Year observed in the prior December is loaded in consumer scope; duplicate dates are charged once while distinct names and regional coverage remain selectable.
- **UTC date boundaries:** consumer optimizer/partner tests, landing/validation tests, existing projection and ICS tests cover leap days, year/month changes, inclusive carried-day use-by dates and exclusive calendar event ends.
- **Calendar coverage:** `src/ui/PtoTrackerCoverage.test.tsx` tests UI and action boundaries, asynchronous loading/degradation, out-of-range date edits and preservation of historical costs on status/note changes.
- **Policy persistence:** `src/personal/policyPreferences.test.ts` and `src/ui/PolicyForecastFlow.test.tsx` cover no invented default forfeiture/balance, explicit URL precedence, current carried amounts in native units, reset/delete and unlimited PTO.
- **Homepage immediacy:** `src/ui/Landing.test.tsx`, `src/ui/landingState.test.ts` and `src/ui/landingCalendar.test.ts` assert real prerendered/live calculations, automatic updates, exact plan handoff, saved employer holidays and explicit invalid/empty states.
- **Shared-engine compatibility:** `packages/engine/src/solver/performanceRegression.test.ts` preserves 24 frozen complete-result hashes, including alternatives/tags/tie-breaking. `minimumBreakDays.test.ts` checks omitted/zero/one compatibility across normal and varied B2B-style fixtures. The optional hook does not activate for existing callers.

## Six actual browser journeys

`scripts/consumer-journey.mjs` passed these cases in fresh 375×812 contexts with synthetic 2027 dates:

1. Live plan → tracked request → requested → approved → canceled/corrected → forecast → refresh, checking exact unique deductions and separate tentative balances.
2. Employer-calendar exclusion/custom days/save/reset/shared defaults, with explicit verification that incoming state does not overwrite recipient storage.
3. Eight-day April 1 expiration risk and March 31 use-by handoff; actual 60/30/7-day ICS reminders on January 31/March 2/March 25, three VALARMs, persisted dismissal, restore and saved opt-out.
4. Privacy-minimized selected partner dates and an independently constrained recipient budget/calendar.
5. Exact 1080×1350 portrait preview/export, default-hidden balance and real PNG download fallback after image clipboard denial.
6. Actual unmodified hosted Plausible/Vercel SDK transport, captured by a route-backed local fixture. Both providers sent safe route-only pageviews; five safe POSTs and zero unsafe-referrer POSTs were recorded, without private canaries, query/hash or HTTP Referer. All POSTs were intercepted and fulfilled locally.

The ordinary browser journeys do not sign in, contact employers or send messages. Production smoke additionally created a synthetic browser-local request, canceled it manually and refreshed to confirm persistence; it created no server/HR record.

## Responsive, accessibility and performance method

`scripts/consumer-qa.mjs` checks `/`, `/pto`, `/policy` and `/sabbatical` at 1440/768/375, fixed November 2, 2026 time, US locale, New York timezone and reduced motion. It asserts actual route documents/titles, named controls, no application errors or failed application responses, no horizontal page overflow and mobile-menu keyboard behavior. PTO options are expanded as a separate state. Third-party analytics is consistently excluded from this layout fixture.

`scripts/consumer-lighthouse.mjs` uses Lighthouse 13.6.0, axe Playwright 4.14.0 and chrome-launcher 1.2.2 installed outside application dependencies. Three sequential alternating baseline/candidate mobile runs use 375×812 simulated throttling. Performance uses medians; accessibility and SEO use the lowest observation. Gates: no more than a three-point performance loss, accessibility ≥95, SEO 100, no serious/critical axe violation. Incomplete axe checks remain in raw reports; automated results are not a WCAG conformance certification.

| Route | Comparison baseline P / A / SEO | Final candidate P / A / SEO | Performance delta | Gate |
|---|---|---|---|---|
| `/` | 90 / 100 / 100 | 90 / 100 / 100 | 0 | Passed |
| `/pto` | 77 / 100 / 100 | 77 / 100 / 100 | 0 | Passed |
| `/policy` | 97 / 100 / 100 | 97 / 100 / 100 | 0 | Passed |
| `/sabbatical` | 96 / 100 / 100 | 97 / 100 / 100 | +1 | Passed |

The comparison base `d82dedcb572a3e6e13a269dd9b1532dda90b852c` already includes phases 1–7; these deltas describe the final integration. Committed [release screenshots](CONSUMER-IMPLEMENTATION-STATUS.md#c-screenshots-and-browser-artifacts) include original before views, final after views and the new mobile flows. Actual forecast, expiration, partner and portrait images were visually reviewed without clipping.

## Failure history and resolution

The original local baseline passed 673/675 tests with two timing failures. Count-DP performance work skips unreachable count states and hoists repeated candidate calculations; timing gates and tests were preserved, and the 24 frozen legacy result hashes remained exact. Stricter actual-date funding and carryover fixes live in the consumer adapter; valid historical consumer results remain exact while unsafe outcomes are repaired or explained.

Local tsx Unix IPC restrictions and failed Chromium archives prevented standard local browser/build invocation. Equivalent direct Node lifecycle checks passed; GitHub CI subsequently ran the standard complete `npm run build`, real Chromium, all responsive/journey tests and Lighthouse/axe successfully. Early mistaken Vite homepage-fallback evidence was rejected and route identity assertions were added. Contrast, target-size, nested-interactive and heading findings were addressed. A final-journey locator timeout finding the Scheduled PTO row was corrected; the actual 20 − 3 = 17 balance was already correct, and the entire journey/metrics suite was rerun. No failing application test, threshold or required gate was disabled.

## Release completion

| Gate | Recorded result |
|---|---|
| Complete integrated validation | 926 tests / 94 files; types, lint and build passed |
| Browser journey | 6/6 passed; no application runtime errors or unexpected account requests |
| Responsive evidence | 12/12 route/viewport checks plus expanded options passed |
| Lighthouse / axe | All four route gates passed; zero candidate axe violations in five scans |
| Phase merges | #73–#80 merged; exact SHAs in release ledger |
| Consumer production | All eight consumer deployments reached READY at their merged commits; final production `dpl_5K3uu8ZLDPeTzoM3RDJjz3K2jYyz` serves `430c9cda7268f994160cf5a7477207e69df75b77`. Live flows and the actual production PNG were verified; inspected application-domain error logs were empty. |
| B2B exclusion | Complete `apps/teams` subtree remains byte-identical to baseline; shared solver compatibility checked separately |

Intentional scope limits remain local browser persistence, manual employer/request status, user-entered policy estimates, calendar-file reminders and bounded payloads/ranges. Existing non-fatal lint warnings remain. No outstanding QA blocker was identified by the recorded final integrated checks.
