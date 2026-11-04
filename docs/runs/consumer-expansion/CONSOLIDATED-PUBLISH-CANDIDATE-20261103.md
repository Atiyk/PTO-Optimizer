# Gapless consumer consolidated production candidate

**Date:** November 3, 2026 (ET) | **Status:** release verification required before merging.

## Source provenance
- PR #112, UI and accessibility, exact head `2160cca52e218e75f99468a6b1b71e39c77eaed6` (branch parent).
- PR #111, combined quick forecasts, policy explainer, corporate-rule departure payout, carryover snapshot and specialized QA, exact head `39f7f1ff4f62ccedc1574ca306fd3993478f89c6`.
- PR #89 school-calendar/conflict foundation `d2af0d3973d4d08061774954c194cb3cba709057`.
- PR #96 employer holiday profile foundation `0d2642423659109c7539e4392412cc04a611a108`.
- PR #100 safer ICS calendar imports `6a00f3c05406ebae474e7164b04e57f40c8d74b0`.
- PR #84 orchestration directive `df328adc4666e7206297b82270024a329a048dbf`.

The open forecast/payout/carryover PRs #107, #108, #110 and older foundation PRs #91, #93, #94, #98, #103 are subsumed by #111. Older UX PRs #87–#104 were consolidated and already merged via PR #106, so replaying them would overwrite newer code. PR #109 contains only superseded handoff status. Do not merge these overlapping branches separately.

**Merge resolution:** `src/ui/Policy.tsx` uses #111's fully tested departure payout integration while retaining PR #112's focusable `main#main-content` landmark. All other feature files are layered onto the UI candidate by exact Git blob. B2B `apps/teams` and the shared solver `packages/engine` are unchanged.

## Before production
The integrated exact SHA needs tests/typecheck/lint/build, 1440/768/375/320 real browser & visual QA, accessibility including WCAG 2.5.3, formula/country/date and URL/privacy regressions, source-based legal-policy review and independent critic. Green isolated PRs are insufficient for combined release. Preview READY is not production. Publish only after checked protected merge to main, one coordinated Vercel deployment and verification of READY at exact main SHA. School/profile modules added here are foundations; only user-visible UI actually wired into routes may be described as an enabled feature.

## Time-zone and exclusive-midnight correctness remediation (November 3, 2026)
Independent AI reviewer of consolidated release PR #113 flagged a genuine risk in date-time import: unconverted TZID local times around DST could incorrectly qualify as >=24h, and timed `DTEND` exactly at midnight incorrectly included the end date. The parser now uses explicit UTC timestamps, IANA zone conversion with validation of DST gaps/duplicate local hours (ambiguous times fail closed), verifies start and end timezone consistency, and applies exclusive midnight boundaries to both `DTEND` and `DURATION` endpoints. Unknown or inconsistent zones show a user-facing import error instead of being guessed. Floating datetimes without TZID retain their nominal wall-clock time as before; they cannot be DST-correct without a source zone. The import preview now exposes up to 30 exact calendar dates and warns about timezone semantics before the explicit Add action. Test fixtures cover UTC midnight, 23h spring-forward, 25h fall-back, ambiguous and nonexistent local times, and sub-day seconds. **This note is a design intent, not evidence of passing integrated CI or independent approval until the exact new SHA is tested.**
