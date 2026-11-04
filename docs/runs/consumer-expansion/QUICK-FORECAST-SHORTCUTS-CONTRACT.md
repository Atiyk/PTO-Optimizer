# F4 Quick Forecast — Date Shortcuts (draft)

## Scope and ownership
- Consumer-only `src/ui/QuickForecast.tsx`, a small pure date shortcut helper, and regression tests.
- Branch from main SHA `3187596230768e4818720d1907475c9a3341a54c`.
- Existing `/policy` callback `onForecastDateChange` remains the sole state and URL writer; this patch does not add a storage key, analytics payload, alternate forecast engine or a new route.
- No UX predecessor-owned file, `apps/teams`, shared engine, payout or employer code changed.

## Behavior
- 1, 3 and 6 months are anchored to the **balance as-of date**, not the viewer's current date, so results are reproducible and independent of browser timezone.
- Month ends clamp to real Gregorian dates, including leap years.
- Year-end targets December 31 of the balance as-of year, not an assumed policy reset date.
- The arbitrary date input remains visible and editable; shortcut presses call exactly the same callback and usage event as changing that input.
- Buttons are 44px high, wrap at 320px, expose pressed state and keyboard focus, and never require a Generate/Submit action.
- Forecast numbers continue to come exclusively from `forecastWithRequests`; unlimited PTO still has no invented banked balance.
- Invalid date anchors show no shortcuts. Out-of-range generated dates are excluded.

## Review / release gates
- New unit and RTL tests cover month-end/leap-year, invalid anchors, button callbacks, selected state, free-form date parity and unlimited leave.
- GitHub exact-head tests, typecheck, lint, build and browser CI must pass; do not infer success from code review alone.
- Real 1440/768/375/320 visual evidence, keyboard QA, independent critic approval and Vercel exact-head preview are **not** established by this document.
- UX predecessor must be fully complete, merged, independently approved and production READY at its latest main SHA before this expansion PR can be merged.
