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
| 1 Employer holidays | In-memory controls → saved, scoped, reversible calendar + shared overrides | `src/personal/employerCalendar*`, `useAppState`, `urlState`, `MoreOptions`, `App` | URL > saved > public; storage failure; regional scope; no duplicate cost | Implemented; validation underway | Pending |
| 2 Optimizer quality | Existing deterministic solver → opt-in minimum candidate length, planning presets, safe consumer budget validation and top opportunities | optional solver input; consumer `src/planning`; UI/URL integration | Legacy caller output unchanged; no overspend; honest infeasible states | In development | Pending |
| 3 Homepage / UX | Existing landing data → live personalized hero and three capability entries | `Landing`, `landingState`, `YearStrip`, homepage metadata | Engine-derived preview; no submit; accessible responsive UI | In development | Pending |
| 4 Forecast | Existing policy model/projection → quick inputs, date-specific confirmed/tentative forecast | consumer policy + forecast components | Policy precision; unlimited; calendar dates; future request deductions | In development | Pending |
| 5 Request tracker | New private local request ledger + recommendation action | consumer personal ledger / tracker | Six statuses; no duplicate dates; notes excluded from URLs | In development | Pending |
| 6 Expiration guard | Existing alerts → correct units, scenarios, opt-in in-app / calendar reminders | consumer policy alerts + expiration components | Actual policy rules; carryover; 60/30/7 ICS reminders | In development | Pending |
| 7 Partner planning | Existing `ov` links → selected availability + joint opportunities | new consumer partner modules / component | Independent recipient constraints; minimum shared data; legacy compatibility | In development | Pending |
| 8 Portrait sharing | Existing landscape export → 1080 × 1350 preview/copy/download | new consumer portrait modules / component | Balance hidden by default; readable summary; correct fallback | In development | Pending |

## Constraints and decisions

- Every release uses a feature branch and PR. The run brief authorizes unattended pushing and tested merges; branch protections are never bypassed.
- Optional shared solver changes must be inert for callers that do not supply the new field. No changes to `apps/teams` are permitted.
- Missing screenshot, performance, CI, or production evidence is recorded as unavailable; it is never treated as a pass.
- Local data stays in this browser. No email, push, employer approval, or cross-device synchronization is promised.
