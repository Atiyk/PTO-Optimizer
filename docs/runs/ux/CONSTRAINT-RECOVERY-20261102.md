# Consumer UX — constrained-plan calendar recovery

**Date:** 2026-11-02  
**Base:** main at `3187596230768e4818720d1907475c9a3341a54c`  
**Scope:** Consumer planner only; no `apps/teams` changes.  
**Status:** Implementation on an isolated branch; draft PR pending exact-head CI, browser evidence, critic review and Vercel preview. The first exact-head CI run failed on one obsolete unit assertion and a holiday-based browser fixture; both have been corrected in subsequent commits and require fresh CI.

## Reproduced logic-level failure

A valid planning range with a forced PTO day and insufficient available PTO can produce `solveConsumer(...).issue` with an empty result. The existing `App.tsx` renders the calendar only when **both** input validation and solver errors are absent. That hides the date the visitor just pinned and prevents the ordinary include → exclude → automatic cycle from recovering the plan. The shared `ValidationBanner` also incorrectly says the last valid plan is displayed when the solver has returned an empty result.

Reproduction fixture: `/pto/?c=US&s=2027-01-15&e=2027-01-24&b=0&rv=0&pv=2&ps=custom&mb=3&p=2027-01-19`. The pinned date is **Tuesday, January 19, 2027**, a regular working day; the zero-day PTO budget cannot fund it. The earlier January 18 fixture accidentally pinned Martin Luther King Jr. Day, a public holiday, so the solver correctly did **not** report a budget error. This is a valid URL with an impossible *planning constraint*, not an invalid date range.

## Changes

- Keep the calendar mounted when date inputs validate but the solver reports an infeasible plan. Continue suppressing export/share actions until the solver succeeds.
- Show a distinct, accessible constraint notice with the real engine issue and explicit **Clear pinned and excluded dates** action, without wiping the user's budget, date range, employer holidays, workweek, or policy settings.
- Offer **Review advanced settings** to reveal and scroll to constraints such as minimum break length.
- Preserve `ValidationBanner` exclusively for input-validation errors, so its "last valid plan" language remains accurate.
- Clarify the no-breaks copy while a solver issue exists.
- Add component-level Vitest assertions and a real 320px Playwright consumer journey covering invalid pinned PTO, calendar presence, recovery, URL persistence and horizontal overflow.

## Required independent critic checks

1. A budget-zero forced working day produces a solver issue, yet the date remains actionable on calendar at 375px and 320px.
2. Reset removes only `p`/`r` URL date overrides; PTO budget, planning range, country, policy and employer calendar remain unchanged.
3. With no forced dates, the notice does not offer a misleading reset action; review settings still works.
4. Input-validation errors still suppress the calendar; valid constrained dates do not.
5. All existing consumer tests, typecheck, lint, production build, browser/visual evidence, keyboard and touch behavior pass at 1440/768/375/320.
6. Review interaction with PR #87 (also edits `App.tsx`) before merge. Reconcile changes serially; never overwrite its explanation panel.
7. Vercel preview READY on the exact PR head, independent critic signoff and normal GitHub merge gate. Production READY on merged SHA before marking shipped.

**Owner's quota directive:** If Vercel refuses a preview due to a transient deployment quota, continue implementation and CI, but keep this PR draft and unmerged. Do not claim deployment.

**Coordination:** PR #90 owns `DayCell.tsx` and the touch-specific QA workflow; this change intentionally does not modify either. PR #88 owns `Landing.tsx`; expansion PRs own separate policy and school/calendar code. The main UX orchestrator must integrate in dependency order after exact-head verification.
