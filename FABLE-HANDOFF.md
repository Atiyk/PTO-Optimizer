# Fable handoff: Timebower planner redesign

Date: 2026-11-15.

> **Status, corrected after the fact (Opus follow-up, same day).** This work was merged as
> PR #152 (`544ccd5`) and deployed to production; the text below was written before that and
> said it was uncommitted. Two corrections to the body:
> - Item 3 below is wrong about today's default: `src/ui/urlState.ts` already opens a fresh,
>   unparameterized `/pto` on "Spread across the year" (`'year'`); only links that carry planning
>   parameters but no `ps` keep `'balanced'`, by design, so old links reproduce. No default change
>   was made or approved.
> - PR #152 shipped with its browser CI job failing: on phones the taller break cards made a tap
>   on Save/Track scroll the page before the release, so the tap was lost, and the year line's
>   8px links failed axe `target-size`. Both are fixed in the follow-up branch
>   `opus/plan-request-track`, which also delivers items 2, 5, 6, 8 and part of 1, 4 and 9.

## 1. What was designed and implemented

The product showed its answer as text: a figure, then lists. The redesign makes the plan
something you see. Three shared pieces carry it, used on both the homepage and the planner.

- **`BreakRibbon`** (`src/ui/BreakRibbon.tsx`): one break drawn day by day. Solid blue cells
  are PTO days, the soft blue run is the weekend days they join, ringed teal cells are
  holidays, and one 3px rule runs under the lot. Over 16 days it becomes an unlabelled bar
  with its two ends named. `BreakRibbonKey` is the legend, said once per list.
- **`YearLine`** (`src/ui/YearLine.tsx`): the planning range as one line, every break a
  stretch placed and sized by its real dates, holidays as ticks. On the planner each stretch
  links to its break card and shares hover state with it. `compact` drops numbers and months.
- **`PlannerNav`** (`src/ui/PlannerNav.tsx`): replaces `CompactResultBar`. Once the result
  scrolls away, a pinned bar keeps the figure in view and offers one tap to each part of the
  page, with the current section marked. Inert while hidden.
- **`.plan-card`** (`src/index.css`): the one raised surface on a page (18px radius, soft
  two-layer shadow). It holds the answer and its next action.

Where they landed:

- **Homepage** (`Landing.tsx`): the result is a plan card with the figure, the year line
  (640px and up), the longest break as a ribbon, and the call to action. "Every break in this
  plan" lists each break with its ribbon. Fixed dead space in the desktop hero grid.
- **Planner** (`App.tsx`): the result block is a plan card with the year line under the
  headline. Break cards show the ribbon; "Request this time off" is the one outlined action,
  Save and Track are quiet links. The sticky rail sits below the new bar.
- **Comparison** (`PlanStyleCompare.tsx`): each plan option draws its breaks on a compact
  year line, so two plans differ visibly before the figures are read.
- **Architecture**: renamed `returningDashboard.ts` to `returningDashboardModel.ts` (and its
  test). It collided with `ReturningDashboard.tsx` on case-insensitive filesystems, which
  broke `npm run build` and 16 tests on macOS.

## 2. Key decisions

- **Kept the brand tokens** (Ink, Signal Blue, Sea Glass, Archivo). They are owner-approved,
  contrast-tested and baked into icons and OG images. The gap was composition, not colour.
- **One elevated object per page.** `DESIGN.md` says flat at rest; the plan card is the
  deliberate exception. Do not add shadows to other cards.
- **No DOM reordering.** Reading order and every id, test id and heading are unchanged, so
  old links, anchors and the existing layout tests hold. Mobile length is solved by the
  pinned nav rather than by hiding sections.
- **Nav items differ by width on purpose.** Desktop: Breaks, Calendar, Share (settings are
  always in the rail). Narrower: Breaks, Calendar, Adjust (sharing sits under the result).
- **Holiday cells are ringed, not dotted**, so state is a shape as well as a colour and the
  weekday letter stays legible at 36px.
- Engine, URL state, solver, saved data and `apps/teams` are untouched.

