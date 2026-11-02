# Gapless consumer implementation status

Evidence checkpoint: November 2, 2026. All eight phases are implemented in the stacked consumer pull requests below. **Merge, final journey CI, and production verification remain pending until the release owner records their actual results.** The passing foundation browser run covers phase 1, not the final eight-phase product.

## Scope and baseline

- Repository: [Atiyk/PTO-Optimizer](https://github.com/Atiyk/PTO-Optimizer). Source baseline: `4a0a10de0075d0d9be4987ad02a6cc0326ba1758`.
- Consumer production: https://pto-optimizer-seven.vercel.app/. Baseline deployment: `dpl_E5UMY9W2YCUnAkwVUhxByb9QvfB2`, READY when inspected.
- The root React/Vite application is the consumer product. `apps/teams`, the `leave_management` deployment, B2B routes, database, accounts, and business data are excluded. No billing, secret, ownership, or hosting-access settings were changed.
- Source was retrieved through authenticated GitHub tools because terminal GitHub credentials were unavailable. Remote commits preserve the original complete tree, including excluded B2B files; the partial local checkout is never treated as authority to delete missing remote paths.
- Each release phase uses a feature branch and PR. The user authorized unattended validated merges; required checks and repository protections still apply.

## Delivery ledger

“Implemented” describes functioning source and local validation, not deployment. Replace each pending merge/deployment entry only after verifying it.

| Phase | Implemented behavior and reused system | Material files / dependencies | PR | Validation checkpoint | Merged SHA | Production |
|---|---|---|---|---|---|---|
| 1 · Employer holidays | Live employer calendar edits, save/delete/reset, country/region scope, explicit shared overrides; reuse existing holiday controls/loaders | `src/personal/employerCalendar.ts`, `consumerHolidays.ts`; `useAppState`, `urlState`, `MoreOptions`; privacy and CI foundation | [#73](https://github.com/Atiyk/PTO-Optimizer/pull/73) | Foundation checks/browser/metrics passed; final combined CI pending | Pending | Pending |
| 2 · Optimizer quality | Minimum candidate length, Balanced/Long breaks/More breaks/Custom presets, one feasible top-three plan, clearer metrics; consumer checks for real spending dates, reserves, accrual, carryover, pins, and blackouts | `src/planning/optimizer.ts`; optional shared solver minimum; `App`, planning URL state, result components | [#74](https://github.com/Atiyk/PTO-Optimizer/pull/74) | Included in passing integrated local suite; final CI pending | Pending | Pending |
| 3 · Homepage and UX | Live engine-derived preview with country, free-form dates, and PTO; plan/balance/policy entry points; warm existing brand and retained holiday opportunities/SEO routes | `Landing`, `landingState`, `landingCalendar`, `YearStrip`, homepage metadata | [#75](https://github.com/Atiyk/PTO-Optimizer/pull/75) | Included in passing integrated local suite; final responsive/metrics CI pending | Pending | Pending |
| 4 · Balance forecast | Minimal quick inputs and arbitrary supported forecast date; confirmed/tentative breakdown, optional saved policy, advanced policy retained, unlimited-PTO handling | `src/personal/forecast.ts`, `policyPreferences.ts`; `QuickForecast`, `Policy`; existing `src/policy` projection/model | [#76](https://github.com/Atiyk/PTO-Optimizer/pull/76) | Included in passing integrated local suite; final journey pending | Pending | Pending |
| 5 · Request tracker | Track directly from a break; six manual statuses, corrections, notes, editing/deletion, persistence, overlap warnings and unique-date deductions | `requestLedger.ts`, `PtoTracker`, ledger/calendar hooks; forecast integration | [#77](https://github.com/Atiyk/PTO-Optimizer/pull/77) | Included in passing integrated local suite; final journey pending | Pending | Pending |
| 6 · Expiration guard | Policy-backed at-risk amounts, capped/full carryover and explicitly entered carried portion, correct units, feasible optimizer handoff, dismiss/disable and 60/30/7-day ICS reminders | `src/personal/expiration.ts`; `ExpirationGuard`, ICS export; existing alerts/projection | [#78](https://github.com/Atiyk/PTO-Optimizer/pull/78) | Unit/component coverage passed; final release CI pending | Pending | Pending |
| 7 · Partner planner | Select availability and intentionally confirm it; bounded versioned `pp` links; independent recipient inputs; feasible joint alternatives, classifications and export; preserve legacy `ov` | `src/planning/partner.ts`, `PartnerPlanner`; consumer feasibility validator | [#79](https://github.com/Atiyk/PTO-Optimizer/pull/79) | Included in passing integrated local suite; final recipient journey pending | Pending | Pending |
| 8 · Portrait sharing | Exact 1080×1350 canvas preview, balance hidden by default, dates/PTO/holiday assumptions and explicit overflow summary, copy/download fallback; landscape/ICS retained | `portraitExport`, `PortraitShare`; existing canvas copy helper; final journey script/workflow | [#80](https://github.com/Atiyk/PTO-Optimizer/pull/80) | Integrated local checks passed; final browser journey in progress | Pending | Pending |

Acceptance assertions and the 20 required scenarios are mapped in [CONSUMER-REGRESSION-MATRIX.md](CONSUMER-REGRESSION-MATRIX.md).

## Verified quality results

| Check | Actual result | Evidence boundary |
|---|---|---|
| Initial baseline tests | 673 passed, 2 pre-existing timing failures, 675 total, two thread workers | Recorded before implementation; no threshold or failing test was removed |
| Solver performance repair | Count-DP skips mathematically unreachable counts and reuses candidate accrual calculations; original timing gates pass | 24 frozen legacy fixtures in `packages/engine/src/solver/performanceRegression.test.ts` retained identical result fingerprints; the B2B application subtree is unchanged |
| Integrated final local suite | 94 test files, **922 tests passed** | Last complete run before the final unbounded-date-link regression was added |
| Final date-range hardening | **18 targeted tests passed** across validation and live state integration | Includes the additional adversarial range case; overlaps the 922 suite, so counts must not be added. Complete aggregate rerun pending |
| TypeScript | Consumer type checking and composite production compilation passed | Final CI remains the release gate |
| Lint | Passed with warnings recorded in the logs | This is not a zero-warning claim; existing Fast Refresh/export and similar warnings remain |
| Local production lifecycle | Equivalent TypeScript/Vite/prerender/SEO build passed | Direct `npm run build` is blocked locally by tsx Unix IPC permissions; direct Node/tsx loader lifecycle commands were used without changing production scripts |
| Foundation GitHub CI | Tests, types, lint, production build, browser and metric gates passed | [Run 41400752850](https://github.com/Atiyk/PTO-Optimizer/actions/runs/41400752850), phase 1 only |
| Final integrated browser/CI | **Pending** | PR #80 runs the final consumer journey; prepared scripts and unit tests are not substitutes for its result |
| Final feature preview | **READY** at inspected phase-8 commit `d5e4c7ab…` | Consumer deployment `dpl_4FPJSnweRdCnM1dsV9oZPoTAbe17`: https://pto-optimizer-4q6442wag-atiyk-a.vercel.app. This is a preview, not a production promotion or final browser pass |
| Production after merge | **Pending** | Verify merged commit, consumer Vercel READY deployment, and representative runtime flows |

The foundation run tested synthetic merge `884c337f684ca1700dd6303f95169eb41c8d3927`, with parents baseline `4a0a10d…` and PR #73 head `af9a6d3dbefc44a71d6c197518b2748a3233ae27`. Its tree `fbce8e8f92f2e2636c8f651fa924a18558548467` matches that phase-1 head exactly. It does not attest later phase trees.

## Browser, screenshots, and measured performance

The phase-1 [browser evidence artifact](https://github.com/Atiyk/PTO-Optimizer/actions/runs/41400752850/artifacts/13121810692) contains before/after consumer screenshots and raw reports. `/`, `/pto`, `/policy`, and `/sabbatical` passed all **12 route/viewport combinations** at 1440, 768, and 375 pixels. Expanded PTO options were also checked. Candidate reports recorded no application runtime errors, unexpected same-origin response failures, unlabeled controls, or horizontal page overflow in those tested states; mobile menu keyboard checks passed.

Foundation mobile Lighthouse values below are **performance / accessibility / SEO**. Performance is the median of three sequential alternating baseline/candidate runs; accessibility and SEO use the lowest observed value. The fixture uses committed holidays and excludes third-party analytics consistently.

| Consumer route | Baseline P / A / SEO | Phase-1 candidate P / A / SEO | Performance change |
|---|---|---|---|
| `/` | 80 / 100 / 100 | 93 / 100 / 100 | +13 |
| `/pto` | 72 / 91 / 100 | 83 / 98 / 100 | +11 |
| `/policy` | 99 / 95 / 100 | 99 / 100 / 100 | 0 |
| `/sabbatical` | 99 / 100 / 100 | 98 / 100 / 100 | −1 |

The foundation candidate passed the ≤3-point performance-regression, accessibility ≥95, and SEO 100 gates. Axe recorded zero candidate violations on the four initial routes and expanded PTO options; incomplete automated checks remain available for manual review. These are automated measurements, not a WCAG conformance certification. The phase-1 `/pto` Lighthouse report retained a non-blocking heading-order finding (accessibility 98); final-page measurements remain pending.

Earlier attempts exposed actual label contrast, small calendar targets, heading semantics, and nested timeline controls. Those findings were fixed or recorded explicitly; stale failing or differently routed runs are not reported as the passing evidence above. Local Chromium installers returned invalid archives, so exact responsive screenshots and Lighthouse evidence came from CI. Cloud-browser baseline images at 1363×936 were supplemental desktop evidence only.

The final mobile journey in [CONSUMER-JOURNEY-QA.md](CONSUMER-JOURNEY-QA.md) uses fresh 375×812 contexts and synthetic 2027 inputs. It covers tracking/status/forecast persistence, employer-calendar precedence, partner privacy/constraints, portrait pixels and download fallback, and actual hosted analytics SDK transport. Its result is pending. Expiration risk, handoff, reminder dates, and dismissal also have dedicated unit/component coverage; the current journey does not separately exercise every expiration interaction in a browser.

## Architecture, compatibility, and privacy

- Existing deterministic solver and policy projection remain the calculation sources. Date arithmetic uses existing UTC utilities. New consumer validation checks funds on each actual PTO date and treats carryover as part of one allocation. Valid legacy consumer outputs remain exact; unsafe legacy outcomes are repaired or explained rather than knowingly shown as feasible.
- Shared engine changes are confined to an optional minimum-break field/candidate hook plus semantics-preserving performance work. Callers without the new field retain legacy solver behavior. The complete remote phase-8 `apps/teams` subtree SHA is `ce2bedc3bca5c97593819583dc53506c25e70e98`, exactly matching baseline. No B2B source or data flow was edited. Consumer and B2B preview deployment checks were both successful at the inspected phase-8 head; root tests still exclude `apps/**`, so this is not a claim that the B2B application was end-to-end tested.
- Employer calendar precedence is explicit URL > saved country/region preferences > public defaults. Live edits recalculate immediately; only an explicit save persists them. Opening someone else’s override never rewrites local preferences. The consumer holiday adapter handles New Year observed in the preceding December without altering shared B2B holiday lookup.
- Versioned browser storage holds employer calendars, request ledger, optional policy, and reminder preferences. Reads are validated and bounded; unsupported/malformed state falls back safely. Storage failures retain live in-memory use and report that saving failed. Request notes/status stay outside ordinary planning and partner URLs.
- Request costs use the relevant workweek, alternating Friday settings, and employer calendar. Adding or changing dates requires loaded calendar coverage. Status/note corrections preserve saved historical costs. Forecasts union dates across requests and policy entries, distinguish tentative/approved consumption, and exclude dates already reflected in the starting balance.
- Partner payloads contain selected dates, the disclosed free-day subset, and intentionally chosen proposed/confirmed availability. They omit balance, employer, notes, and policy; neutral `/pto` links preserve the recipient’s independent settings. Confirmation resets when the selected dates or free-day classification changes. Cards are independently feasible alternatives, not a combined promise to spend the same budget repeatedly.
- Portrait export builds only the visible public model. Balance is opt-in; private company holiday names are replaced with generic labels. Readiness follows the visible image model so a privacy toggle cannot export stale pixels. Existing landscape and ICS exports remain available.
- Analytics events contain action names only. Both providers receive sanitized public route URLs without query/hash state. Unsafe incoming referrers suppress tracking; an early referrer policy protects outgoing headers. Transport assertions in the final browser script use actual unmodified provider SDKs and intercept every POST locally; those final transport results remain pending.

## Known limits and release follow-through

- No account, server synchronization, native app, HR approval integration, paid service, calendar OAuth, email scheduling, or push delivery was added. Request statuses are manual. Calendar reminders require the user to download/import ICS; in-app alerts appear during visits.
- Policy forecasts are estimates from user-entered rules. They preserve native hours/days and internal precision. Unlimited PTO has no invented bank balance. The handbook feature remains glossary matching, not full AI interpretation.
- Holiday data can degrade; new/date-edited requests and joint planning are held when calendar coverage is incomplete. Planning windows and forecasts are bounded to ten years; partner disclosure is bounded to 1,100 dates and a 12,000-character payload; employer edits and request ledgers have explicit size limits.
- Portraits show up to three readable breaks and label any remaining count; the total summary still represents the full plan.
- Final complete browser/metrics CI, sequential merges, and production verification must be recorded before calling the eight-phase release shipped. Confirm the consumer project and merged commit for each deployment; leave B2B settings and deployment untouched.
- Highest-value follow-through: inspect final journey/PNG evidence, resolve any final gate failures through the phase PR, complete merges with required checks, then smoke-test live consumer persistence/forecast/sharing flows. No additional product scope is needed before that release verification.
