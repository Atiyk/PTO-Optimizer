# Gapless consumer improvements — implementation run

Source baseline: `Atiyk/PTO-Optimizer` main `4a0a10de0075d0d9be4987ad02a6cc0326ba1758` (2026-11-01).
Consumer production: https://pto-optimizer-seven.vercel.app/ — deployment `dpl_E5UMY9W2YCUnAkwVUhxByb9QvfB2`, READY at baseline.
B2B project `leave_management` / `apps/teams` is excluded from implementation. No account, billing, secret, database, or hosting-setting changes are authorized by this work.

## Baseline evidence

- Source retrieved immutably through the authenticated GitHub connector; terminal GitHub credentials are unavailable. The local checkpoint is a partial monorepo snapshot; remote trees must always use the real GitHub base tree, preserving all excluded B2B files.
- Baseline tests: 673 passed / 2 pre-existing timing failures / 675 total with two worker threads. Default fork-based invocation exits without test results in this restricted runtime. No tests or thresholds were disabled.
- Baseline TypeScript check passed. Lint passed with existing warnings.
- `npm run build` is blocked by the runtime denying tsx's Unix IPC socket. Equivalent lifecycle commands (`node --import tsx`, `npm --ignore-scripts run build`, direct prerender/SEO scripts) passed.
- Cloud browser baseline screenshots captured for `/`, `/pto`, `/policy`, `/sabbatical` at observed viewport 1363 × 936. Exact 1440/768/375 screenshots unavailable locally: both Chromium installers returned invalid archives. CI captures requested viewports when available. Lighthouse remains unmeasured until actual output exists.

## Delivery status

| Phase | Existing capability / requested change | Files | Dependencies / acceptance | Status | PR / merge / deployment |
|---|---|---|---|---|---|
| 1 Employer holidays | In-memory controls → saved, scoped, reversible calendar + shared overrides | `src/personal/employerCalendar*`, `useAppState`, `urlState`, `MoreOptions`, `App` | URL > saved > public; storage failure; regional scope; no duplicate cost | Implemented; tests/build pass; responsive and Lighthouse gates in review | #73 (draft) |
| 2 Optimizer quality | Existing deterministic solver → opt-in minimum candidate length, planning presets, safe consumer budget validation and top opportunities | optional solver input; consumer `src/planning`; UI/URL integration | Legacy caller output unchanged; no overspend; honest infeasible states | Implemented on an isolated feature branch; integration/release validation pending | Pending |
| 3 Homepage / UX | Existing landing data → live personalized hero and three capability entries | `Landing`, `landingState`, `YearStrip`, homepage metadata | Engine-derived preview; no submit; accessible responsive UI | Implemented on an isolated feature branch; integration/release validation pending | Pending |
| 4 Forecast | Existing policy model/projection → quick inputs, date-specific confirmed/tentative forecast | consumer policy + forecast components | Policy precision; unlimited; calendar dates; future request deductions | Implemented on an isolated feature branch; integration/release validation pending | Pending |
| 5 Request tracker | New private local request ledger + recommendation action | consumer personal ledger / tracker | Six statuses; no duplicate dates; notes excluded from URLs | Implemented on an isolated feature branch; integration/release validation pending | Pending |
| 6 Expiration guard | Existing alerts → correct units, scenarios, opt-in in-app / calendar reminders | consumer policy alerts + expiration components | Actual policy rules; carryover; 60/30/7 ICS reminders | Implemented on an isolated feature branch; integration/release validation pending | Pending |
| 7 Partner planning | Existing `ov` links → selected availability + joint opportunities | new consumer partner modules / component | Independent recipient constraints; minimum shared data; legacy compatibility | Implemented on an isolated feature branch; integration/release validation pending | Pending |
| 8 Portrait sharing | Existing landscape export → 1080 × 1350 preview/copy/download | new consumer portrait modules / component | Balance hidden by default; readable summary; correct fallback | Implemented on an isolated feature branch; integration/release validation pending | Pending |

## Constraints and decisions

- Every release uses a feature branch and PR. The run brief authorizes unattended pushing and tested merges; branch protections are never bypassed.
- Optional shared solver changes must be inert for callers that do not supply the new field. No changes to `apps/teams` are permitted.
- Missing screenshot, performance, CI, or production evidence is recorded as unavailable; it is never treated as a pass.
- Local data stays in this browser. No email, push, employer approval, or cross-device synchronization is promised.

## Current validation checkpoints

- PRs #73 employer calendars, #74 optimizer quality, #75 homepage, and #76 balance forecast are open as drafts; none has merged or changed production.
- The performance fix passes all 693 tests in the first-release local suite at unchanged thresholds; CI tests/types/lint/build also pass. Frozen legacy-result fingerprints pass separately.
- First correctly routed CI screenshot smoke: all 12 consumer route/viewport combinations passed.
- Measured initial mobile Lighthouse P/A/SEO: home 89/100/100 (baseline 74/100/100), PTO 77/91/100 (baseline 71/91/100), policy 99/100/100, sabbatical 97/100/100. PTO accessibility and axe found disabled-label contrast, calendar badge targets and control heading semantics; fixes are being validated. The older homepage timeline also required a grouping role around its interactive controls.
- Forecast policy/ledger tests: 70 pass. Full-page forecast/preferences/summary tests: 32 pass. Tracker/calendar/holiday integration: 74 pass plus 28 request/URL/control checks. Groups overlap and are not a combined total.
- Request pricing now preserves historical costs for status/note corrections and prevents new/date-edited requests outside the loaded calendar.
- A consumer-only holiday adapter includes a Saturday January 1 observed on the preceding December 31. Shared B2B holiday behavior is unchanged.
