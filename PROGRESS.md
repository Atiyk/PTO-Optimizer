# Days Off — unattended run progress

Run started 2026-10-27, RUN MODE (see CLAUDE.md "Unattended runs"). Stacked branches,
draft PRs, no merges — Atiyk merges in the evening. Re-read this file first if resumed
after a restart or context compaction.

## Phase status

| Phase | Branch | Status | PR |
|---|---|---|---|
| 0 — Preflight & baseline | `phase-0-baseline` | done | [#21](https://github.com/Atiyk/PTO-Optimizer/pull/21) |
| 1 — Canonical domain | `phase-1-domain` | done | [#22](https://github.com/Atiyk/PTO-Optimizer/pull/22) |
| 2 — Holiday data foundation | `phase-2-holiday-data` | done | [#23](https://github.com/Atiyk/PTO-Optimizer/pull/23) |
| 3 — Sabbatical correctness | `phase-3-sabbatical-correctness` | done | [#24](https://github.com/Atiyk/PTO-Optimizer/pull/24) |
| 4 — Sabbatical UX & features | `phase-4-sabbatical-ux` | done | (pending) |
| 5 — Landing page rebuild | `phase-5-landing` | not started | |
| 6 — Site-wide hygiene | `phase-6-hygiene` | not started | |
| 7 — PWA (if time remains) | `phase-7-pwa` | not started | |

## Phase 0 findings

- **Network reach**: `date.nager.at` → 200 OK, reachable. `pto-optimizer-seven.vercel.app`
  → 200 OK, reachable. `pto-optimizer.app` → no DNS resolution, not reachable from this
  sandbox (confirms it is not currently live, or at least not from here — Phase 1 will
  decide the SITE_URL default accordingly).
- **Headless screenshots**: Playwright's Chromium is NOT preinstalled. Installed via
  `npx playwright install chromium` (works fine, ~100MB download) and added `playwright`
  as a devDependency (`package.json`) so later phases can reuse it. New file
  `scripts/screenshot.mjs` — `node scripts/screenshot.mjs <url> <outPath> <width>
  <height>`.
- **Baseline test/tsc/build** (before any change):
  - `npm test`: 406 passed, 1 failed (`src/solver/solve.test.ts`, "every w from 0 to 100
    spends the same number of PTO days, at budget=40", a 5s timeout). This is the K9
    baseline's first known-flaky test. The second K9 test (`<1000ms` perf budget) did NOT
    fail on this run — timing-sensitive tests are inherently non-deterministic depending
    on machine load; both are recorded as baseline-known-flaky regardless of which one(s)
    actually trip on a given run.
  - `npx tsc --noEmit`: clean, exit 0.
  - `npm run build` (`tsc -b && vite build` + prerender postbuild): clean, exit 0. All 9
    routes (`/`, `/pto`, `/sabbatical`, 6 country routes) built and prerendered without
    error.
- **Before screenshots**: `docs/screenshots/phase-0/before-{landing,pto,sabbatical}-
  {1440,768,375}.png`, captured against `npm run preview` on port 4173.
  - **Routing note for local screenshots**: `vite preview` falls back to the root
    `index.html` for `/pto` and `/sabbatical` (no trailing slash) — it has no cleanUrls
    rewriting, unlike Vercel. Confirmed with `curl -I` (identical ETag for `/`, `/pto`,
    `/sabbatical`) and fixed by screenshotting `/pto/` and `/sabbatical/` (trailing
    slash) instead, which serves the correct file locally. **This is a local-preview-only
    quirk** — Vercel's `cleanUrls: true` (in `vercel.json`) explicitly supports exactly
    this directory-index lookup for the path with no trailing slash and no extension, and
    the site's existing country routes (`/uk`, `/canada`, etc.) already prove this works
    in production. No code change needed for this; noted here only so later phases don't
    misdiagnose a routing bug that only exists in the local screenshot tool.
  - **Confirms K1 directly**: `curl http://localhost:4173/sabbatical/` (prerendered HTML)
    shows all three placement cards as "30 days away, no holidays inside" — exactly the
    empty-holiday-set symptom the audit predicted, confirmed by reading the raw
    server-rendered markup rather than just the code.

## Phase 1 findings

- **pto-optimizer.app**: confirmed in Phase 0 — no DNS record at all, not just unreachable.
  So `SITE_URL` defaults to the real, live `https://pto-optimizer-seven.vercel.app`
  rather than the custom domain.
- **One source of truth**: `scripts/siteUrl.ts`'s `getSiteUrl()` (reads `SITE_URL` env var,
  defaults as above) is the single function every build-time consumer calls:
  - `vite.config.ts`'s new `siteUrlHtmlPlugin` interpolates `%SITE_URL%`/`%SITE_HOST%`
    placeholders into all 9 HTML entry files (canonical, og:url, og:image, twitter:image,
    Plausible `data-domain`).
  - `scripts/prerender.ts` (ENTRIES moved to new side-effect-free `scripts/routes.ts`, so
    `build-seo-files.ts` can import the route list without re-running prerender's `main()`
    a second time — this was a real bug caught on the first build attempt, see below) uses
    it for the JSON-LD breadcrumb root and each route's own prerender URL.
  - New `scripts/build-seo-files.ts` (added to the `postbuild` chain after prerender)
    generates `dist/sitemap.xml` and `dist/robots.txt` from scratch (the old
    `public/sitemap.xml`/`public/robots.txt` static files are deleted — generating beats
    maintaining two copies that can drift), rewrites `dist/data-sources.json`'s `$schema`,
    and rewrites the example URLs in `dist/docs/index.html`.
  - `.ics` UIDs (`icsExport.ts`) deliberately left untouched — they're identifiers, not
    URLs; changing them would duplicate every event a user already imported.
  - `src/ui/ExportBar.tsx`'s pre-hydration SSR fallback and `src/ui/Landing.tsx`'s
    "Copy as image" canvas text now use the real device - `window.location.host` at
    runtime where available, with a plain client-safe literal (`src/ui/siteUrl.ts`,
    deliberately NOT importing `process.env` — that would crash in the browser bundle) as
    the SSR-only fallback.
- **Bug caught before it shipped**: a first version of `build-seo-files.ts` imported
  `ENTRIES` directly from `prerender.ts`, which re-ran that file's whole `main()` as a
  side effect of the import (since `prerender.ts`'s `main()` executes unconditionally at
  module load) — the second run then failed because the HTML files were already
  prerendered once. Fixed by moving `ENTRIES`/`Entry` into their own side-effect-free
  `scripts/routes.ts`, imported by both scripts.
- **Verification**: `npm run build` clean; `grep -r pto-optimizer\.app dist/` finds nothing
  except the (intentionally unchanged) `.ics` UID strings inside the client JS bundle.
  `/pto` and `/sabbatical` route correctly under `vite preview` only with a trailing
  slash — a Phase 0 finding, not new; Vercel's `cleanUrls` already handles the real
  no-trailing-slash production case.
- **Test/tsc/build status**: `npx tsc --noEmit` clean. `npm test`: 406 passed, 1 failed —
  this time the OTHER K9 baseline timing test (the `<1000ms` perf budget, at ~1005ms);
  the 5s-timeout test passed this run. Both are the same pair of known-flaky timing tests
  recorded in K9/Phase 0; no solver file was touched this phase.
- **Vercel steps for Atiyk** (not done — needs account access): to actually move to
  `pto-optimizer.app` later, in the Vercel dashboard: Project → Settings → Domains → Add
  `pto-optimizer.app`, set it as the Primary domain (this makes Vercel 301 the
  `pto-optimizer-seven.vercel.app` host to it automatically), then set the `SITE_URL`
  environment variable (Project → Settings → Environment Variables) to
  `https://pto-optimizer.app` and redeploy. Until then, nothing else needs to change.

## Phase 2 findings

- **Root cause confirmed exactly as K1 predicted**: `scripts/prerender.ts` uses
  `renderToString`, so no `useEffect` runs server-side and the holiday fetch never fires -
  every prerendered page used to compute with zero public holidays. Confirmed directly:
  before this phase, `curl`ing `dist/sabbatical/index.html` showed all three placements as
  "30 days away, no holidays inside"; after, real holiday names (Thanksgiving, Christmas
  Day, Veterans Day) and a real "Your next day off is in 4 days" appear in the raw HTML.
- **`scripts/build-holidays.ts`** (new, runs as `prebuild`, before `vite build`): fetches
  Nager.Date for all 204 countries in `countries.json` (confirmed every single one is
  genuinely supported - Nager's own `/AvailableCountries` returns the identical 204 codes,
  so no request is wasted) × 3 years (2026-2028), writes `public/holidays/<CC>-<YEAR>.json`
  (612 files, ~2.9MB, all committed). Concurrency-limited to 20 at a time; took ~2.6s end
  to end against the real API. Never overwrites a good committed file with an empty or
  failed response - keeps the existing file and logs loudly instead. If the network is
  down entirely, it aborts after 15 consecutive failures and leaves every remaining file
  exactly as committed, then exits 0 - the build is never blocked on this.
- **`src/data/holidays.ts`**: `fetchYear` now tries the same-origin static file
  (`/holidays/<CC>-<YEAR>.json`) first, Nager only as a live fallback - the `localStorage`
  cache, `OBSERVED_FIX_COUNTRIES` weekend-shift correction, and the `degraded` flag are
  all unchanged. New exports `rawHolidaysToHolidays` and `getPreloadedHolidays` for the
  prerender wiring below. 14 tests in `holidays.test.ts` updated for the new two-stage
  fetch (one new test added: static-404-falls-back-to-Nager); all pass.
- **`scripts/prerender.ts`**: now loads that route's real holiday data (its
  `countryPreset`, or `'US'` for landing/`/pto`/`/sabbatical` - confirmed that's exactly
  what `geolocateCountry()` resolves to under jsdom's default `navigator.language`,
  "en-US") directly from the committed static files, seeds it into `window` before
  `renderToString`, AND re-embeds the identical data as an inline `<script>` in `<head>`
  (before the module script, which loads at the end of `<body>`) so the real browser's
  first paint - before hydration, before any fetch effect - starts from the same snapshot.
  `useAppState.ts`/`Landing.tsx`/`Sabbatical.tsx`'s holiday `useState`s now lazy-initialize
  from this embed (`getPreloadedHolidays`) instead of `[]`.
- **Staleness**: every route's HTML now also embeds `__PTO_PRERENDERED_AT__` (the build
  timestamp); `Landing.tsx` and `Sabbatical.tsx` show "Dates above as of `<date>`" next to
  their date-relative claims. New `.github/workflows/daily-redeploy.yml` POSTs a Vercel
  deploy hook once a day (needs a `VERCEL_DEPLOY_HOOK_URL` repo secret - see Questions
  below) so that drift never exceeds ~24h.
- **Verified in the browser, not just by reading the code**: loaded `/`, `/pto/`,
  `/sabbatical/` against the real `vite preview` build and checked the console - no
  hydration-mismatch warnings on any route, only the pre-existing (unrelated)
  `_vercel/insights/script.js` 404 that only resolves on a real Vercel deploy.
- **Known limitation, deliberately NOT fixed here**: the sabbatical placements are still
  near-duplicates (now "Dec 21 → 31 days away · includes 2 public holidays", "Dec 28 → 31
  days away · includes 2 public holidays", "Dec 20 → ..." - three overlapping windows,
  real data this time instead of empty data). That's K3's diversity/ranking bug, not K1's
  empty-data bug - this phase only had to fix the DATA SOURCE; Phase 3 fixes the ranking.
- **Test/tsc/build**: `npx tsc --noEmit` clean. `npm run build` clean end to end
  (including the new `prebuild` holiday fetch). `npm test`: 407/408 passed (one new test
  added this phase) - the same K9 baseline timing test failed again
  (`<1000ms`, ~1276ms this run); no solver file touched.

## Phase 3 findings

- **3A (diversity + PTO-aware ranking)**: `bestPlacements` now takes `ptoToAdd` and the
  full `Holiday[]`/`countryCode` (not just a bare `Set<string>`), ranks candidates by
  `totalAwayDays` WITH that budget (not the old 0-PTO "natural" total), and picks
  non-overlapping core blocks only (best, then best that doesn't overlap it, then next).
  Verified live: three genuinely different placements now - "Jan 4 → 39 days away ·
  includes Martin Luther King, Jr. Day · quiet travel", "May 31 → 38 days away · includes
  Memorial Day and Juneteenth National Independence Day", "Nov 16 → 38 days away ·
  includes Thanksgiving Day". The "no holiday anywhere in the next year" case is a single
  banner above the cards (`anyHolidayInAnyCandidate`, checked against the FULL search
  window, not just the top 3 shown) instead of repeating "no holidays inside" on each one.
  Search window changed from the old ~18-month (540-day) window to 12 months, matching
  the committed holiday data's own range.
- **3B (headline/card agreement)**: root cause was structural, not a display bug - the
  hero called `extendSabbatical` a SECOND time with the real `ptoToAdd`, while the cards'
  `bestPlacements` always used 0. Fixed by computing `extendedStart`/`extendedEnd`/
  `totalAwayDays`/`ptoBefore`/`ptoAfter`/`marginal` ONCE per candidate, inside
  `bestPlacements` itself, with the real budget - `Sabbatical.tsx` no longer calls
  `extendSabbatical` at all, it just reads the selected candidate's own fields. This
  makes agreement structural (impossible to drift apart again), not just currently-equal.
  Verified live: headline "39 consecutive days" now exactly matches the selected card's
  "39 days away".
  PTO-before-eligibility decision: Atiyk's recorded preference (ordinary PTO, allowed to
  land before eligibility) was implemented - the only real floor is `today` (the actual
  calendar date), not `eligibleFrom`. Added a `minStart` floor to `extendSabbatical` that
  the left edge can never cross even with budget left unspent (fixes K3b's "5 PTO days
  landed in the past" bug), explained in a new sabbatical FAQ entry, and covered by a
  dedicated test. Ties between the two sides now break toward "after" (also tested).
- **3C (marginal baseline)**: root cause confirmed - `marginal[0]` used to be recorded
  BEFORE any free-day merging happened in the loop, so it missed free weekend/holiday
  days immediately adjacent to the block. Fixed by running one full free-only merge pass
  before recording the baseline (and again after each paid day, so a day that unlocks an
  adjacent free day gets credit for both). New test confirms the corrected curve for a
  Monday-start, 4-week, no-nearby-holidays block: baseline is 30 (not 28 - the weekend
  before start merges in for free), and PTO days 1-5 gain `[1,1,1,1,3]` exactly as K3c
  predicted. A second test confirms a holiday adjacent to the block changes the curve
  (the PTO day that reaches it bridges to it for free, gaining 2 instead of 1).
- **3D (calendar shows every month the trip touches)**: root cause confirmed - the
  calendar's `rangeStart` was `selected.start` (the core block's own start), so PTO days
  extending the trip BACKWARD never rendered, and a trip crossing a month boundary only
  showed its first month. Fixed with new `paddedCalendarRange()`: renders from the trip's
  real extended start/end, padded one full month either side. Verified live: a
  placement spanning late December into mid-January now renders November through
  February (4 months), not just one.
- **Tests**: new `src/ui/sabbaticalData.test.ts` (sabbaticalData.ts had none before this
  phase) - 14 tests covering the corrected marginal curve (both the plain and the
  holiday-adjacent case), the tie-break-toward-after rule, the `minStart` floor, card
  note formatting, placement diversity (no overlapping core blocks), PTO-aware ranking,
  and the "no holiday anywhere" flag. All pass.
- **Test/tsc/build**: `npx tsc --noEmit` clean. `npm run build` clean. `npm test`:
  421/422 - same K9 baseline timing test (`<1000ms`, ~1103ms this run); no solver file
  touched.
- **Deliberately deferred to Phase 4** (not fixed here, to keep this phase to data
  correctness only): the duplicate "Country" label (K3f, still visible in this phase's
  screenshots), the fixed 1/2/3/4/6/8/12-week length dropdown (vs. any whole number),
  the lack of URL round-tripping on this page, and `selectedIndex` being index-based
  (re-ranking on a `ptoToAdd` change can now reorder which placement index 0 refers to -
  not a regression from this phase specifically, since ranking was never PTO-aware
  before, but worth flagging now that it visibly can reorder).

## Phase 4 findings

- **4A (visual marginal bars)**: new `MarginalBars` component - one bar per budget day
  (1-15 shown), height-encoded (not colour-encoded, greyscale-legible), the bar at the
  CURRENT PTO+unpaid slider position rendered darkest. The data-driven callout text
  (`marginalReturnText`, grouping contiguous equal gains into sentences like "Day 1 adds 1
  day away. ... Day 5 adds 3 days away.") already existed from Phase 3 and needed no
  rewrite - it was already computed from data, never fixed copy; only its field name
  changed (`ptoUsed` → `daysUsed`, since a "day" can now be PTO or unpaid).
- **4B smaller items**:
  - K3f fixed: removed the second "Country" label wrapping `CountrySelect` (it renders
    its own).
  - Sabbatical length is now a number input with steppers, 1-52 weeks, no submit, live.
  - Placement cards are a real `role="radiogroup"`/`role="radio"` with `aria-checked` -
    verified live, selecting one visibly updates the hero/calendar and the correct card
    shows `aria-checked="true"`.
  - Full URL round-trip: new `src/ui/sabbaticalUrlState.ts` (`c`, `len`, `s`, `pto`,
    `unpaid`, `sel`), wired the same way `useAppState.ts` syncs `/pto`'s URL. Verified
    live: changing any control updates the address bar; `sel` is the placement's own
    start DATE, not a list index, so re-ranking (e.g. moving the PTO or unpaid slider)
    can't silently point the selection at a different window than the one actually
    picked - it falls back to the top-ranked placement instead when the previously
    selected date drops out of the top 3 (verified live: switching to 2 weeks unpaid
    re-ranked the list and correctly fell back). 8 new tests in
    `sabbaticalUrlState.test.ts`.
  - Export row added: "Add to calendar (.ics)" (new `generateSabbaticalICS`/
    `downloadSabbaticalICS` in `icsExport.ts`, reusing that file's own RFC 5545 helpers -
    one event spanning the whole trip, not per-day, since a sabbatical is booked as a
    single block), "Copy as image" (reuses `copyCanvasImage`/`SHARE_IMAGE_WIDTH/HEIGHT`
    from `imageExport.ts`), "Copy link" (reuses `copyText` from `requestText.ts`).
    **Scoped down, flagged**: this is NOT the `ExportBar` component reused wholesale -
    that component is built around /pto's `Break[]`/budget-spent/percentile model, which
    doesn't fit one contiguous block. Reused the underlying correctness primitives
    instead of the component. Verified live: ICS download and image-copy trigger with no
    console errors; "Copy link"'s clipboard write couldn't be definitively confirmed in
    the headless browser (no visible "Copied!" flash within the check window) - likely a
    sandboxed-browser clipboard-permission limitation (the identical `copyText` helper is
    already used, unmodified, by `/pto`'s own working "Copy link"/"Share with a partner"
    buttons), not a new bug, but flagged rather than assumed.
- **4C (unpaid leave)**: new input "Unpaid leave to add: [ N ] weeks". `extendSabbatical`
  now takes both `ptoToAdd` and `unpaidToAdd`, spends PTO first (the limited/precious
  resource) then unpaid, and returns `spentDays: {date, kind}[]` so the calendar can mark
  each day exactly. New `DayCategory` value `'unpaid-leave'`, rendered with its own glyph
  (`UnpaidIcon`, an open ring) beside the numeral - same fill/border as PTO, NOT a third
  colour, matching this calendar's own documented two-colour-role design constraint
  (see `DayCell.tsx`'s comment on `isPtoLike`). Verified live end to end via the DOM's own
  `aria-label`s, not just a screenshot: with 5 PTO + 2 unpaid weeks selected, the hero
  correctly read "4 weeks of sabbatical + 2 weeks unpaid + 4 PTO days before + 1 PTO day
  after + 14 unpaid days after + 1 public holiday inside", and the calendar's individual
  days matched exactly (PTO spent first immediately after the core block, unpaid only
  once PTO ran out). New `SabbaticalLegend` (reuses `PinIcon`/`UnpaidIcon`/`COLORS`
  directly, so it can never describe a treatment the calendar doesn't have).
- **Tests**: `sabbaticalData.test.ts` extended with unpaid-leave cases (PTO-spent-first
  ordering, unpaid-only budget). New `sabbaticalUrlState.test.ts`. All pass.
- **Test/tsc/build**: `npx tsc -b --force` (the REAL composite check - plain
  `tsc --noEmit` on this repo's root tsconfig checks nothing at all, since it has
  `files: []`; this was a mistake caught mid-phase by actually reading the exit code
  rather than assuming a clean run, consistent with CLAUDE.md's own documented warning
  about this exact gotcha) clean. `npm run build` clean. `npm test`: 429/429 - every test
  passed this run, including the K9 baseline timing tests (they're flaky, not reliably
  failing - this run simply didn't trip them).
- **Screenshots**: `docs/screenshots/phase-4/` - default, PTO 0/5/10, and unpaid-leave-set,
  at 1440/768/375px. Mobile layout checked directly via `resize_window` + screenshot, not
  assumed from the desktop layout.

## Questions for Atiyk

- None blocking from Phase 1.
- **Phase 2**: create a Vercel Deploy Hook (Project Settings → Git → Deploy Hooks,
  targeting `main`) and add its URL as a GitHub Actions repository secret named
  `VERCEL_DEPLOY_HOOK_URL` (Settings → Secrets and variables → Actions). Without it,
  `.github/workflows/daily-redeploy.yml` runs daily but skips itself (logs why) instead of
  failing - nothing breaks either way, the site just won't get the daily staleness-refresh
  until that secret exists.
