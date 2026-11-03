# Vacation date-specific forecast comparison — isolated foundation

**Status:** Draft only; no user-facing integration, independent critic signoff, or release.
**Scope:** Consumer F5, no new forecast engine and no change to UX-owned `src/ui` files.

## Contract

`compareVacationForecast(policy, through, requests, employerCalendar, proposedStart, proposedEnd)` returns two before/after comparisons:

- **Confirmed:** existing approved/completed leave plus explicit policy planned days.
- **Tentative:** also includes requested/planned ledger entries.

The selected vacation's PTO dates come from the existing `requestPtoDates` function and the caller's workweek and employer-observed off-days. Both forecasts use `forecastWithRequests` and its canonical `projectBalance` implementation, including accrual, carryover, expiration, caps and hours. The hypothetical vacation is not written to storage or the ledger. Overlapping dates are counted once. The result exposes native-unit changes, not an independent arithmetic shortcut, and does not include request IDs, notes or salary.

A selected range must be after `balanceAsOf`, inside the selected forecast horizon and inside any declared employer calendar coverage. Missing coverage bounds are explicitly disclosed via `employerCalendarCoverageDeclared=false`. This is **not** a statement that the user's full employer calendar has been imported. No private data is added to URL state.

## Tests and release blockers

Regression cases: two-day future vacation, duplicate approved/policy dates, requested-versus-confirmed statuses, employer holiday/weekend, fractional hours, carryover reset where spending does not change the final balance, unlimited PTO, missing calendar coverage, invalid dates and malformed input.

Before merging, independent critic must inspect source and edge cases, UI owner must integrate without changing existing URL semantics or leaking private leave data, and full consumer CI plus actual browser screenshots at 1440/768/375/320 must pass. Vercel preview must be READY on the exact head; expansion Gate 0 must pass before any merge. This draft intentionally makes no production claims.

**File ownership:** `src/personal/forecastComparison.ts` and its tests only. No edits to UX-owned `src/ui/App.tsx`, `src/ui/useAppState.ts`, `scripts/consumer-journey.mjs` or B2B paths.