## 3. Remaining tasks for Opus

Priority order.

1. **Update `DESIGN.md`** for the plan card, ribbon, year line and pinned nav (the "no
   shadows at rest" and radius rules need the exception written down). Rename the stale
   "Gapless" headings while there.
2. **Homepage below the fold.** `PlanYear`'s month grid now duplicates the ribbons and the
   year line; decide whether to keep it on phones. The "Plan the breaks" tool rows, holidays
   timetable and "Same inputs" section are unchanged and look a generation older than the
   hero. Bring them to the same standard (16-18px radii, tighter copy).
3. **Planner default plan.** A bare `/pto` opens on 12 three-day weekends ("44 days off"),
   while the homepage hands off a 4-break plan. Consider making "Spread across the year" the
   default for links with no `ps`, with a migration test for old links. Needs owner sign-off.
4. **Use the ribbon everywhere a break is named**: `CommittedBreakCard`, `ReturningDashboard`,
   the My PTO request tracker, Family and Sabbatical results, `PortraitShare`.
5. **Break-card request flow.** Opening "Request this time off" still reveals a second row of
   three controls. Turn it into one sheet: dates, request-by date, copy email, mark requested.
6. **Year line polish**: label collisions when two breaks sit within ~3% of each other
   (numbers overlap), and a today marker when the range starts in the past.
7. **Phone calendar.** `YearOverview` and the month grids are unchanged; restyle the day
   sheet and month grid to match (radii, ribbon colours).
8. **Remove dead code**: `CompactResultBar` in `Headline.tsx` and its tests, once nothing
   imports it.
9. Responsive pass at 320, 375, 768, 1024, 1440; `prefers-reduced-motion`,
   `prefers-contrast: more`, and keyboard order through the pinned nav.

## 4. Files

New: `src/ui/BreakRibbon.tsx`, `src/ui/YearLine.tsx`, `src/ui/PlannerNav.tsx`,
`src/ui/planVisuals.test.tsx`.
Changed: `src/index.css`, `src/ui/App.tsx`, `src/ui/Landing.tsx`, `src/ui/BreakCard.tsx`,
`src/ui/PlanStyleCompare.tsx`, `src/ui/ReturningDashboard.tsx` (import path only).
Renamed: `src/ui/returningDashboardModel.ts`, `src/ui/returningDashboardModel.test.ts`.
Next for Opus: `Landing.tsx` (below the hero), `CommittedBreakCard.tsx`,
`ReturningDashboard.tsx`, `PtoTracker.tsx`, `Family.tsx`, `Sabbatical.tsx`, `YearOverview.tsx`,
`MonthGrid.tsx`, `DayCell.tsx`, `Headline.tsx`, `DESIGN.md`.

## 5. Acceptance criteria and tests

- `npm test`, `npx tsc --noEmit -p tsconfig.app.json`, `npm run lint` and `npm run build` all
  clean. `npm run build` refetches holiday data and rewrites `public/holidays/*.json`; restore
  those with `git checkout -- public/holidays packages/engine/src/data/holidayCoverage.json`
  unless the data change is intended.
- Every existing URL parameter still round-trips; no submit or "Generate" control added.
- The homepage call to action stays inside the first screen at 320x568.
- Ribbon: one cell per day, correct PTO/holiday/off kinds, one spoken sentence
  (`planVisuals.test.tsx`). Add cases for a break crossing a year boundary and a 9/80 week.
- Year line: stretch position matches the dates; links target the right card. Add a test for
  two adjacent breaks and for a two-year range.
- Pinned nav: add a test that `aria-current` follows scroll and that it is not a tab stop
  while hidden (jsdom needs an `IntersectionObserver` stub).
- Screenshots before and after at 1440, 768 and 375 for `/`, `/pto`, `/policy`, per
  `CLAUDE.md` step 3, then owner approval before any push.
- Independent QA of the full path: homepage, open plan, pin a day, request a break, mark it
  requested in My PTO, return to the homepage dashboard.
