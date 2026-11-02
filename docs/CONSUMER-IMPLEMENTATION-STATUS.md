# Gapless consumer release report

Release date: November 2, 2026. Repository: [Atiyk/PTO-Optimizer](https://github.com/Atiyk/PTO-Optimizer).

## A. Executive summary

All eight consumer improvements were implemented and validated through separate phase pull requests. **All eight PRs are merged into `main`, and the consumer production deployment is READY with representative live flows verified.** The public consumer application is [Gapless](https://pto-optimizer-seven.vercel.app/).

Final integrated CI [41409562702](https://github.com/Atiyk/PTO-Optimizer/actions/runs/41409562702) passed **926 tests in 94 files**, production build/type/lint checks, six complete mobile journeys, 12 responsive route checks and all five candidate axe scans with zero violations. Final mobile accessibility and SEO scores are 100 on all four measured routes. No outstanding QA defect was identified at that integrated snapshot.

The B2B application in `apps/teams` and its data flows were not edited. The complete remote subtree SHA is `ce2bedc3bca5c97593819583dc53506c25e70e98`, identical to the baseline subtree. Shared solver work is limited to an optional minimum-break hook and output-preserving performance improvements, backed by 24 frozen full-result compatibility fixtures. No B2B database, account, billing, secret or hosting configuration was changed.

## B. Shipped functionality and release ledger

Source baseline: `4a0a10de0075d0d9be4987ad02a6cc0326ba1758`. Each phase used a feature branch and PR; no direct commit to `main`, forced merge or required-check bypass was used. Each deployment below is the consumer `pto-optimizer` project and was matched to its merged commit.

| Phase | Delivered behavior | Pull request | Merged commit | Consumer production / verified flow |
|---|---|---|---|---|
| 1 · Employer holidays | Live holiday edits; save/delete/reset by country and region; shared URL overrides never replace local preferences. | [#73](https://github.com/Atiyk/PTO-Optimizer/pull/73) | [`4c12a8c6`](https://github.com/Atiyk/PTO-Optimizer/commit/4c12a8c629656d2c75f4f4ee310cfb1537aa0219) | READY · `dpl_EU7eNSxwZAzPmeKacQ1tTZENr1SC`. Exclusion changed a 4-PTO/8-calendar-day plan to 7 calendar days; save/revisit persisted it and reset restored defaults. |
| 2 · Optimizer quality | Minimum break length, planning styles, a feasible top-three view, reserve-aware budgets and actual-date funding checks. | [#74](https://github.com/Atiyk/PTO-Optimizer/pull/74) | [`c9d3cbf2`](https://github.com/Atiyk/PTO-Optimizer/commit/c9d3cbf279487afefc4c2cbb8fc88e313e7f6cff) | READY · `dpl_HeA1rx6Rn4bVWY1rKRjXai6R6yJY`. Long-breaks plan recalculated live to 4 PTO days for 8 days off in one break, within budget. |
| 3 · Homepage and UX | Live engine-derived preview, free-form dates, simpler core controls and direct plan/balance/policy entry points. | [#75](https://github.com/Atiyk/PTO-Optimizer/pull/75) | [`71a87edb`](https://github.com/Atiyk/PTO-Optimizer/commit/71a87edb71d083cf0588a5426b9b126c3130ba59) | READY · `dpl_3s26xja12By4FnesRTpXnfcToK3w`. Changing homepage PTO from 15 to 10 recalculated the live preview and exact full-plan handoff. |
| 4 · Balance forecast | Quick inputs, chosen forecast date, precise confirmed/tentative scenarios, advanced rules and optional saved policy. | [#76](https://github.com/Atiyk/PTO-Optimizer/pull/76) | [`2c982787`](https://github.com/Atiyk/PTO-Optimizer/commit/2c98278729a7c33e8eb33673af1d3229bb555422) | READY · `dpl_9BhoDSKsWW3RuTeQYmR3p1ssgpeL`. 20 current days plus 1.25 monthly accrual projected 23.75 days on February 2, with live breakdown. |
| 5 · Request tracker | Track a recommendation; six manual statuses, corrections, notes, persistence and overlap-safe deductions. | [#77](https://github.com/Atiyk/PTO-Optimizer/pull/77) | [`b7fc59ac`](https://github.com/Atiyk/PTO-Optimizer/commit/b7fc59ac23696bb3989505ab737bc66ce4815b2f) | READY · `dpl_DKqP5MEu7uTrUwjaC5TYDnPMczB7`. Synthetic tracked request was canceled; refresh preserved its manually entered status. |
| 6 · Expiration guard | Policy-backed risk, carried balances, feasible use-by handoff and opt-in 60/30/7-day calendar reminders. | [#78](https://github.com/Atiyk/PTO-Optimizer/pull/78) | [`268f31b0`](https://github.com/Atiyk/PTO-Optimizer/commit/268f31b04d76431f2b68c2f9573d8d45ed649461) | READY · `dpl_B3L8bc9xjA7nMXD2uGp6vSedb4Jn`. 8-day risk at the April 1 reset handed off a plan ending March 31 with budget 8 and reserve 0. |
| 7 · Partner planner | Select disclosed availability; independent recipient settings, feasible joint alternatives, private-data exclusions and legacy links. | [#79](https://github.com/Atiyk/PTO-Optimizer/pull/79) | [`a7125cd6`](https://github.com/Atiyk/PTO-Optimizer/commit/a7125cd6ed31c3a734385b1f878603ad27a427e3) | READY · `dpl_6Quw2SxtruefJnywYujgY7AghUc9`. Selected January 20–24 availability copied as five proposed dates; other free days and confirmation stayed off, with private fields excluded. |
| 8 · Portrait sharing | 1080×1350 preview/copy/download, balance hidden by default, clear dates/costs/holiday assumptions and overflow summary. | [#80](https://github.com/Atiyk/PTO-Optimizer/pull/80) | [`430c9cda`](https://github.com/Atiyk/PTO-Optimizer/commit/430c9cda7268f994160cf5a7477207e69df75b77) | READY · `dpl_5K3uu8ZLDPeTzoM3RDJjz3K2jYyz`. Production preview defaulted to balance off and matched 3 PTO days for January 20–24 (5 calendar days). An actual PNG download was verified as 1080×1350. |

Final consumer deployment: **`dpl_5K3uu8ZLDPeTzoM3RDJjz3K2jYyz` — READY**, commit **`430c9cda7268f994160cf5a7477207e69df75b77`**, serving https://pto-optimizer-seven.vercel.app/. Production preview defaulted to balance off and matched 3 PTO days for January 20–24 (5 calendar days). An actual PNG download was verified as 1080×1350.

The source reuses the existing deterministic planning engine, `src/policy` model/projection/alerts, holiday data, request-text generator, URL state and export helpers. New calculation modules are concentrated in `src/planning` and `src/personal`; UI integration is in the consumer `src/ui` application. The [regression matrix](CONSUMER-REGRESSION-MATRIX.md) maps all 20 requested scenarios to actual assertions.

## C. Screenshots and browser artifacts

The images below are committed release evidence. Before/after desktop views are 1440 pixels wide; new personal-management flows are 375 pixels wide. The portrait PNG is the actual 1080×1350 export with balance hidden, rather than a reconstructed mockup.

| Experience | Before | After / new flow |
|---|---|---|
| Homepage | [Before](screenshots/consumer-release/before-home-1440.png) | [After](screenshots/consumer-release/after-home-1440.png) |
| Optimizer | [Before](screenshots/consumer-release/before-pto-1440.png) | [After](screenshots/consumer-release/after-pto-1440.png) |
| Policy / forecast | [Before](screenshots/consumer-release/before-policy-1440.png) | [After](screenshots/consumer-release/after-policy-1440.png) · [Approved forecast, mobile](screenshots/consumer-release/approved-forecast-375.png) |
| Request tracker | New feature | [Mobile tracker](screenshots/consumer-release/request-tracker-375.png) |
| Expiration guard | Expanded feature | [Risk and reminders](screenshots/consumer-release/expiration-reminders-375.png) |
| Partner planning | Expanded feature | [Mobile partner planner](screenshots/consumer-release/partner-planner-375.png) |
| Portrait export | New format | [Actual PNG, default privacy](screenshots/consumer-release/portrait-private-default.png) |
| Live consumer production | — | [Actual production PNG](screenshots/consumer-release/production-portrait.png) |

[Final CI artifact 13124822600](https://github.com/Atiyk/PTO-Optimizer/actions/runs/41409562702/artifacts/13124822600) contains the full before/after 1440/768/375 screenshots, expanded PTO options, six-case journey report, downloadable PNGs/ICS, Lighthouse JSON, axe reports and analytics SDK hashes. The approved forecast, expiration flow, partner layout and actual portrait were visually reviewed without clipping in the captured states. A separate live-browser JPEG did not synchronize; the actual production PNG is archived instead, alongside the CI screenshots.

## D. Quality results

| Check | Actual result |
|---|---|
| Tests | **926 passed, 94 files** in final integrated CI |
| TypeScript | Consumer type check and composite production compilation passed |
| Lint | Passed; non-fatal existing warnings remain recorded in CI |
| Build | Standard `npm run build` passed in CI, including holiday refresh, Vite, prerendering and SEO output |
| Responsive / runtime | **12/12** route/viewport combinations passed across `/`, `/pto`, `/policy`, `/sabbatical` at 1440/768/375; expanded options passed; no page overflow or application runtime errors reported |
| Complete mobile journeys | **6/6 passed** at 375×812 with synthetic 2027 inputs; no unexpected account requests |
| Accessibility | Candidate axe scans: **0 violations** on four initial routes plus expanded PTO options; Lighthouse accessibility **100** on all four routes |
| SEO | Lighthouse **100** on all four routes; existing routes, canonical URLs and prerendering retained |
| Compatibility | 24 frozen legacy solver result fingerprints preserved; optional minimum omitted/0/1 remains byte-identical; old consumer URL forms retained |
| Production | All eight consumer deployments reached READY at their merged commits; final production `dpl_5K3uu8ZLDPeTzoM3RDJjz3K2jYyz` serves `430c9cda7268f994160cf5a7477207e69df75b77`. Live flows and the actual production PNG were verified; inspected application-domain error logs were empty. |

The final CI head is `1316942b7323f063c50c8eadfd8e993a270d2f75`. Its Lighthouse artifact identifies synthetic tested merge `d2cd0ac3c6cbd7ce08604ed80ae0249149ecfc7e` against base `d82dedcb572a3e6e13a269dd9b1532dda90b852c`; this is distinct from the production merge commit. The production merge tree `cea3ab856fd2ca2e0e37c18ce96f3206fc876149` matches the tested final feature tree exactly. Evidence is attributed to the snapshot actually tested.

Final mobile Lighthouse values are **performance / accessibility / SEO**. Performance is the median of three sequential alternating baseline/candidate runs; accessibility and SEO use the lowest observation. The final PR comparison baseline already contains phases 1–7, so these deltas measure the last integration, not the total improvement since the original site.

| Route | Final comparison baseline | Final candidate | Performance delta |
|---|---|---|---|
| `/` | 90 / 100 / 100 | **90 / 100 / 100** | 0 |
| `/pto` | 77 / 100 / 100 | **77 / 100 / 100** | 0 |
| `/policy` | 97 / 100 / 100 | **97 / 100 / 100** | 0 |
| `/sabbatical` | 96 / 100 / 100 | **97 / 100 / 100** | +1 |

All regression gates passed: no performance loss beyond three points, accessibility ≥95, SEO 100, and no serious/critical axe violation. Automated accessibility checks are not a WCAG conformance certification; incomplete checks remain available in raw reports.

The six real browser journeys exercised:

1. Live plan → track → requested → approved → canceled/corrected → forecast → refresh, with exact unique deductions.
2. Saved employer calendars, custom days, reset and shared-default precedence without overwriting recipient preferences.
3. An 8-day April 1 expiration risk → March 31 optimizer handoff; actual 60/30/7-day ICS reminders, three alarms, dismissal/refresh, restore and saved opt-out. The 2027 reminder dates were January 31, March 2 and March 25.
4. Selected partner availability, privacy exclusions and an independently constrained recipient plan.
5. Exact portrait dimensions, default-hidden balance, real PNG generation and the actual download fallback after image clipboard denial.
6. Actual unmodified hosted Plausible/Vercel SDK transport: five safe intercepted POSTs, zero unsafe-referrer POSTs, no private canaries, query/hash or HTTP Referer leakage. All POSTs were fulfilled locally; no synthetic analytics event was sent externally.

Failure history was preserved rather than hidden. The initial 675-test baseline had two timing failures. Count-DP work now skips mathematically unreachable states and reuses candidate calculations, without weakening thresholds or changing legacy outputs. Local tsx IPC restrictions and failed Chromium archives were worked around with equivalent direct Node lifecycle checks; real standard builds and browser tools subsequently passed in CI. Early route-fallback, contrast, target-size and heading findings were corrected. An early final journey timed out because its QA locator could not find the Scheduled PTO row, while the actual 20 − 3 = 17 balance was correct. The locator was fixed, then the complete journey and metrics were rerun successfully.

## E. Known limits and intentional exclusions

- Personal request notes, employer preferences, optional policies and reminder preferences save in the current browser. There is no new account requirement, cross-device sync, employer approval integration, database, payroll/billing feature, native app or paid service. Request statuses are entered manually.
- In-app alerts appear during visits. Calendar reminders require downloading/importing ICS; no scheduled email or push delivery is promised.
- Policy balances are estimates from user-entered rules. Hours/days retain native units and internal precision; unlimited PTO has no invented finite bank. Handbook assistance remains glossary matching, not full AI policy interpretation.
- Planning/forecast ranges and URL/storage payloads have explicit bounds. New/date-edited requests require known employer-calendar coverage; status/note corrections retain historical pricing. Missing holiday data produces an explained degraded state.
- Partner cards are alternative opportunities, not multiple allocations of the same PTO budget. The shared link discloses only selected dates, a free-day subset and intentionally selected availability status; anyone holding it can see those dates.
- Portraits show up to three readable breaks and explicitly count any additional breaks. Balances default off, and custom company holiday names use generic labels.
- Non-fatal lint warnings remain. No unresolved release blocker or known critical calculation/privacy defect was identified by the recorded checks. The B2B app was not functionally retested end-to-end; its subtree is unchanged and shared-engine compatibility was checked separately.
- Production verification used a synthetic tracked request in the inspection browser, manually canceled and reloaded to confirm persistence. It did not create a server record or contact an employer.

## F. Follow-up

Monitor the consumer deployment after release and retain the CI/production evidence. Prioritize any real browser feedback on policy setup, reminder clarity or mobile exports before adding more features. No additional product scope or external service is required to use the shipped flows.
