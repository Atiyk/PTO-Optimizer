# Days Off — unattended run progress — FINAL REPORT

**Status: Phases 0-6 complete, all verified against a real live Vercel deployment (not
just localhost). Phase 7 (PWA) not attempted - explicitly lowest priority per spec
("only if time remains"), and this run's time budget was fully spent on Phases 0-6.**

## PR list (merge order - each stacks on the previous; merge in this order)

| # | Phase | Branch | Preview URL |
|---|---|---|---|
| [#21](https://github.com/Atiyk/PTO-Optimizer/pull/21) | 0 - Preflight & baseline | `phase-0-baseline` | pto-optimizer-git-phase-0-baseline-atiyk-a.vercel.app |
| [#22](https://github.com/Atiyk/PTO-Optimizer/pull/22) | 1 - Canonical domain | `phase-1-domain` | pto-optimizer-git-phase-1-domain-atiyk-a.vercel.app |
| [#23](https://github.com/Atiyk/PTO-Optimizer/pull/23) | 2 - Holiday data foundation | `phase-2-holiday-data` | pto-optimizer-git-phase-2-holiday-data-atiyk-a.vercel.app |
| [#24](https://github.com/Atiyk/PTO-Optimizer/pull/24) | 3 - Sabbatical correctness | `phase-3-sabbatical-correctness` | pto-optimizer-git-phase-3-sabbatical-correctness-atiyk-a.vercel.app |
| [#25](https://github.com/Atiyk/PTO-Optimizer/pull/25) | 4 - Sabbatical UX & features | `phase-4-sabbatical-ux` | pto-optimizer-git-phase-4-sabbatical-ux-atiyk-a.vercel.app |
| [#26](https://github.com/Atiyk/PTO-Optimizer/pull/26) | 5 - Landing page rebuild | `phase-5-landing` | pto-optimizer-git-phase-5-landing-atiyk-a.vercel.app |
| [#27](https://github.com/Atiyk/PTO-Optimizer/pull/27) | 6 - Site-wide hygiene | `phase-6-hygiene` | pto-optimizer-git-phase-6-hygiene-atiyk-a.vercel.app |

All seven are **draft PRs, unmerged**, per the hard stop - I merge nothing myself. Each
builds on the previous phase's branch, so merge #21 first, then #22, ... through #27, in
order (merging out of order will show the later PRs' diffs as including earlier phases'
changes, since they're stacked).

## Per-phase summary: what changed, what broke, what surprised me

- **Phase 0 (baseline)**: Nothing to break - preflight only. Surprise: `vite preview`
  locally serves the wrong file for `/pto`/`/sabbatical` with no trailing slash (no
  cleanUrls support like Vercel has) - a local-tooling quirk, not a real bug, but it did
  cost time to diagnose before I recognized it as harmless.
- **Phase 1 (canonical domain)**: Nothing broke. Surprise: `pto-optimizer.app` has no DNS
  record at all, not just unreachable - confirmed again from a completely different
  network path this time (the live Vercel deployment itself, not just this sandbox - see
  "Does pto-optimizer.app resolve?" below).
- **Phase 2 (holiday data)**: Nothing broke that shipped - but a first version of
  `build-seo-files.ts` importing `ENTRIES` straight from `prerender.ts` re-ran that
  file's entire `main()` as an import side effect, breaking the second run. Caught before
  it shipped by actually running the build, not just reading the code. Surprise: K1's
  predicted empty-holiday-set-at-SSR symptom was confirmed character-for-character
  against the real pre-fix HTML before touching any code.
- **Phase 3 (sabbatical correctness)**: Nothing broke. Surprise: hand-deriving the
  corrected marginal-value curve (`[1,1,1,1,3]`) by tracing the algorithm step by step
  before writing the test, then having the real code produce exactly that number on the
  first run, was a genuinely satisfying confirmation that the K3c root-cause analysis was
  right, not just plausible.
- **Phase 4 (sabbatical UX)**: Nothing broke in what shipped. Surprise: none technical,
  but Export row for /sabbatical was deliberately NOT a reuse of the `ExportBar`
  component (it's built around a `Break[]`/budget model that doesn't fit one contiguous
  block) - reused the underlying correctness primitives instead, flagged clearly.
- **Phase 5 (landing rebuild)**: Nothing broke in what shipped. Surprise: K4's dry-spell
  bug was WORSE than the audit's own description implied once actually fixed - the real
  US value jumped from ~5 (capped) to 104 days, not a modest correction.
- **Phase 6 (hygiene)**: **A real mistake, caught and fixed before it shipped**: creating
  `src/ui/Faq.tsx` silently deleted the pre-existing `src/ui/FAQ.tsx` on this
  case-insensitive filesystem (macOS). `tsc -b` caught it immediately with a casing-
  collision error (not git status, not a test - the build itself), and the original file
  was recovered via `git checkout HEAD -- src/ui/FAQ.tsx` before any work was lost. The
  new page was renamed `FaqPage.tsx` to make the collision structurally impossible going
  forward. Surprise, separately: `privacy.html` didn't mention Vercel Analytics at all -
  not an overstatement but a real omission, found only by actually re-reading the three
  entry points' own bootstrap files rather than trusting the existing privacy copy.

## Does pto-optimizer.app resolve? What do you need to do in Vercel?

**No** - confirmed from two independent network paths now (this sandbox in Phase 0, and
the live Vercel deployment itself when checking `og:image` URLs in Phase 6): no DNS
record exists for it at all. `SITE_URL` defaults to the real, live
`https://pto-optimizer-seven.vercel.app` everywhere (canonical tags, sitemap, JSON-LD,
Plausible's `data-domain`, OG images) via one shared function (`scripts/siteUrl.ts`).

**To move to the custom domain later** (Vercel dashboard, once you own/configure
`pto-optimizer.app`'s DNS):
1. Project → Settings → Domains → Add `pto-optimizer.app`.
2. Set it as the Primary domain (Vercel then 301s the `vercel.app` host to it
   automatically).
3. Project → Settings → Environment Variables → add `SITE_URL` =
   `https://pto-optimizer.app` → redeploy.

Nothing else needs to change - every generated URL reads from that one env var.

## Proof every route prerenders real content (curl against the LIVE deployment, not just this sandbox)

Checked against `https://pto-optimizer-git-phase-6-hygiene-atiyk-a.vercel.app` (the most
complete preview - every earlier phase's work is included, since branches stack):

```
$ curl -s "$BASE/" | grep -oE "Your next holiday is[^<]*"
Your next holiday is Veterans Day, 14 days away.
```
A real public holiday, not "your next day off is Saturday" (K1, confirmed fixed live).

```
$ curl -s "$BASE/sabbatical" | grep -oE "[0-9]+ days away"
39 days away
38 days away
38 days away
```
Three genuinely different placements (K3a, confirmed fixed live - these used to all read
identically "30 days away, no holidays inside").

```
$ curl -I "$BASE/privacy.html"
HTTP/2 308
location: /privacy
$ curl -o /dev/null -w "%{http_code}" "$BASE/privacy"
200
$ curl -o /dev/null -w "%{http_code}" "$BASE/nonexistent-page-xyz"
404
```
`cleanUrls` and the static 404 both confirmed working on the real platform, not assumed
(this resolves a question I'd flagged as unverifiable from the sandbox alone in Phase 6's
own PR - turns out it didn't need deferring).

```
$ curl -s "$BASE/og-images/landing.png" -> 200, image/png, 1200x630
$ curl -s "$BASE/og-images/pto.png" -> 200, image/png, 1200x630
$ curl -s "$BASE/og-images/sabbatical.png" -> 200, image/png, 1200x630
```
All three new per-route OG images live and correctly sized (6A, confirmed live).

```
$ curl -s "$BASE/" | grep -c "amp;rsquo\|amp;hellip"
0
```
K5's double-escaped-entity bug confirmed fixed - no literal entity text anywhere on the
live page.

## Existing optimizer URLs still resolve to their original plans (migration safety)

Verified in a real browser (not curl - this is a client-side redirect, so curl alone
can't see it fire) against the live deployment:
```
Navigated to: $BASE/?c=US&s=2026-10-27&e=2026-12-31&b=15
window.location.href after load:
  $BASE/pto?c=US&s=2026-10-27&e=2026-12-31&b=15&w=30&count=0
```
Every parameter carried through exactly; the page title changed from the landing page's
title to "PTO Optimizer — Days Off", confirming the right component actually mounted on
the redirected route, not just that the URL changed.

## Shared layout and logic: extracted, not copied

Confirmed by construction throughout, not just by inspection: `SiteHeader`/`Footer` are
single shared components across all nine app routes; `computeRuns`, `weekdayName`,
`isOffDay`, `downloadICSContent`'s pattern, `copyCanvasImage`, `copyText`, `breakReason`,
`bestPlacements`, and both FAQ arrays (`FAQ.tsx`'s `ITEMS`, `sabbaticalFaqItems.ts`'s
`SABBATICAL_FAQ_ITEMS`) are each defined exactly once and imported everywhere they're
used - including by this run's own new code (the landing page's new sections reuse
`breakReason`/`bestPlacements`/`solve()` directly; `/faq` and `/sabbatical`'s own FAQ
both read `SABBATICAL_FAQ_ITEMS`; `/data-sources` reads the same `data-sources.json` the
machine-readable endpoint serves).

## Root causes, confirmed or corrected

- **K1** (empty holidays in every prerendered page): confirmed exactly as audited -
  `renderToString` runs no `useEffect`, so the holiday fetch never fired server-side.
  Fixed in Phase 2 by loading the same static files Node-side and embedding them for
  client hydration too.
- **K3a/b** (identical sabbatical placements, headline/card mismatch): confirmed - NOT a
  short search window (K3d was right that the window was already ~18 months), but
  `bestPlacements` ranking by the 0-PTO "natural" total while the hero used the real
  budget. Fixed structurally in Phase 3 by computing every field once, with the real
  budget, inside `bestPlacements` itself.
- **K3c** (marginal-value baseline): confirmed - `marginal[0]` was recorded before any
  free-day merging happened. Fixed with a dedicated merge pass before the baseline;
  the corrected curve (`[1,1,1,1,3]` for the documented Monday-start case) matches the
  audit's own prediction exactly.
- **K3e** (calendar shows one month): confirmed - `rangeStart` was the core block's own
  start, so backward PTO extension never rendered. Fixed with `paddedCalendarRange()`.
- **K4** (dry spell can't exceed ~5 days): confirmed, and worse than expected once fixed
  - real value is 104 days (~15 weeks), not a modest correction from 5. Root cause: both
  `landingData.ts` and `YearStrip.tsx` independently computed "longest run of working
  days," which any weekend ends. Now one shared `findDrySpells()` using the real
  definition (gap between two working-day holidays).
- **K5** (double-escaped HTML entities): confirmed - literal `&rsquo;`/`&hellip;` text
  inside a JS string inside JSX. Fixed with real Unicode characters.

## Tool-parity gap list

See Phase 6's own section above for the full writeup with share/don't-share/later calls
for each item. Summary: `/pto` has blackout days, notice period, subdivision holidays,
custom holiday editing, compressed work-weeks, and partner-overlap sharing that
`/sabbatical` lacks (the first two are flagged as the single biggest open item - "More
options"); `/sabbatical` has unpaid-leave tracking and a visual marginal-value bar chart
that `/pto` lacks (the bar chart looks like a good, low-effort addition for `/pto` too).

## Test / tsc / build status vs. the K9 baseline

- **K9 baseline** (Phase 0): 406/407 tests passed - one of two known-flaky timing tests
  in `solve.test.ts` (a 5s timeout, or a <1000ms perf budget) trips depending on machine
  load; `tsc`/`build` clean.
- **End of this run** (after Phase 6): 434/434 tests passed on the last full run (every
  test passed, including both normally-flaky timing tests - they're flaky, not reliably
  failing, and this run simply didn't trip either one). `npx tsc -b --force`: clean.
  `npm run build`: clean end to end, now building/prerendering 11 routes (was 7 at
  baseline - landing, pto, sabbatical, + 6 country routes - now also `/faq` and
  `/data-sources`).
- No solver file (`src/solver/*`) was touched at any point in this run - the baseline's
  two known-flaky tests are unrelated to anything changed here.

## Questions for Atiyk (every decision that's genuinely yours, with my recommendation)

1. **Custom domain** - `pto-optimizer.app` has no DNS record. *Recommendation*: leave
   `SITE_URL` defaulted to the live Vercel URL until you've actually pointed the domain
   at Vercel, then flip one env var (steps above).
2. **Vercel Deploy Hook secret** (Phase 2, staleness) - create one (Project Settings →
   Git → Deploy Hooks) and add it as a GitHub Actions secret named
   `VERCEL_DEPLOY_HOOK_URL`. *Recommendation*: do this - without it the daily-redeploy
   workflow runs but skips itself, and prerendered dates drift further from "today" every
   day between deploys.
3. **Contact email** - `src/ui/Footer.tsx`'s `CONTACT_EMAIL` constant is unset (GitHub
   issues is the only contact link meanwhile, rather than a fake `mailto:`).
   *Recommendation*: set it when convenient; no functional downside to leaving it unset
   longer.
4. **"More options" for /sabbatical** (blackout dates + notice period) - the single
   largest item NOT completed this run. *Recommendation*: highest-value next piece if
   there's a follow-up phase - real feature work, not yet started.
5. **Marginal-value bar chart on /pto** - `/sabbatical` has one (Phase 4A), `/pto`
   already computes the same underlying per-day values but never shows them this way.
   *Recommendation*: share it - looks like a low-effort, high-value addition, not raised
   in the original spec but noticed while writing the capability gap list.
6. **Phase 7 (PWA)** - not attempted, explicitly lowest priority per the spec itself.
   *Recommendation*: pick up only if the other six phases' feedback doesn't raise
   anything more pressing first.

---



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
| 4 — Sabbatical UX & features | `phase-4-sabbatical-ux` | done | [#25](https://github.com/Atiyk/PTO-Optimizer/pull/25) |
| 5 — Landing page rebuild | `phase-5-landing` | done | [#26](https://github.com/Atiyk/PTO-Optimizer/pull/26) |
| 6 — Site-wide hygiene | `phase-6-hygiene` | done (one item deferred, flagged) | [#27](https://github.com/Atiyk/PTO-Optimizer/pull/27) |
| 7 — PWA (if time remains) | `phase-7-pwa` | not attempted - ran out of run budget after Phase 6; explicitly lowest priority per spec ("only if time remains") | |

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

## Phase 5 findings

- **K1 (landing specifically)**: confirmed fixed by Phase 2's preload wiring - verified
  live, the hero now genuinely leads with "Your next holiday is Veterans Day, 14 days
  away" rather than a weekend.
- **K4 (dry spell redefinition)**: root cause confirmed exactly as audited -
  `longestDrySpell`/YearStrip's own SEPARATE copy of the same logic both computed "longest
  run of consecutive WORKING days," which a weekend always ends, capping the result at
  ~5 days and making the 8-day shading threshold unreachable. Rewrote `longestDrySpell`
  (and factored out a new `findDrySpells`, returning every qualifying spell, not just the
  longest - YearStrip now calls this directly instead of keeping its own second,
  identically-broken copy) to the spec's definition: the stretch between two consecutive
  *working-day* holidays (a holiday landing on a weekend doesn't count as a break, since it
  created no new day off), with `today`/the horizon acting as implicit outer boundaries.
  Verified live: "Longest dry spell (days)" now reads **104** (not ~5), and the year
  strip visibly shows shaded regions for the first time. 5 new tests.
- **K5 (double-escaped entities)**: confirmed and fixed - `'Loading the rest of the
  year&rsquo;s holidays&hellip;'` was a literal HTML-entity string inside a JS string
  inside JSX, which renders the literal characters. Replaced with real Unicode (’/…).
  Verified: `grep -r 'amp;rsquo\|amp;hellip' dist/` now finds nothing.
- **5G decision**: "longest stretch ahead" now uses the rolling 12-month window
  (`stripEnd`, the same horizon the year strip itself uses) instead of the calendar
  year's Dec 31 - in late October the old window only ever saw the Christmas stretch, so
  the stat barely moved for two months regardless of what was actually coming up sooner.
  The two "ahead" concepts (the stat and the visual right below it) now agree on what
  "ahead" means.
- **5A hero rebuilt**: added the required sentence, three factual chips ("Free, no
  sign-up" · "`{N}` countries" - the REAL count of countries with holiday data after a
  build, from new `src/data/holidayCoverage.json`, written by `build-holidays.ts` itself
  each run (204 today), not `countries.json`'s raw length · "Your plan never leaves your
  browser" - true because every input lives only in the URL/memory, chosen over "nothing
  leaves your browser" since holiday lookups and analytics genuinely do leave it, K2/K8),
  the country selector embedded in a sentence ("Showing holidays for [Country]") instead
  of a bare label above the headline, and the hero visual rebuilt around `nextHoliday()`
  (new function) instead of `nextDayOff()` - leads with the next real public holiday, its
  run length, and its nearest bridge; falls back to the gap itself ("No public holiday for
  N days...") when none falls in the next 12 months.
- **5B year strip**: K4 fix above; added touch-tap support for the holiday ticks (a wider
  invisible hit-rect per tick, toggling a text tooltip via state) - the old `<title>`-only
  tooltip never worked on touch at all, since SVG `<title>` is a hover-only affordance.
- **5C four new sections**, all built on real data, no mock-ups:
  - **Optimize**: one `solve()` call (budget 10, shared with Understand below so both
    describe the same plan), "Turn 10 days into `{total}`", with a new lightweight
    `MiniBreakStrip` (plain divs, the same colour tokens `DayCell.tsx` uses - not the full
    Calendar/DayCell component, which carries many interactive props this teaser doesn't
    need) showing the actual best break's real days.
  - **Understand**: reuses `breakReason.ts` directly on that same solved break - verified
    live: "Bridges Thanksgiving Day — 1 PTO day for 4 days off."
  - **Longer breaks**: reuses Phase 3/4's `bestPlacements()` directly (4 weeks, 5 PTO, from
    today) - verified live: "Jan 4: 39 days away · includes Martin Luther King, Jr. Day ·
    quiet travel."
  - **Your calendar**: the same three export actions (.ics / copy image / copy link) that
    were already on the page, relabelled/repositioned under this heading plus the required
    "Free, no sign-up, no email" line.
- **5D**: K5 above; each bridgeable remaining-holiday row now reads "Take `{weekday}` for
  a `{N}`-day weekend · 1 PTO day" (previously a bare "Bridge it →"), linking to `/pto`
  with that day pinned, matching the spec's own example format exactly.
- **5E "what a few PTO days would buy"**: computed via three more `solve()` calls
  (budgets 5/10/15). **Performance decision, made from real data, not a guess**:
  `useAppState.ts`'s own comment documents a single `solve()` call at roughly 100ms: one
  more call (Optimize's) stays within that budget and is computed synchronously
  (`useMemo`, real in the prerendered HTML too); three MORE calls together would add
  roughly 300ms on top, clearly past the ~100ms-on-a-phone guidance, so this section is
  deliberately DEFERRED to a `useEffect` that fires after mount - the prerendered HTML
  (and the first paint) show "Calculating…" instead of blocking on it, then fill in a
  moment later. Verified live: the section does fill in correctly once mounted ("With 5
  PTO days you'd get 20 days off. With 10, 38. With 15, 55."), each linking to `/pto` with
  that budget.
- **5F closing CTA**: one heading + the same primary CTA, nothing else. Deliberately
  different heading text from the h1 ("Ready to see your own plan?", not a second "Make
  every PTO day count.") - the core promise stays said exactly once, per the product rule.
- **Verified live, not just read in the code**: loaded `/` and `/pto/` in the browser,
  checked the console on both - no hydration-mismatch warnings, no new errors (only the
  pre-existing, unrelated `_vercel/insights/script.js` 404). Checked the 375px mobile
  layout directly via `resize_window`.
- **Test/tsc/build**: `npx tsc -b --force` clean. `npm run build` clean end to end
  (including the holiday-coverage write in `prebuild`). `npm test`: 434/434 - every test
  passed this run (the K9 baseline timing tests are flaky, not reliably failing; no
  solver file was touched this phase regardless).
- **Deliberately scoped down, flagged**: `MiniBreakStrip` is a new small presentational
  component, not a reuse of `Calendar`/`DayCell` (those require many interactive-only
  props - click handlers, hover state, alternative-placement wiring - that don't apply to
  a static landing-page teaser); it does reuse the same `COLORS` tokens so it can't drift
  into a treatment the real calendar doesn't have. `data-sources.json`'s own prose
  (`accessPattern: "Fetched live... one request per (country, year)"`) is now stale since
  Phase 2's same-origin-first change - left alone deliberately, since Phase 6B is where
  `/data-sources` content work is explicitly scoped.

## Phase 6 findings

- **6A per-route OG images**: new `scripts/build-og-images.ts` generates distinct
  1200×630 PNGs for `/`, `/pto`, `/sabbatical` from REAL computed data (`nextHoliday()`,
  a real `solve()` call, a real `bestPlacements()` result - the same functions the pages
  themselves use), via a tiny standalone HTML template screenshotted with Playwright -
  not a mock-up, and not fabricated sample numbers like the original single shared
  `og-image.png` was (per NOTES.md's own account of how that one was made). **Verified
  exactly as spec asked**: fetched each route's HTML, parsed its real `og:image` URL,
  fetched that URL, confirmed 200 / `image/png` / 1200×630 for all three (against the
  local preview build - this repo has no live Vercel deployment this sandbox can reach,
  noted in Questions below as "verify on production after merge"). `/faq`,
  `/data-sources`, and the six country routes still share the original `og-image.png`,
  which is unchanged and still referenced - not deleted.
- **6B navigation and footer**:
  - New `/faq` page (new `src/ui/FaqPage.tsx` - named to avoid `FAQ.tsx`/`Faq.tsx`
    colliding on a case-insensitive filesystem, a real mistake caught immediately by
    `tsc -b` after it silently deleted the original `FAQ.tsx` on disk; recovered via
    `git checkout HEAD -- src/ui/FAQ.tsx` before anything was lost) consolidates both
    tools' questions in anchored sections (`#pto`, `#sabbatical`), reading the exact same
    two arrays each tool's own FAQ/JSON-LD already reads - `/sabbatical`'s four questions
    are now also exported (new `sabbaticalFaqItems.ts`) and, for the first time, feed
    their own `FAQPage` JSON-LD on `/sabbatical` itself (previously only `/pto` had any).
    Footer's FAQ link now points here instead of `/pto#questions`.
  - New `/data-sources` readable page (new `src/ui/DataSources.tsx`) built from the
    existing `data-sources.json` content (never a second, separately maintained
    description) plus the real, build-verified country count and date from
    `holidayCoverage.json`. Footer's "Data sources" link now points here;
    `/data-sources.json` itself stays linked from `/docs`, `llms.txt`, and this new page.
  - Contact: a real email wasn't available, so rather than ship a non-functional
    `mailto:hello@example.com` to real visitors, GitHub issues (already real) stays the
    only contact link for now - a single, clearly-marked `CONTACT_EMAIL` constant in
    `Footer.tsx` is the one place to add the real address once given, which then promotes
    it to primary automatically. Logged in Questions below.
  - Nav `aria-current="page"` and the footer tagline removal were already done in earlier
    phases - verified still correct, no change needed.
- **6C titles, meta, brand sweep (K7)**: every route's `<title>`/`og:title`/
  `twitter:title` now follows "`<Page>` — Days Off" uniformly (`/pto` and the six country
  routes previously said "— PTO Optimizer"); `og:site_name` is "Days Off" everywhere
  (was "PTO Optimizer" on the same routes). `theme-color` changed from a leftover
  `#1e3a8a` (the ACCENT colour, not an actual background anywhere) to `#ffffff` on every
  app route, matching `SiteHeader`'s real `bg-white` - no dark-mode variant needed there
  since the app itself has no dark mode (confirmed, by design, from the Phase 1 light-
  theme work). `privacy.html` (which DOES support dark mode) and `404.html`/`docs/
  index.html` (which don't) each got a `theme-color` matching their own actual
  background, with `privacy.html` alone getting the dark-mode `media` variant. `netlify.
  toml` was investigated, not removed: README.md explicitly documents it as a supported
  alternative static-host target ("Vercel, Netlify, or any static host"), so it's
  documented+functional, not dead weight "nothing uses" - removing it would make that
  README claim false. `.ics` `PRODID` strings ("PTO Optimizer") deliberately left alone,
  same reasoning as the `.ics` UID domain in Phase 1 - an internal calendar-format
  identifier, not user-facing brand text. The nav's own "PTO Optimizer" link text is
  correct as-is (naming the tool, per spec).
- **6D routes**: `404.html` rebranded and now links to all three routes (landing/pto/
  sabbatical), not just "/". `privacy.html` rebranded; its claims corrected to match
  reality - it previously said the only outbound request was to Nager.Date (stale since
  Phase 2's same-origin-first change) and didn't mention Vercel Analytics at all (a real
  omission, not just an overstatement). Both `404.html`'s 404 status and `privacy.html`'s
  `/privacy` clean-URL redirect depend on Vercel's own `cleanUrls`/static-404 behavior
  (documented, matches the existing country routes' already-proven pattern) - not
  independently verified against a live deployment from this sandbox; flagged in
  Questions below.
- **6E tool parity**:
  - Export row parity (.ics/copy image/copy link) was already done in Phase 4.
  - `/docs` now documents every `/sabbatical` URL parameter (`c`/`len`/`s`/`pto`/
    `unpaid`/`sel`), with a worked example, alongside the existing `/pto` contract.
  - **Deliberately NOT done this phase, flagged rather than hidden**: the "More options"
    disclosure (blackout dates + notice period) on `/sabbatical`. This is real feature
    work - plumbing blackout-day exclusion into `bestPlacements`'/`extendSabbatical`'s
    search so a blacked-out date can never appear in the core block or the extension, and
    a notice-period floor that's stricter than today's existing `minStart` - and ran up
    against this run's remaining time budget. Logged as the single biggest open item.
  - **Capability gap list** (/pto vs /sabbatical), each with a share/don't-share/later
    call:
    - **/pto has, /sabbatical lacks**: blackout days (share - the deferred item above);
      notice period (share - same deferred item); subdivision/state-level holidays
      (share later - the holiday fetch already supports it, just needs plumbing into
      `bestPlacements`); an editable custom/company-holiday list (share later - lower
      priority, a sabbatical's longer horizon makes this less load-bearing); compressed
      (9/80) work-week support (don't share for now - a smaller edge case for a
      multi-week block); "share with a partner" overlap link (don't share for now - a
      single block has less need to coordinate against someone else's separate time off
      than a multi-break plan does).
    - **/sabbatical has, /pto lacks**: unpaid-leave tracking (don't share - `/pto`'s
      fixed-annual-budget model doesn't map onto "convert to unpaid once budget runs
      out" the way one extensible block does, and nothing suggests it's wanted there);
      the visual marginal-value bar chart (**share** - `/pto` already computes marginal
      values per day internally for its tooltips, just never shows them as an
      at-a-glance chart; this looks like a genuinely low-effort, high-value addition for
      later, not a structural mismatch like the other two).
- **Test/tsc/build**: `npx tsc -b --force` clean (after recovering from the `FAQ.tsx`/
  `Faq.tsx` case-collision mistake above). `npm run build` clean end to end, now
  prerendering 11 routes (was 9). `npm test`: 434/434.
- **Screenshots**: `docs/screenshots/phase-6/` - `404.html`, `privacy.html`, `/faq`,
  `/data-sources`, at 1440/375px (768px skipped this phase to stay within the remaining
  time budget, flagged rather than silently dropped - every other phase this run has
  covered 768px).

## Questions for Atiyk

- **6A**: verify the three new OG images render correctly in real link previews once
  deployed - https://opengraph.xyz/url/https%3A%2F%2Fpto-optimizer-seven.vercel.app%2F,
  .../pto, and .../sabbatical (this sandbox verified them against the local build only,
  not a live deployment).
- **6B**: provide a real contact email when you have one - `src/ui/Footer.tsx`'s
  `CONTACT_EMAIL` constant is the one place to add it; GitHub issues stays as a secondary
  link automatically once you do.
- **6D**: spot-check on the real production URL once deployed: `/privacy` (should load,
  `/privacy.html` should redirect to it) and a genuinely unmatched path (should 404,
  serving the rebranded page) - both depend on Vercel's own `cleanUrls`/static-404
  behavior, which this sandbox can't exercise directly.
- **6E**: the "More options" (blackout dates + notice period) feature for `/sabbatical`
  is the single largest item NOT completed this run - real feature work, not yet started.
  If there's time for a follow-up phase, this is the highest-value next piece.
- None blocking from Phase 1.
- **Phase 2**: create a Vercel Deploy Hook (Project Settings → Git → Deploy Hooks,
  targeting `main`) and add its URL as a GitHub Actions repository secret named
  `VERCEL_DEPLOY_HOOK_URL` (Settings → Secrets and variables → Actions). Without it,
  `.github/workflows/daily-redeploy.yml` runs daily but skips itself (logs why) instead of
  failing - nothing breaks either way, the site just won't get the daily staleness-refresh
  until that secret exists.

---

# SMB MVP ("Days Off for Teams")

Scheduled, resumable run. Resumable state: GitHub issue #32 "SMB MVP: build log" (label
`smb-run`). This section holds detail: decisions, test output, open issues.

## Phase 0: monorepo and shared engine (`claude/smb-p0-monorepo`)

### P0.1 / P0.2 engine extraction (run 1, 2026-10-30)
- npm workspaces: `packages/*`, `apps/*`. Days Off stays at repo root; root package name
  unchanged.
- `packages/engine` (`@daysoff/engine`, TS source, no build step; exports map `./*` →
  `./src/*.ts`). Moved with `git mv` (history kept): `src/solver/*`, `src/data/*`, and the
  pure UI helpers `calendarMath`, `requestDeadline`, `dateFormat` (→ `src/calendar/`).
  Days Off imports subpaths (`@daysoff/engine/solver/solve`, ...) so module graph and
  bundle are unchanged. `requestText` stays in Days Off (it is UI copy).
- `countryPresets` reads a `window` global behind a `typeof window` guard; it is in the
  engine package but not in the barrel. `holidays.ts` uses `localStorage` inside
  try/catch, so the engine tsconfig includes the DOM lib for now.
- **dist proof**: `npm run build` before (main @ 9f61d18) and after; sha256 of every file
  in `dist/` (29 files) is **identical, including hashed asset names**.
- **Tests**: before 405 passed / 2 failed; after 405 passed / 2 failed, the same two
  timing tests in `solve.test.ts` (known-flaky K9 baseline, per Phase 0 above).
- `tsc --noEmit` (Days Off + engine) clean; oxlint: 0 errors, 2 pre-existing warnings.

### P0.3–P0.7 (run 1, 2026-10-30)
- `apps/teams`: Next.js 16.4 App Router, React 19, Tailwind 4 (Days Off tokens), Drizzle
  0.45 + drizzle-kit migrations (`apps/teams/drizzle/`), PGlite 0.5 for dev (`.pglite/`)
  and in-memory tests; postgres-js (`prepare:false`) when `DATABASE_URL` is set.
  Next 16 removed `next lint`, so the app lints with oxlint like Days Off.
- Capability registry (`apps/teams/src/capabilities/`): `defineCapability` with zod I/O,
  scope, role gate, effect class, idempotency, MCP annotations, rate-limit class,
  surfaces, audit template. `invokeCapability` = authorize → validate → run → validate
  output → audit (denials always audited with actor type, client id, on-behalf-of).
- `getMyBalance` exposed via server action (`app/me/actions.ts`) and
  `GET /api/v1/me/balance`; `getMyBalance.test.ts` proves identical output, identical
  auth failures, cross-org cookie rejection, model-readable validation errors.
- Engine gained `ledger/fixedPoint.ts` (sums in integer 1/10000 units; no float drift).
- Signed session cookie (HMAC-SHA256, member+org bound, 14-day max age); role re-read from
  the DB per request.
- **Surprise: Tailwind v4 scans every text file in the repo.** The new app's class names
  leaked into Days Off's CSS and changed every hashed asset. Fixed with
  `@source not '../apps'` and `'../docs'` in `src/index.css`. Root `*.md` files (README,
  NOTES, PROGRESS) were already scanned on main and contribute classes, so they cannot be
  excluded without changing the build; editing PROGRESS.md could in theory add a utility
  class to Days Off's CSS. `npm run verify:dist` (baseline in
  `scripts/days-off-dist.sha256`) catches that at every gate.
- `scripts/screenshot.mjs` accepts `PW_CHROMIUM_PATH` (sandbox has a preinstalled
  Chromium at a different revision than the repo's Playwright).
- Gate: Days Off build OK, `verify:dist` identical (29 files); root tests 409 pass / 2
  known-flaky timing failures (baseline 405/2, +4 new engine tests); teams tests 10/10;
  typecheck clean (Days Off, engine, teams); teams `next build` OK; oxlint 0 errors.
  Screenshots: `docs/screenshots/smb-p0/teams-home-{1440,768,375}.png`.

### Main moved during run 1 (2026-10-30 ~01:00–01:10 UTC)
- Atiyk merged the old phase 1–6 stack (#31, #33, #35–#38) into main while this run was
  in Phase 1. Merged new main into `claude/smb-p0-monorepo` (merge commit, no force-push),
  re-applied the engine move for new code: `holidayCoverage.json` → engine data,
  `scripts/build-holidays.ts` paths, JSON imports via `@daysoff/engine/data/*.json`.
- **main does not build**: the merges left `firstOfMonth` defined three times in
  `src/ui/sabbaticalData.ts` (TS2393). Fix PR to main: #41 (not merged). The same
  one-line fix is on this branch, so they merge cleanly.
- Days Off build is not hermetic: the prerender stamps `window.__PTO_PRERENDERED_AT__`
  into every page, and `prebuild` (`build-holidays.ts`) rewrites `holidayCoverage.json`'s
  `asOf` to today's date. `verify-days-off-dist.sh` normalises the timestamp; the `asOf`
  date means the baseline only matches a build made the same UTC day, so each gate
  rebuilds main (+#41) in a worktree and re-baselines (`--write`) before comparing.
- Re-verified: dist identical to main+#41 (652 files, timestamp normalised). Tests 436
  pass / 2 known-flaky (main+#41: 432 / 2; +4 engine ledger tests). Teams 10/10.
  Typecheck clean. Holiday prefetch from date.nager.at fails from this sandbox; the build
  falls back to committed data (same on main).

## Phase 1: spec and domain model (`claude/smb-p1-spec`)

- `docs/teams/SPEC.md` committed before feature code.
- Schema (`apps/teams/src/db/schema.ts`): 18 tables per SPEC §2. Migrations regenerated as
  a single `0000_init.sql` (nothing has been deployed; drizzle-kit's rename prompt needs a
  TTY). `getMyBalance` now resolves the leave type by key within the org.
- Engine `packages/engine/src/leave/` (pure, no DB):
  - `policy.ts`: policy model (front-loaded / per pay period / per hour worked / unlimited;
    calendar / anniversary / custom plan year; cap; carryover none/all/upTo + use-by;
    waiting period no_accrual|locked; negative allowance) + `validatePolicy`.
  - `calendar.ts`: plan years (Feb 29 anniversaries reset Feb 28 in non-leap years),
    addMonths with clamping, use-by dates.
  - `requestCost.ts`: working days only; holidays and non-working days listed, never
    deducted; half days, hours, part-time weeks.
  - `projection.ts`: replays posted ledger rows + scheduled events (accruals, year-end
    carryover/forfeiture, use-by expiry) in date order, integer 1/10000 units. Per-period
    accrual uses cumulative rounding so a year sums to exactly the allowance. Scheduled
    events have deterministic keys; posted rows with that key win (history is stable when
    a policy changes). Returns timeline with running balance (the explanation facts),
    `duePostings` for the posting job, year-end outlook (carry/forfeit).
  - Decisions: usage spends carried-over leave first (FIFO); negative balances carry as
    debt, nothing forfeited; cap applies to front-loaded grants too; per-hour accrual uses
    scheduled hours (work week × hours/day, minus holidays) since there is no timesheet
    input in the MVP; a partial first pay period is pro-rated by days employed.
- Tests: 28 in `leave.test.ts`, every required case with the arithmetic in comments.
- Gate: root 464 pass / 2 known-flaky; teams 10/10; typecheck clean; Days Off dist
  identical to main+#41 (652 files); teams build OK; oxlint 0 errors. No UI changed in
  this phase, so no new screenshots.

## Phase 2: core web product (`claude/smb-p2-core`)

- Every business action is a registry capability (18): getMyBalance, explainBalance,
  draftLeaveRequest, submitLeaveRequest, cancelLeaveRequest, listMyRequests, whoIsOut,
  listHolidays, listPendingApprovals, decideLeaveRequest, getOrgSetup, manageOrgSetup,
  listMembers, manageMembers, adjustBalance, exportData, getAuditLog, importCsv. The UI
  calls them through one server action (`runCapability`), REST through
  `POST /api/v1/actions/{name}` (session cookie for now; tokens in Phase 5).
- Bootstrap (create org, accept invite) is the one documented exception outside the
  registry (no org-scoped actor exists yet); it writes the same audit rows.
- Auth: Sign in with Slack (OIDC; authorize → token → userInfo, state cookie), dev login
  (non-production or `DEV_LOGIN=1`). Signed session cookie bound to member + org.
  Invite links: random token shown once, SHA-256 hash stored, max uses, expiry, revoke.
- Domain (`apps/teams/src/domain/`): server-side holidays from the committed
  `public/holidays/` snapshot (traced into the deployment), falling back to Nager.Date;
  `evaluateRequest` is the single function for live validation, submit and (Phase 3)
  auto-approval: cost (engine), lowest balance from start to plan-year end, blackouts,
  coverage (new engine `leave/coverage.ts`), overlaps, retroactive limit (30 days), health
  notes.
- Balance semantics: `balance` = ledger today; `usable` = balance minus leave booked later
  this plan year (approved + pending). The UI shows usable as "Available now" and the
  year-end outlook ("you'll have 8 on Dec 31; 3 above what carries over").
- Visibility: org/team setting; names and dates only; leave type only if the org shows
  it and never for health-related types. Service agents in team-visibility orgs see nobody.
- CSV import: auto-maps Timetastic / Vacation Tracker / spreadsheet headers, preview with
  per-row errors, all-or-nothing commit in one transaction; remaining balances become an
  `import` ledger row that makes the engine's balance equal the file's number. Samples in
  `apps/teams/samples/`. CSV export neutralises spreadsheet formulas.
- Setup speed (e2e `apps/teams/e2e/walkthrough.mjs`): new owner → workspace → import 12
  people with balances, managers and teams → coverage rule = **8 clicks** (plus typing the
  org name), 5.1 s automated. Defaults: one location, one team, Vacation (20 days, carry 5),
  Sick (tracked, no balance, no notes), Personal, Unpaid.
- Tests (teams 37): tenant isolation across 18 attack inputs on every id-taking capability
  plus list reads and export (asserts the other org is unchanged, and fails if a new
  id-taking capability lacks an attack), RBAC per role, request lifecycle (holiday not
  deducted, idempotent submit, approve/decline/cancel with append-only ledger, overlaps,
  over-balance, retroactive, half days/hours, coverage warnings, sick-note minimisation,
  visibility), CSV import (auto-map, all-or-nothing, rollback mid-transaction, leave
  import), onboarding defaults, invites (use count, expiry, revoke, hashed).
- Known gaps: whoIsOut counts weekend days inside a range as "out" on the calendar grid;
  per-member location history is stored but holidays use the current location; no email.
- Gate: root 468 pass / 2 known-flaky; teams 37/37; typecheck clean; Days Off dist
  identical to main+#41; teams build OK; lint 0 errors. Screenshots:
  `docs/screenshots/smb-p2/` (signin, onboarding, import preview, setup, people,
  employee request, approvals, calendar × 1440/768/375).

## Phase 3: AI layer (`claude/smb-p3-ai`)

- One server-side AI module (`apps/teams/src/ai/`): provider interface (Anthropic SDK
  implementation + deterministic mock), per-task model map (parsing and explanations on
  `claude-haiku-5-5`, handbook import on `claude-sonnet-5-5`, overridable with
  `AI_MODEL_*`), max tokens and max input size per task, per-org daily token budget
  (`AI_ORG_DAILY_TOKEN_BUDGET`, default 200k), global `AI_MONTHLY_TOKEN_BUDGET` (default 5M;
  0 turns AI off), handbook results cached by content hash (task + prompt version + model +
  text), usage recorded per org and feature (`ai_usage`), admin page **Admin → AI usage**.
  Modes: off (default without a key; every form still works), `AI_MOCK=1` demo mode
  (labelled "Demo" in the UI, never "AI"), live. Tests always run off or mock.
- Every AI answer is validated against its schema (one retry), then re-checked by code:
  unknown leave types and reversed dates are dropped (3A), handbook quotes must be verbatim
  in the document, mention their number, sit inside sane bounds and not read like an
  instruction (3B), every number in an explanation must be an engine fact (3C). When AI is
  off, over budget or fails, the built-in rules answer instead and say so.
- 3A `parseLeaveRequestText`: one sentence fills the request form ("Say it in your own
  words" → Fill in). Never submits; asks a clarifying question when unsure.
- 3B `importHandbook` (Admin → Handbook): proposal with a quote per value, questions for
  what the handbook doesn't say, listed assumptions; Save stores the policy with its
  citations. Injection tests: a fooled model quoting the injected text cannot get 365 days
  or unlimited carry-over through; handbook text cannot close its data block.
- 3C `explainBalanceInWords` ("Why this number?" on the balance card).
- 3D auto-approval: engine-decided eligibility (type opted in, within its limit, balance
  stays ≥ 0, no coverage gap, no blackout, not retroactive, no overlap). Autonomy levels
  per org × capability × actor class: L0 off (default), L1 suggest (badge on Approvals),
  L2 approve with an undo window (default 48 h, Undo button for the manager), L3 approve.
  Audited as a service agent with the rule basis.
- 3E evals (`apps/teams/evals/`): 46 parsing cases, 6 handbooks (incl. an injection one).
  CI runs them on the mock provider (rules: 45/46, 100% fields; a regression floor, since
  the rules were written next to the cases). **One live run** on this session's Claude
  credits via the Claude Code CLI (Atiyk's instruction; no API key here): parsing **44/46**
  on Haiku 5.5 (~$0.0005 per request), handbook fields **100%** on Sonnet 5.5; ~$0.07 total.
  The first live run caught two prompt gaps (no default leave type; front-loaded accrual
  never quoted), fixed in prompt versions p2/h2. Results: `evals/results/latest.json`.
- Also fixed: the request form now refreshes balances and "My requests" after submitting;
  the engine package's own `npm test` runs in jsdom like the root (some Days Off data
  modules read browser globals).
- Gate: root 468 pass / 2 known-flaky timing tests; engine 204/206 (same 2); teams 64 pass
  (+1 live eval skipped); typecheck clean; Days Off dist identical; teams build OK; lint 0
  errors. Screenshots: `docs/screenshots/smb-p3/` (NL request, explanation, handbook,
  auto-approval setup, approvals with undo, AI usage × 1440/768/375). Before = smb-p2.

## Phase 4: team planner (`claude/smb-p4-planner`)

- Engine `packages/engine/src/leave/teamPlan.ts` (write-up and timings in
  `docs/teams/PLANNER.md`): min-cost max-flow places each person's at-risk days under every
  coverage rule (exact minimum forfeiture when rules are nested or disjoint, which covers
  "N people" + "N with tag"), with rising per-person costs so scarce days are shared evenly;
  then a deterministic local search lengthens runs off (bridges onto weekends, holidays,
  booked leave) without changing counts. Coverage is never violated, for any rule shape.
  Measured: 50 people × 60 days ~100–130 ms; with 45 of 50 required in, ~30 ms and the
  minimum forfeiture.
- Days at risk come from the projection: carried days expiring this year, else year-end
  over the carry-over limit. Hard blackouts and booked leave (approved + pending) respected.
- Capabilities: `runTeamPlan` (read, planner:run), `sendPlanProposals` (commit; drafts
  addressed to each person, no duplicates), `listMyProposals`, `respondToProposal`
  (accept submits normal leave requests through submitLeaveRequest, idempotent; dismiss).
  Plan summary from engine facts (AI with number provenance; template otherwise).
- UI: **Planner** (managers/admins): team, leave type and start date live in the URL and
  the plan recomputes on every change (no Generate button; a link reproduces the plan);
  totals, summary, per-person breaks, coverage heatmap by week (numbers + shade + stripes
  at the minimum, legible in greyscale). Members get "Suggested by your manager" on their
  home page: Accept / Change dates (prefills the request form via the URL) / Not now.
- Not done: per-person preferences have engine and API support (preferred months, dates to
  avoid) but no UI yet; half days are not planned (fractions reported as part-days).
- Gate: root 474 pass / 2 known-flaky; engine 210/212 (same 2); teams 68 pass (+1 skipped);
  typecheck clean; Days Off dist identical; teams build OK; lint 0 errors. Screenshots:
  `docs/screenshots/smb-p4/` (planner, member proposal, after accept × 1440/768/375).

## Phase 5: agents and API (`claude/smb-p5-agents`)

- **Spec and platforms re-checked 2026-10-30 (P5.0).** MCP 2026-07-28 is current: stateless
  (no `initialize`; `server/discover`), `resultType` on results, `Mcp-Method` headers, cacheable
  lists (`ttlMs`/`cacheScope`), CIMD preferred and DCR deprecated, RFC 9207 `iss` checks. Built on
  the official TypeScript SDK v2 (`@modelcontextprotocol/server` / `client` 2.4.0, legacy-stateless
  mode so 2025-era clients still connect). Platforms: Claude apps need OAuth sign-in (static request
  headers are a limited beta; no client credentials); ChatGPT accepts OAuth or none only; Copilot
  Studio takes API keys (header) or OAuth, drops `$ref` and truncates at type arrays (a test keeps
  our schemas clear of both); Agentforce takes none or client credentials only, tools only, 60 s
  timeout. Details in `docs/teams/AGENT-AUTH.md`.
- **One gateway for agents** (`src/server/agentGateway.ts`): REST bearer and MCP both go through
  `callAsAgent`: per-token rate limit, autonomy level, then R2 draft → confirm. Drafts check every
  target id against the org before they are stored (a cross-tenant id fails at once).
- **Autonomy realigned to the prompt's R6**: L0 Off, L1 Suggest, L2 Draft (person confirms), L3 Act
  within policy (undo window). Agents default to Draft, the assistant to Suggest. Auto-approval only
  at L3. Agents & API shows each agent action's level next to its eval evidence.
- **REST** `/api/v1/actions/{name}` with bearer or session cookie, `/api/v1/drafts/{id}/confirm`,
  OpenAPI 3.1 generated from the registry at `/api/v1/openapi.json`; idempotency keys on commits;
  errors carry code, message and the exact invalid field.
- **MCP** `/api/mcp` (Streamable HTTP, JSON responses): only the tools the token's scopes allow
  (≤ 25), two read-only resources (org policies, this year's holidays), `confirmAgentDraft` for
  agents acting for a person.
- **Auth Stage 1**: personal tokens (`dop_`), API keys (`dok_`), OAuth client credentials (`doc_`
  / `doa_`), `X-API-Key` accepted for Copilot Studio, last-used tracking, one-click revoke, kill
  switch, RFC 9728 / 8414 metadata. **Stage 2** (code + PKCE, CIMD, separate AS on `oidc-provider`)
  is fully designed in `docs/teams/AGENT-AUTH.md`, not built (see Q4).
- **Webhooks**: Standard Webhooks signing (verified in tests with the official `standardwebhooks`
  library), retries at 30 s, 2 min, 10 min, 1 h, 6 h, 24 h then failed; same `webhook-id` on every
  attempt; SSRF guard (https only, private ranges refused at creation and after DNS); secrets
  encrypted at rest (AES-GCM, key from `SESSION_SECRET`); delivery log, health, pause, test event,
  retry now. Events emitted in the same transaction as the change; sent after the response
  (`after()`), on the daily cron, or on retry. `balance.expiring` fires once at 30 and 7 days out.
  Payloads omit notes; health-related leave is just "out".
- **Discovery**: `/llms.txt` and `/docs/agents` (Claude Code, Claude apps, ChatGPT, Copilot Studio,
  Agentforce, with honest "works today / not yet") are generated from the registry; A2A 1.0 Agent
  Card at `/.well-known/agent-card.json` and a stub `/api/a2a`, both 404 unless `A2A_ENABLED=1`.
- **UI**: My agents (personal tokens with consent-style scope list, expiry, revoke), Admin → Agents &
  API (kill switch, autonomy per action with eval notes, API keys, OAuth clients, all tokens, webhooks,
  delivery log), "Requests from your agents" card on the home page.
- **Tests added**: 11 agent tests through the official MCP client (tool lists by scope, drafts and
  confirmation, service agent cannot commit, L3 for on-behalf agents only, cross-tenant and wrong
  scope, audit actor rows, injection text stays data, per-token rate limits, kill switch, client
  credentials, strict-client schemas), 8 webhook tests, 2 discovery tests, isolation attacks for every
  new id-taking action.

## Phase 6: quality, security and privacy (`claude/smb-p6-quality`)

- **Security** (`docs/teams/SECURITY.md`): same-origin check on cookie REST and sign-out; people
  are rate-limited per member like tokens; per-IP limits on sign-in, the token endpoint and failed
  bearer auth; CSP, frame, nosniff, referrer, permissions and HSTS headers; a daily job prunes
  rate windows, expired access tokens, old deliveries and stale drafts; isolation attacks now run
  as a person, a personal token and a service key. `npm audit --omit=dev`: 0. Logs carry error
  class names only. Known gaps and SOC 2 list are in the doc.
- **Privacy** (`docs/teams/PRIVACY.md`, marked needs legal review): `eraseMember` (anonymises,
  keeps leave dates as "Former member") and `deleteWorkspace` (owner, typed name). A test counts
  zero rows of the deleted org in every table with `org_id`, and checks the other org is untouched.
  Per-person export in the admin Data page.
- **Accessibility**: axe (WCAG 2.2 AA tags) on 14 pages at 1440 and 375: two issues found and
  fixed (muted text was 4.34:1 on weekend cells; code blocks weren't keyboard-scrollable), now 0.
  Keyboard only: request 9 + 2 + 3 Tabs, approve 8, planner 9; visible focus outline everywhere.
  The planner's date field fought keyboard typing (URL updated per segment); it now follows the
  URL after a 600 ms pause or on blur, still with no button.
- **Mobile 375px**: home, request, sent, calendar, agents (screens in `docs/screenshots/smb-p6/`);
  fixed the clipped "Fill in" button and stray separators on the calendar.
- **Timings** (local production build, PGlite, median): pages TTFB 31–67 ms; API getMyBalance 16 ms,
  whoIsOut month 11 ms, pending approvals 59 ms, runTeamPlan 62 ms, MCP tools/list 113 ms; engine
  planner 50 people × 60 days 100 ms (26 ms when coverage is tight).

## Questions for Atiyk (SMB)
- Q1. ~~main lacks the old stack~~ Resolved: you merged it. But main's build is broken by
  a merge artifact. Recommended: merge #41 first, then this stack.
- Q3. ~~No API key for the live eval~~ Resolved: ran on this session's credits via the
  Claude Code CLI (`EVAL_PROVIDER=claude-cli npm run eval:live -w apps/teams`). For
  production: set an Anthropic spend limit first, then add `ANTHROPIC_API_KEY` in Vercel.
- Q4. Per-person OAuth sign-in (Stage 2) is designed, not built. It is what makes ChatGPT and the
  Claude apps act as a person. Recommended: build it next on `oidc-provider` with CIMD on and DCR
  off unless ChatGPT needs it (decide after a live test). Your call on the dependency and on DCR.
- Q5. Webhook retries rely on the response hook and a **daily** cron (`apps/teams/vercel.json`,
  Hobby-compatible). On Vercel Pro you can make it every 5 minutes (`*/5 * * * *`) for faster
  retries. Set `CRON_SECRET` in the teams project: Vercel → teams project → Settings → Environment
  Variables → Add `CRON_SECRET` (any long random string) → Save → Redeploy.
- Q6. Webhook secrets are encrypted with a key derived from `SESSION_SECRET`; rotating that secret
  makes existing webhooks fail until re-created. Recommended: accept for the MVP; add a dedicated
  `ENCRYPTION_KEY` with rotation later.
- Q7. The A2A card is behind `A2A_ENABLED` (off) and the endpoint is a stub that points to MCP.
  Recommended: leave off until a customer asks.
- Q8. The privacy policy and DPA summary are engineering drafts marked "needs legal review", with
  bracketed blanks (entity, regions, Anthropic retention terms, transfer mechanism).
