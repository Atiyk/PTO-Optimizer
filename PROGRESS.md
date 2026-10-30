# Days Off — unattended run progress — FINAL REPORT

**Status: Phases 0-6 complete, all verified against a real live Vercel deployment (not
just localhost). Phase 7 (PWA) not attempted - explicitly lowest priority per spec
("only if time remains"), and this run's time budget was fully spent on Phases 0-6.**

## MERGED — 2026-10-29/30, with explicit user authorization to merge

All 10 PRs across both runs (phases 0-6, a hotfix, and Feature 1's A/B/C stack) are merged
into `main`, in order, via the Terminal panel. Final `main` commit: `30631e9`.

Since every PR was stacked on the previous one's branch, squash-merging + deleting each base
branch auto-CLOSED the next PR in the chain (not auto-retargeted, contrary to the original
plan) every single time. Each closed PR was recreated fresh (same branch content, rebased
onto `main` with `git rebase -X ours origin/main`, force-pushed, re-opened as a new PR
targeting `main` directly) rather than fought via GitHub's reopen/retarget API, which refuses
to reopen a PR whose base branch no longer exists. New PR numbers: #31 (was #22), #33 (was
#23), #35 (was #24), #36 (was #25), #37 (was #26), #38 (was #27), #42 (was #28), #43 (was
#29), #44 (was #30). PRs #21, #29(orig-B stays #29→closed/rebuilt), #40 are the ones that
merged under their original or a hotfix number - see the PR list above for exact mapping.

Two real problems found and fixed before continuing the chain (not merged broken):
1. **Duplicate `firstOfMonth`** in `sabbaticalData.ts` (three phase branches independently
   added the same helper at different insertion points - no textual conflict, so three
   silent duplicates). Fixed in PR #40.
2. **`/policy` and `/glossary` silently dropped** from `vite.config.ts`/`scripts/routes.ts`/
   `scripts/prerender.ts` when Feature 1's PR-C was rebased onto a `main` that now also had
   run-1 Phase 6's own additions to those same files - `-X ours` conflict resolution kept
   Phase 6's side wherever both sides touched a file, even on non-conflicting-but-related
   hunks. Caught by actually running `npm run build` locally before merging (not trusting a
   clean `git rebase`), fixed in PR #44's own final commit before merging it.

Final verification on merged `main`: `npm test -- --run` 488/490 passed (the two known K9
timing-flake tests, nothing else - confirmed clean of both merge-artifact bugs above).
`npx tsc --noEmit` clean. `npm run build` clean - 42 routes built and prerendered.

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

## SMB MVP: FINAL REPORT (2026-10-30)

All nine phases (0–8) are built, tested and up as draft PRs. Nothing was merged, nothing was pushed to `main`, no branch was deleted or force-pushed, no Vercel, Slack, Anthropic or DNS setting was changed, and no secrets were committed. Every step that needs you is a click-path below.

### 1. PRs in merge order
Every Vercel preview below is **Ready**. They are previews of the **Days Off** project, so they show that Days Off still builds and deploys on each branch. The team app has no Vercel project yet (setup step 2), so it has no preview URL of its own. You can run it locally with `npm run dev -w @daysoff/teams`.

| Order | PR | Branch → base | Preview |
|---|---|---|---|
| 0 | #41 Fix main build (duplicate `firstOfMonth`) | → `main` | **Close it, don't merge.** `main` now builds on its own: I built it in a clean checkout today and it has one `firstOfMonth` |
| 1 | #34 Phase 0: monorepo and shared engine | `claude/smb-p0-monorepo` → `main` | https://pto-optimizer-git-claude-smb-p0-monorepo-atiyk-a.vercel.app |
| 2 | #39 Phase 1: spec and domain model | `…p1-spec` → p0 | https://pto-optimizer-git-claude-smb-p1-spec-atiyk-a.vercel.app |
| 3 | #45 Phase 2: core web product | `…p2-core` → p1 | https://pto-optimizer-git-claude-smb-p2-core-atiyk-a.vercel.app |
| 4 | #47 Phase 3: AI layer | `…p3-ai` → p2 | https://pto-optimizer-git-claude-smb-p3-ai-atiyk-a.vercel.app |
| 5 | #48 Phase 4: team planner | `…p4-planner` → p3 | https://pto-optimizer-git-claude-smb-p4-planner-atiyk-a.vercel.app |
| 6 | #49 Phase 5: agents and API | `…p5-agents` → p4 | https://pto-optimizer-git-claude-smb-p5-agents-atiyk-a.vercel.app |
| 7 | #50 Phase 6: quality, security, privacy | `…p6-quality` → p5 | https://pto-optimizer-git-claude-smb-p6-quality-atiyk-a.vercel.app |
| 8 | #51 Phase 7: Slack app | `…p7-slack` → p6 | https://pto-optimizer-git-claude-smb-p7-slack-atiyk-a.vercel.app |
| 9 | #52 Phase 8: landing, demo, acceptance | `…p8-launch` → p7 | https://pto-optimizer-git-claude-smb-p8-launch-atiyk-a.vercel.app |
| any | #53 Days Off footer link (off until `TEAMS_URL` is set) | `claude/smb-daysoff-link` → `main` | https://pto-optimizer-git-claude-smb-daysoff-link-atiyk-a.vercel.app |

**How to merge the stack.** Merge #34 into `main`. If GitHub doesn't move #39's base to `main` automatically (it does when "Automatically delete head branches" is on), change it: PR → **Edit** next to the title → base: `main`. Repeat up the stack. Use merge commits rather than squash, because the later branches contain the earlier commits.

### 2. What changed, broke or surprised
- **`main` moved during the run.** You merged the old phase 1–6 stack while Phase 1 was in progress. I merged the new `main` into the Phase 0 branch (no force-push). For a while `main` didn't build (#41); it builds again now.
- **Days Off's dist never changed.** After every phase, `scripts/verify-days-off-dist.sh` found the build identical to the `main` baseline: 652 files, with the build timestamp normalised. The last check was on the Phase 8 branch today. The one deliberate Days Off change is #53, kept separate.
- **The acceptance run found three bugs, all fixed in #52:**
  - The no-AI date reader turned "next Friday and Monday off" into a request ending a year later.
  - An injected "unlimited vacation" line knocked the real 20-day allowance out of the no-AI handbook reader. It was never obeyed, but it removed a value.
  - Auto-approval reasons said "1 days".
- **The rules parser out-scores the model on our own eval set.** Rules got 45/46 and Haiku 44/46. The cases were written alongside the rules, so treat that as overfitting, not proof the rules are better. Real traffic needs the model; next, collect real phrasings for the eval set.
- **Plans are deterministic per org.** The planner breaks ties by member id. Two freshly seeded copies of the demo org get different ids, so their plans can differ slightly. One persistent demo org always shows the same plan.
- **Things that bit me during the build, all fixed:** two in-process PGlite databases when route handlers and pages each opened one (now one per process), a planner date field that rewrote the URL on every keystroke, and contrast and focus issues found by axe (28 scans, 0 violations now).
- **The sandbox had no Slack app, Anthropic key or Vercel access.** So Slack is tested against Slack-shaped fixtures only, and the AI ran on this session's Claude credits through the Claude Code CLI, as you asked on 2026-10-30.

### 3. Acceptance A1–A12
All 12 pass. The full table, with test names and screens, is in `docs/teams/ACCEPTANCE.md`.

| A1 | A2 | A3 | A4 | A5 | A6 | A7 | A8 | A9 | A10 | A11 | A12 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Pass (8 clicks, 5.1 s) | Pass | Pass after fix | Pass | Pass (41/41 placed) | Pass | Pass | Pass with fixtures; **not run live** (no Slack app yet) | Pass | Pass | Pass | Pass |

### 4. Days Off dist proof
`npm run verify:dist` on `claude/smb-p8-launch`: "Days Off dist/ is identical to the baseline (652 files; build timestamp normalised)." The same check passed at the gate of every phase (see each PR). For #53, the Footer chunk and the 4 chunks that import it get new hashes, which is expected. While `TEAMS_URL` is unset the page renders identically (0 links counted in the DOM).

### 5. AI evals and spend
| Capability | Model | Result | Tokens in / out | Cost |
|---|---|---|---|---|
| Parse a request in words (`parseLeaveRequestText`) | claude-haiku-5-5 | 44/46 (95.7%); misses: "Off on Nov 20 and Nov 23", "this week" | 57,796 / 31,795 | $0.0217 |
| Parse a request in words | built-in rules (no AI, CI) | 45/46 | – | – |
| Read a handbook (`importHandbook`) | claude-sonnet-5-5 | 6/6 handbooks, 100% of fields | 12 / 4,649 (the CLI reports cached input as ~0) | $0.0465 |
| Read a handbook | built-in rules (no AI, CI) | 6/6, 100% of fields | – | – |
| Demo handbook fixture (one live read) | claude-sonnet-5-5 | Injection ignored and flagged; 5 questions | 5,955 / 798 | $0.0199 |
| Explain a balance, summarise a plan | claude-haiku-5-5 | Not separately evaluated. Every number is checked against engine facts, and the template replaces any reply that invents one (tested) | – | – |

**Run total: 63,763 input and 37,242 output tokens, about $0.09 at API prices.** It ran on this session's Claude credits, so nothing was billed to an Anthropic API account.

**Production guardrails:**
- `AI_ORG_DAILY_TOKEN_BUDGET` (default 200k tokens per org per day) and `AI_MONTHLY_TOKEN_BUDGET` (default 5M) switch AI off gracefully when reached.
- Handbook reads are cached by content hash.
- The public demo is capped by its org's daily budget and 10 reads a minute per IP. Worst case is roughly 30 fresh Sonnet handbook reads a day, about $0.60.

### 6. Capability catalog
Agents start at **L2 Draft**: a person confirms in the app. The approval assistant starts at **L1 Suggest**. Admins can change either per action (Admin → Agents & API). Service agents (API keys, OAuth clients) can never hold `admin` or `leave:approve`, and can only draft for a named member.

| Capability | Surfaces | Scope | Roles | Effect | Default autonomy |
|---|---|---|---|---|---|
| getMyBalance | ui, rest, mcp, slack, assistant | leave:read | any member | read | n/a (read) |
| explainBalance | ui, rest, mcp, slack, assistant | leave:read | any member | read | n/a (read) |
| draftLeaveRequest | ui, rest, mcp, slack, assistant | leave:request | any member | draft | Never saves (a person acts on the result) |
| submitLeaveRequest | ui, rest, mcp, slack, assistant | leave:request | any member | commit | Agents: L2 Draft |
| cancelLeaveRequest | ui, rest, mcp, slack, assistant | leave:request | any member | commit | Agents: L2 Draft |
| listMyRequests | ui, rest, mcp, slack, assistant | leave:read | any member | read | n/a (read) |
| whoIsOut | ui, rest, mcp, slack, assistant | leave:read | any member | read | n/a (read) |
| listHolidays | ui, rest, mcp, assistant | leave:read | any member | read | n/a (read) |
| listPendingApprovals | ui, rest, mcp, slack, assistant | leave:approve | owner, admin, manager | read | n/a (read) |
| decideLeaveRequest | ui, rest, mcp, slack, assistant | leave:approve | owner, admin, manager | commit | Agents: L2 Draft; assistant: L1 Suggest |
| getOrgSetup | ui, rest | policy:read | any member | read | n/a (read) |
| manageOrgSetup | ui, rest | admin | owner, admin | commit | People only |
| listMembers | ui, rest | admin | owner, admin | read | n/a (read) |
| manageMembers | ui, rest | admin | owner, admin | commit | People only |
| adjustBalance | ui, rest | admin | owner, admin | commit | People only |
| exportData | ui, rest | admin | owner, admin | read | n/a (read) |
| getAuditLog | ui, rest | admin | owner, admin | read | n/a (read) |
| importCsv | ui, rest | admin | owner, admin | commit | People only |
| parseLeaveRequestText | ui, rest, mcp, slack, assistant | leave:request | any member | draft | Never saves (a person acts on the result) |
| importHandbook | ui, rest, mcp, assistant | policy:draft | owner, admin | draft | Never saves (a person acts on the result) |
| explainBalanceInWords | ui, rest, mcp, slack, assistant | leave:read | any member | read | n/a (read) |
| getAiUsage | ui, rest | admin | owner, admin | read | n/a (read) |
| runTeamPlan | ui, rest, mcp, assistant | planner:run | owner, admin, manager | read | n/a (read) |
| sendPlanProposals | ui, rest, mcp, assistant | planner:run | owner, admin, manager | commit | Agents: L2 Draft |
| listMyProposals | ui, rest, mcp, slack, assistant | leave:read | any member | read | n/a (read) |
| respondToProposal | ui, rest, mcp, slack, assistant | leave:request | any member | commit | Agents: L2 Draft |
| managePersonalTokens | ui | leave:read | any member | commit | People only |
| manageAgentAccess | ui | admin | owner, admin | commit | People only |
| manageWebhooks | ui | admin | owner, admin | commit | People only |
| eraseMember | ui | admin | owner, admin | commit | People only |
| deleteWorkspace | ui | admin | owner | commit | People only |
| manageSlack | ui | leave:read | any member | commit | People only |
| getSlackConnection | ui | leave:read | any member | read | n/a (read) |
| listAgentDrafts | ui | leave:read | any member | read | n/a (read) |
| decideAgentDraft | ui | leave:read | any member | commit | People only |

### 7. Agent connections by platform
None of these were tried live: the app isn't deployed, and these are your accounts. The status comes from each platform's current documentation and our tests against the MCP spec (2026-07-28) and the strictest schema rules (no `$ref`, no type arrays). The setup guide for each is at `/docs/agents`.

| Platform | How it connects today | Status |
|---|---|---|
| Salesforce Agentforce | Setup → Agentforce Registry → New, with OAuth 2.0 client credentials (our OAuth client, `/api/oauth/token`) | **Works today**, as a service agent: reads, the planner, and drafts for a named member |
| Microsoft Copilot Studio | MCP with an API key (header) or a personal token | **Works today** |
| Claude (Claude Code) | MCP with a personal token in a header | **Works today** |
| Claude apps (claude.ai, Desktop, Cowork) | Need OAuth (CIMD or DCR); static headers are in beta for some orgs only | **Partly**: works through headers where that beta is on. Full support needs per-person OAuth (Q4, designed in `docs/teams/AGENT-AUTH.md`, not built) |
| ChatGPT (developer mode / apps) | OAuth or no auth; no API keys | **Not yet**. Needs per-person OAuth (Q4) |
| Slackbot (Slack's MCP client) | Streamable HTTP; Slack identity or OAuth | **Not yet** live. Our own Slack app covers requests, approvals, who's out and status (fixture-tested). Recommendation: keep both, and add MCP for Slackbot after Q4 |
| A2A | Agent card at `/.well-known/agent-card.json` | **Off** (`A2A_ENABLED`), stub only (Q7) |

### 8. Security and privacy
**In place:**
- Tenant isolation is tested against every id-taking capability, as a person, a personal token and a service key, and a test fails if a new capability skips it.
- One capability layer with scope and role checks and an audit row for every change.
- Hashed credentials and a kill switch for all agent access.
- Rate limits per member, per token and per IP.
- CSRF checks, CSP and security headers.
- Signed webhooks with SSRF checks.
- Health-related leave is never a reason, and webhooks and Slack show it only as "out".
- Export and erasure for one person, and whole-workspace deletion (tested to leave 0 rows).
- The demo can't be signed into in production.
- Details: `docs/teams/SECURITY.md` and `docs/teams/PRIVACY.md`.

**Gaps, in priority order:**
1. **The privacy policy and DPA summary are engineering drafts** with blanks: entity, regions, Anthropic retention terms, transfers. Get legal review before taking a customer.
2. **Sessions can't be revoked** short of rotating `SESSION_SECRET`.
3. **Webhook secrets use a key derived from `SESSION_SECRET`**, not a dedicated `ENCRYPTION_KEY`.
4. **A DNS-rebinding window on webhooks**: the checked IP isn't pinned.
5. **The CSP allows inline scripts** (no nonces yet).
6. **No per-person OAuth for agents** (Q4).
7. **No MFA or SSO beyond Slack's.**
8. **SOC 2 groundwork hasn't started**: policies, monitoring, a tested restore, Dependabot and secret scanning.

### 9. Setup checklist (click-paths)
1. **Neon database.** console.neon.tech → **New project** (pick the region closest to your Vercel region) → open the project → **Connect** → keep **Connection pooling** on → copy the string (its host contains `-pooler`). That's `DATABASE_URL`. Then, on your machine: `DATABASE_URL='…' npm run db:migrate -w @daysoff/teams` and, optionally, `DATABASE_URL='…' npm run seed:demo -w @daysoff/teams`.
2. **Vercel project for the team app.** Vercel dashboard → **Add New… → Project** → import `Atiyk/PTO-Optimizer` → **Root Directory → Edit → `apps/teams`** → Framework: Next.js → leave Install and Build at their defaults → **Deploy**. Leave the existing Days Off project as it is (root `/`). Vercel skips projects a commit doesn't touch, because the repo uses npm workspaces.
3. **Environment variables.** Teams project → **Settings → Environment Variables** → add these for Production (and Preview where noted), then **Deployments → Redeploy**:
   - `DATABASE_URL` from step 1. A Neon branch per preview is optional.
   - `SESSION_SECRET`: a long random string, for example `openssl rand -base64 48`. Rotating it signs everyone out and breaks webhook secrets (Q6).
   - `APP_URL`: the production URL, for example `https://teams.yourdomain.com`.
   - `CRON_SECRET`: a long random string, used by the daily cron in `apps/teams/vercel.json`.
   - `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET` from step 4.
   - `ANTHROPIC_API_KEY`: **only after step 6.** Without it, every AI feature falls back to the rules and says so.
   - Optional: `AI_ORG_DAILY_TOKEN_BUDGET` and `AI_MONTHLY_TOKEN_BUDGET`.
   - Never set `DEV_LOGIN` or `ALLOW_PGLITE` in production.
4. **Slack app.** https://api.slack.com/apps → **Create New App → From a manifest** → your workspace → paste `apps/teams/slack/manifest.yml` with `YOUR-TEAMS-DOMAIN` replaced → **Create** → **Basic Information** → copy the Client ID, Client Secret and Signing Secret into step 3.
5. **Slack redirect URLs.** These are in the manifest; check them under **OAuth & Permissions → Redirect URLs**: `https://<teams-domain>/api/slack/oauth` (Add to Slack) and `https://<teams-domain>/api/auth/slack/callback` (Sign in with Slack). Then **Event Subscriptions** should show the request URL as Verified. Smoke test: `/daysoff help`, then `/daysoff Friday afternoon off` → Request → approve from the manager's DM.
6. **Anthropic monthly spend limit, before adding the key.** platform.claude.com → your organization name (bottom left) → **Organization settings → Billing → Spend limits → Set limit** (or **Adjust limit**) → for example $20 → **Update limit**. Better: create a separate workspace for this app, give it a lower limit under **Manage → Spend limits**, and create the API key in that workspace.
7. **Vercel Pro before you charge anyone.** Vercel's Hobby plan is for "non-commercial, personal use only". Dashboard → **Settings → Billing → Plan → Upgrade** ($20 per developer seat per month). Pro also allows the faster cron schedule (Q5).
8. **Domain.** Add the teams domain under Teams project → **Settings → Domains**. Then set `APP_URL`, set the Slack manifest URLs, and set `TEAMS_URL` in `src/ui/Footer.tsx` (#53).

### 10. Questions for Atiyk, with recommendations
- **Product name (Q10).** It's the `PRODUCT_NAME` placeholder, "Days Off for Teams" (`apps/teams/src/lib/brand.ts`). *Recommendation:* launch under it. It borrows Days Off's search traffic and trust, and the link in #53 reads naturally. Rename only if the domain or trademark isn't available, or if you want the two products clearly apart. It's one constant either way.
- **Pricing against the $1.20–$4 per user incumbents (Q11).** AI costs per user are tiny: a parsed request costs about $0.0005 on Haiku, and handbook reads are one-off and cached. Fixed costs are a Vercel Pro seat ($20 a month) plus Neon once past the free tier. *Recommendation:* **$3 per user per month, $2.50 billed yearly, free for up to 5 people**, with AI included under the fair-use budgets. That's mid-market against Timetastic-style tools while selling planning and AI they don't have. Don't go below $2: about 15 paying users then covers the fixed costs. Validate with 3 to 5 design partners before publishing prices.
- **Moving Days Off into `apps/` (Q12).** *Recommendation:* not yet. It would change the live Days Off project's root directory and build for no user-facing gain. Revisit when a third app arrives or the root workspace becomes a nuisance. The engine is already shared through `packages/engine`.
- **When to add Microsoft Teams (Q13).** *Recommendation:* after Slack is live and at least 2 real prospects say they're Teams-only. Copilot Studio already reaches Microsoft users through MCP. A Teams app needs a Bot Framework app, Entra ID sign-in and Adaptive Cards for approvals. It can reuse the same capability layer, like the Slack adapter.
- **The Days Off link needs the teams URL (Q14).** Set `TEAMS_URL` in `src/ui/Footer.tsx` (#53) once the domain exists. Until then the link stays hidden instead of guessing.
- Still open from earlier phases: Q4 (per-person OAuth), Q5 (`CRON_SECRET`), Q6 (encryption key), Q7 (A2A off), Q8 (legal review), Q9 (Slack app). Details are under "Questions for Atiyk (SMB)" below.


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

## Phase 7: Slack app (`claude/smb-p7-slack`)

- **Manifest** `apps/teams/slack/manifest.yml` (schema v2: `/daysoff`, interactivity, `message.im`,
  `app_uninstalled`, `tokens_revoked`, bot + user scopes) and click-path in `apps/teams/slack/README.md`.
- **Routes** `/api/slack/{commands,interactivity,events,install,oauth}`: signature checked first
  (HMAC v0, 5-minute window, constant-time compare); ack immediately (7 ms measured locally) and do
  the work after the response with `next/server` `after()` (Vercel `waitUntil`); events deduped by
  `event_id`, clicks by message + action, and requests carry an idempotency key.
- **Thin adapter**: requests in words go through `parseLeaveRequestText` → engine evaluation →
  confirm message (uses N days, leaves M, holidays not deducted, warnings) → `submitLeaveRequest`.
  Approvals are DMed to the manager with the same impact facts as the web queue
  (`listPendingApprovals`) and decided with `decideLeaveRequest`; the person is told the outcome.
  `/daysoff who` / `who week`: one line per team, names and dates only. `/daysoff balance`.
- **Linking**: Slack user id saved at Sign in with Slack, else matched once by work email
  (`users.info`). People act as humans with client `slack` in the audit log and the web's limits.
- **Status (optional)**: each person allows it under My agents; generic "Out of office until …",
  "Out this afternoon", "Out for 3 h today", expiring by itself; set on approval and daily.
- **Slackbot + MCP**: Slack's Slackbot MCP client (Streamable HTTP, 60 s, per-call allow prompts,
  "Slack identity" auth) could cover questions and drafting through our MCP server, not push
  approvals or status. Recommendation: keep both (in the README and PR).
- **Tests**: 8 tests against payloads in Slack's documented shapes (`slack/fixtures/`). No Slack
  secrets were available, so no live workspace smoke test; the live routes were smoke-tested
  locally with a signed URL check, a forged signature (401) and a signed command (200 in 7 ms).

## Phase 8: launch (`claude/smb-p8-launch`, plus `claude/smb-daysoff-link`)

- **`/demo`**: Northwind Labs, a made-up 25-person org (San Francisco and London), seeded once (`organizations.is_demo`, agent access off). (1) Read the sample handbook: live AI; else a stored real-model result for the sample text, labelled as such; else the rules, labelled. (2) The Engineering manager's real plan with its heatmap. Nothing a visitor does is saved (tested). `POST /api/demo/handbook`: same-origin, 10 a minute per IP, 20k characters max, the org's daily AI budget.
- **Landing `/`**: honest copy, no imagery or social proof, "Try the demo", "Sign in with Slack". A shared public header.
- **Scripts**: `npm run db:migrate -w @daysoff/teams` (Neon) and `npm run seed:demo -w @daysoff/teams` (idempotent; checked twice on PGlite).
- **Acceptance A1–A12**: `src/acceptance.test.ts` plus the Slack and agent tests; map in `docs/teams/ACCEPTANCE.md`. Three bugs found and fixed (no-AI date reader, no-AI handbook reader vs an injected line, "1 days").
- **Days Off link (#53)**: one footer link, hidden until `TEAMS_URL` is set.
- Gate: teams 125 pass / 2 skipped; root 474 pass / 2 known-flaky; engine 211 / 1 known-flaky; typecheck clean; teams build OK; lint 0 errors; Days Off dist identical (652 files).

## Questions for Atiyk (SMB)
- Q1. ~~main lacks the old stack~~ Resolved: you merged it. ~~main's build is broken~~ Resolved:
  main builds again on its own (checked 2026-10-30), so #41 is no longer needed. Recommended: close #41.
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
- Q9. Slack: create the app from `apps/teams/slack/manifest.yml` and add the three Slack env vars
  (click-path in `apps/teams/slack/README.md`), then run the live smoke test: `/daysoff help`,
  `/daysoff Friday afternoon off` → Request, approve from the manager DM.
- Q10–Q14 (product name, pricing, moving Days Off into `apps/`, Microsoft Teams timing, the
  teams URL for the Days Off link): see the final report at the top of this section.

---

# Feature 1 — "Your time-off policy, in plain English"

Separate run, started 2026-10-29. RUN MODE per this file's own CLAUDE.md "Unattended runs"
section (never merge/push-to-main/delete branches/force-push; conservative choices logged
here under this section's own "Questions for Atiyk"). Re-read this section first if resumed.

**PR-A**: [#28](https://github.com/Atiyk/PTO-Optimizer/pull/28) (draft, base
`phase-2-holiday-data`). **PR-B**: [#29](https://github.com/Atiyk/PTO-Optimizer/pull/29)
(draft, base `feature1-a-foundation`). PR-C not yet opened — Stage 5/6 not started.

## Base branch decision

Run 1's PRs (#21–#27, phases 0–6) are **not yet merged** to `main` as of this run's start —
confirmed via `git merge-base --is-ancestor main phase-2-holiday-data` and `gh pr view`.
Per the run prompt's own instruction ("If run 1 isn't fully merged, A's base is the highest
run-1 branch that has the holiday data and SITE_URL work"), **PR-A's base is
`phase-2-holiday-data`** — it carries phase 0's baseline work, phase 1's SITE_URL/domain
work, and phase 2's holiday-data foundation, stacked in that order. Phases 3–6 (sabbatical
correctness/UX, landing rebuild, hygiene) are intentionally NOT in this feature's base, so
this work doesn't depend on unmerged, unreviewed later-phase code.

## Feature 1 status

| Stage | Status | Notes |
|---|---|---|
| 0 — Preflight | done | baseline recorded below |
| 1 — Research & spec | done | `docs/specs/feature1-time-off-policy.md`, committed first |
| 2A — Shared policy model | done | `src/policy/model.ts` |
| 2A follow-through — /pto rewired onto it | done (PR-B) | `src/ui/useAppState.ts` now routes accrual/expiry/carryover through the shared model; `src/ui/pto-policy-regression.test.ts` is the safety net |
| 2B — Projection | done | `src/policy/projection.ts` |
| 2C — Tests (hand-verified) | done | see PR-A's own section below for exact coverage |
| 2D — Vocabulary standard | done | `docs/VOCABULARY.md`, `src/content/vocabulary.ts` + lint test |
| 3 — Glossary system | done (PR-B) | 29 terms, `<Term>`, `/glossary` + 29 real term pages, readability-checked |
| 4 — /policy tool | done (PR-B), with real gaps — see below | `src/ui/Policy.tsx` |
| 5 — Plain-language pass (PR-C) | **not started** | deferred |
| 6 — Quality pass (PR-C) | **not started** | deferred |

PR-A (Stages 0–2) and PR-B (Stage 2A follow-through, Stages 3–4) are both complete and
pushed. PR-C (Stage 5 site-wide plain-language audit/nav/landing section, Stage 6 quality
pass) has not been started — see "Continuing this run" under Questions for Atiyk.

## PR-B — Stage 2A follow-through: /pto rewired onto the shared policy model

The coordinator explicitly asked for this to be done now rather than deferred (PR-A had
flagged it as a decision for Atiyk). Done carefully, with a dedicated regression test
written first as the safety net (see `src/ui/pto-policy-regression.test.ts`).

**What changed**: `useAppState.ts`'s `solveInput` construction used to compute
`accrualPerMonth`/`expiryDate`/`carryoverCap` with its own inline ternaries. It now builds
a `TimeOffPolicy` via `policyFromLegacyPtoState()` and reads the same three fields through
`toLegacySolverFields()`.

**A real bug found and fixed while doing this carefully**: `toLegacySolverFields()` (as
written in PR-A) always derived `budget` from the accrual amount (`amount * periods/year`),
silently discarding any explicit `accrualCap`. /pto's own `budget` and `accrualPerMonth`
are independently configurable — `budget` acts as a CAP the balance accrues toward, not a
value accrual must exactly reach (a user can set `accrualPerMonth=1.25` with `budget=20`
even though `1.25*12=15` — the extra headroom is real, e.g. a starting balance higher than
a year of accrual alone would reach). Routing /pto through the original function would have
silently changed behavior for any link where `accrualPerMonth * 12 != budget`. Fixed by
having `accrualCap` win over the derived figure when it's set. `src/ui/
pto-policy-regression.test.ts` specifically includes a case for exactly this mismatch.

**Verification**: the dedicated regression test (old ternary logic vs. the new path, across
every `ac`/`am`/`ex`/`xd`/`cc` combination, plus one full `solve()` end-to-end comparison)
passes. The entire pre-existing `solve.test.ts` suite — which already exercises many
/pto-shaped inputs — also passed unchanged, which corroborates the dedicated test rather
than relying on it alone.

## PR-B — Stage 3: the glossary system

- `src/content/glossary/terms.ts`: 29 terms from the run prompt's own list (28 of the 30
  listed, with "observed holiday" folded into "company holiday" as a documented alias
  rather than kept separate — the run prompt's own earlier VOCABULARY.md work already
  treated them as the same concept; `aliases` was not separately given its own term.
  Actually 30 named minus 1 consolidation = 29 — confirmed by the generator script's own
  output count).
- **Readability (Stage 3D), the real finding**: the first draft of every `long` field used
  longer, comma-joined sentences and failed `src/content/readability.test.ts`'s grade-10
  ceiling almost across the board (most fields scored 10–19). Rewrote every `short`/`long`
  field in short, simple sentences. Final measured distribution: **average grade 5.5,
  maximum grade 9.7, 0 fields above grade 10 (hard fail threshold), 6 fields above grade 8
  (soft warn threshold — acceptable per spec, which only requires flagging, not zero)**.
  This is a real number from `src/content/readability.ts`'s Flesch-Kincaid scorer run
  against the actual committed copy, not an estimate.
- `src/ui/Term.tsx`: hover/focus/tap/Escape-dismissible popover, `tabIndex=0`, a real
  `aria-label`. Tested in `src/ui/Term.test.tsx` — **this is the first component-level
  (DOM-rendering) test in this repository**; added `@testing-library/react` and
  `@testing-library/dom` as devDependencies to write it (flagged under Questions for
  Atiyk — a new dependency, even a devDependency, in an unattended run).
- `/glossary` (`src/ui/Glossary.tsx`): alphabetically grouped (29 terms don't cluster
  neatly into topics), live search, no submit button.
- `/glossary/<id>` (`src/ui/GlossaryTermPage.tsx`): long definition, a small interactive-
  ish mini example for the 3 terms it genuinely clarifies (`accrual-cap`, `carryover`,
  `bridge-day` — not all 29, since most are better served by the plain-English definition
  alone), related terms, the Ask HR question, a hand-off link into `/policy`.
- **29 real static routes**, not a client-side-routed single page: `glossary/<id>/index.html`
  generated by `scripts/generate-glossary-html.ts` and committed (same pattern as the
  country routes, `uk/index.html` etc.) rather than built on every `npm run build`. Run that
  script again and commit the result after editing `terms.ts`. `vite.config.ts` and
  `scripts/routes.ts` both read the term list from the same `terms.ts` array, so a missing
  generated file fails the build loudly (confirmed: this is exactly how a forgotten
  regeneration would surface).
- `DefinedTermSet`/`DefinedTerm` JSON-LD added to `scripts/prerender.ts`, built from the
  same `GLOSSARY_TERMS` array the visible pages render.
- Verified live (not just via curl): `/policy/` and `/glossary/accrual-cap/` screenshots in
  `docs/screenshots/feature1/` at 1440 and 375px — rendered correctly, no console errors
  beyond the pre-existing, unrelated Vercel Analytics 404 (no `/insights` endpoint when
  running locally — present on every route already, not introduced here).

## PR-B — Stage 4: the /policy tool

`src/ui/Policy.tsx`, plus `src/policy/summary.ts` (plain-English summary generation),
`src/policy/alerts.ts` (ranked alerts + /pto hand-off URLs), `src/policy/hrQuestions.ts`,
`src/policy/decode.ts` ("decode a paragraph").

**The /pto hand-off deadline bug, found and fixed**: a forfeiture/carried-days-expiring
event's own date IS the date the days are already gone — so the /pto hand-off's "range
ending" must be the day BEFORE that event, not the event's own date, or /pto would plan a
day that's already too late to use. Fixed in `alerts.ts` with `addDays(event.date, -1)`.
Verified against S1's exact numbers: a Jan 1 reset produces a hand-off ending Dec 31, not
Jan 1.

**The paragraph-matching whitespace bug, found and fixed**: a phrase wrapped across a line
break in pasted text ("waiting\nperiod") did not match the glossary term "waiting period"
until whitespace characters were normalized to spaces WITHOUT changing the text's length
(so character offsets into the original text — used for highlighting — stay aligned).
Real handbook text pasted from a PDF or email very plausibly wraps mid-phrase, so this
was worth fixing rather than narrowing the test to avoid it.

**All 7 acceptance scenarios (S1–S7) are real tests** against this engine
(`src/policy/acceptance.test.ts`), not just manually eyeballed in the browser — including
S1's exact numbers from the run prompt (7 days forfeited, hand-off budget 7, range ending
Dec 31).

**Real gaps in this delivery, not hidden**:
- **No URL round-trip for /policy's own inputs** (the CLAUDE.md rule, and Stage 4B's own
  explicit instruction). Every input on `/policy` is local React state only today — a
  /policy link does not reproduce the described policy. This is the single largest gap
  in PR-B. Scoped out for time; see Questions for Atiyk for the recommendation.
- **No exports on /policy** (.ics of alert dates, copy-as-image, copy-link — Stage 4D).
  Only "copy questions" (the HR-questions text) is implemented.
- **Analytics events exist but aren't fully wired everywhere they could be** —
  `term_opened`, `paragraph_decoded`, `policy_alert_action_clicked`, and
  `policy_questions_copied` all fire from real interactions; `policy_tool_used` only fires
  from the glossary-term page's hand-off link today, not from loading `/policy` itself.
- Pro-rating a mid-year start (flagged already in PR-A) is still unaddressed.
- The nav links to `/policy`/`/glossary` were added to `SiteHeader.tsx` as plain additions
  to the existing flat row, NOT yet grouped into "Plan"/"Understand" sections — that's
  Stage 5C's explicit job in PR-C.

## Stage 0 — Preflight

- Current branch state confirmed clean on `phase-2-holiday-data` before branching.
- Baseline (on `phase-2-holiday-data`, before any Feature 1 code): `npm test -- --run` →
  **406 passed, 2 failed** (both are the known K9 timing flakes:
  `solve.test.ts`'s 5s-timeout test and its `<1000ms` perf-budget test — same as Phase 0's
  own recorded baseline). `npx tsc --noEmit` clean. `npm run build` clean.
- "Before" screenshot: `docs/screenshots/feature1/before-landing-1440.jpg` (the landing
  page at 1440px, unchanged by this PR — confirms the baseline visual state). Since PR-A
  adds no UI at all, a full 1440/768/375 sweep of every route was not repeated here; it
  will be captured for real in PR-B/PR-C, where the UI actually changes.

## Stage 1 — Spec

`docs/specs/feature1-time-off-policy.md`, committed before any code (commit `8f0c800`).
Covers: the jobs this feature does, today's /pto policy model read from the actual code
(not reconstructed from memory — `urlState.ts`/`useAppState.ts`/`solve.ts` were read
directly), the richer shared policy model and its backward-compatible mapping onto /pto's
existing params, the /policy page layout (mobile first, ASCII), edge cases, explicit scope
(in: one vacation/PTO bank; out: sick leave, jurisdiction-specific legal rules, pay/benefits,
free-text interpretation beyond literal term matching), the test plan, and copy rules.

`docs/VOCABULARY.md`: one chosen word per time-off concept, with banned alternatives that
become glossary aliases (Stage 3) rather than appearing in our own UI copy.

## Stage 2 — Policy engine

**2A — `src/policy/model.ts`**: `TimeOffPolicy` (unit, accrual method, plan year, accrual
cap, carryover rule, waiting period, negative-balance allowance, payout-on-leaving,
current balance/as-of, planned days), plus `resetDatesInRange`, `payDatesInRange`,
`waitingPeriodEnd`, and `toLegacySolverFields` — the explicit mapping from the new model
onto exactly the fields `solve.ts`'s `SolveInput` already understands (`budget`,
`accrualPerMonth`, `expiryDate`, `carryoverCap`), verified against `solve.ts`'s own
`accruedBy` formula (a biweekly per-pay-period policy of `15/26` days every period maps to
`accrualPerMonth = 1.25`, matching `urlState.ts`'s own existing default exactly — not a
coincidence, it's the same number for the same policy).

**/pto itself does not yet consume this model** — `useAppState.ts` and `urlState.ts` are
unmodified in this PR. The spec (section 2.2) documents the intended field-by-field mapping
and which /pto URL params each new policy field would extend, but actually rewiring
`useAppState.ts` to read from `TimeOffPolicy` carries real regression risk to the solver
that already ships in production, and doing it without a human reviewing the diff first
felt like the wrong tradeoff for an unattended run. **This is the single largest scope cut
in this delivery** — see "Questions for Atiyk" below.

**2B — `src/policy/projection.ts`**: `projectBalance(policy, horizonEnd)` walks day by day
from `balanceAsOf`, emitting `accrual-credited`, `cap-reached`, `reset`,
`carryover-applied`, `forfeited`, `carried-days-expiring`, `waiting-period-ended`, and
`planned-day-taken` events, plus a balance series. Everything stays in the policy's native
unit (hours stay hours); rounding is left to the UI layer (not built yet). `unlimited`
policies return an empty series/events (acceptance scenario S5's "no balance chart").

**2C — Tests**, 21 passing, hand-verified arithmetic in comments:
- Per-pay-period: 15 days/year biweekly → exactly 15.00 over the 26 pay dates inside one
  plan year (hand-verified: `15/26 × 26 = 14.999999999998`, `toBeCloseTo` tolerant of the
  float error); a 22.5-day cap pausing accrual and reporting the exact amount lost
  (`22 + 15/26 = 22.576923...`, capped to `22.5`, lost `= 0.076923...`), then resuming
  cleanly after a day is taken.
- Front-loaded + carryover: the exact S1-shaped case from the run prompt (20 days Jan 1, 8
  used, carryover cap 5, calendar year, as of Oct 28) forfeits exactly 7 on the Jan 1
  reset; with 7 days planned before Dec 31, forfeits 0.
- A carryover `useByDate` distinct from the reset date: carried days expire on that later
  date, not at reset; a planned day spent from the carried amount before the deadline
  reduces what later expires.
- Anniversary plan year (resets on the anniversary month/day every year, not Jan 1); a
  90-day waiting period measured from an anniversary start date (hand-verified: Jun 15 + 90
  days = Sep 13); a negative-balance allowance of 3 clamping spend at exactly -3; hours-mode
  accrual (4.62 hours/period at 7.5 hours/day) staying in hours internally; unlimited PTO
  producing no balance series; a projection window spanning a real leap day (2028-02-29)
  not erroring.
- **Deferred to a continuation**: pro-rating for a mid-year start (the model has no
  explicit "employment start" field distinct from `balanceAsOf`/anniversary `startDate` —
  flagged below), a case verifying a holiday changes the marginal curve (that's actually a
  Stage 4A concern once /pto's holiday-aware solver is wired in, not a Stage 2C projection
  concern — re-scoped, not dropped), and the full S1–S7 acceptance-scenario suite as
  end-to-end tests (S1's *arithmetic* is covered above; the actual URL-generation and
  /pto-hand-off parts of S1–S7 need the Stage 4 tool, which doesn't exist yet).

**2D — Vocabulary**: `docs/VOCABULARY.md` (12 concepts) + `src/content/vocabulary.ts`
(machine-readable mirror) + `findBannedVocabulary()` with 3 passing unit tests. **Not yet
wired into a real site-wide scan** — that's Stage 5A's job once there's UI copy to scan;
right now it only guards the vocabulary module's own correctness.

## Test / tsc / build status

**End of PR-A**: `npm test -- --run` 428 passed, 1 failed (known K9 timing flake). `tsc
--noEmit` and `npm run build` both clean.

**End of PR-B**: `npm test -- --run` **455 passed, 0 failed** (the K9 timing flake didn't
even trip this run — machine load dependent, still not something to rely on being absent).
27 new tests this stage (`src/policy/acceptance.test.ts`'s S1–S7, `src/content/
readability.test.ts`, `src/ui/Term.test.tsx`, `src/ui/pto-policy-regression.test.ts`) on
top of PR-A's. `npx tsc --noEmit`: clean. `npm run build` (`tsc -b && vite build` +
prerender postbuild): clean — **40 routes built and prerendered** (was 9 before this
feature: landing, /pto, /sabbatical, 6 country routes; now also /policy, /glossary, and 29
glossary term pages). Caught two real `tsc -b`-only errors during PR-A/B development that
plain `tsc --noEmit` missed, consistent with this repo's established pattern.

## Questions for Atiyk

- **PR-B's single largest gap: /policy has no URL round-trip.** Every input is local React
  state only — a `/policy` link does not currently reproduce the policy you described,
  which directly conflicts with CLAUDE.md's own URL-round-trip rule. I chose to ship PR-B
  without it rather than keep expanding scope further, since the engine + glossary + tool
  were already a lot to verify in one pass, but this is a real product gap, not a style
  nit. **My recommendation**: treat this as the first thing PR-C (or a dedicated follow-up)
  does, using `src/ui/urlState.ts`'s own conventions, before the plain-language audit work —
  it's more load-bearing than copy polish.
- **Pro-rating a mid-year start**: still unaddressed (carried over from PR-A). The model has
  no explicit "employment start date" apart from `balanceAsOf` (a snapshot, not a start
  date) and the anniversary plan year's own `startDate`. **My recommendation unchanged**:
  add an optional `employmentStartDate` field when URL round-trip work touches this area
  anyway.
- **New devDependencies this stage**: `@testing-library/react` and `@testing-library/dom`,
  added to write `src/ui/Term.test.tsx` (the spec explicitly asks for keyboard/tap tests,
  and this repo had no component-level test infrastructure at all before now). Low-risk
  (dev-only, no production bundle impact, no network/filesystem access), but flagging it
  per the "take the conservative option and log it" rule rather than installing silently.
  **My recommendation**: keep it — any future component test needs it too, and reinstalling
  per-PR would be worse.
- ~~Continuing this run~~ — superseded: PR-C is now done too (below). The URL round-trip
  gap was fixed first, as recommended, before the audit/polish work.

---

# Feature 1 — PR-C: Stage 4A follow-through, plain-language audit, quality pass

**PR-C**: [#30](https://github.com/Atiyk/PTO-Optimizer/pull/30) (draft, base
`feature1-b-policy-tool`). This is the last PR of Feature 1's three-PR stack.

## Stage 4A follow-through: /policy URL round-trip

Fixed first, as PR-B's own recommendation said to. `src/ui/policyUrlState.ts` follows
`urlState.ts`'s conventions exactly (short keys, omit-at-default, `1`/`0` flags) for every
one of `/policy`'s ~25 inputs. `Policy.tsx` reads it once on mount and writes back via
`history.replaceState` on every change — the same pattern `useAppState.ts` already uses.
9 round-trip tests, plus a live, real-browser check (not just synthetic): changed the
accrual-amount input, confirmed the URL updated to `am=2.5` live, reloaded that exact URL
cold, and confirmed the page re-rendered "You earn about 2.50 days every month." — a
genuine end-to-end proof, not just a unit test of the encode/decode functions in isolation.

## Stage 5A: the plain-language audit (as asked, a real table)

Audited every visible string on `/`, `/pto`, `/sabbatical`, `/docs`, and the footer against
the suspect list (weighting/"priority" slider, "break style", "reserve", "efficiency",
"multiplier", "travel score", "alternatives", "pinned", "ruled out", "blackout", "notice
period", "accrual"):

| String / area | Problem | Change |
|---|---|---|
| MoreOptions.tsx `<h4>Accrual</h4>` | Jargon word, no explanation | Wrapped in `<Term id="accrual">` |
| MoreOptions.tsx `<h4>Expiry &amp; carryover</h4>` | "carryover" is jargon | Wrapped "carryover" in `<Term id="carryover">` |
| MoreOptions.tsx "My employer's notice period" | Jargon phrase | Wrapped "notice period" in `<Term id="notice-period">` |
| WeightingSlider.tsx ("What matters more?", "Most days off" / "Cheapest to travel") | — | **Already plain language.** No "weighting" or "priority" shown to the user anywhere — left as-is. |
| BreakCountSlider.tsx ("Let the solver decide", "Solver chose N breaks") | "Solver" is a product-mechanics term, not HR/handbook jargon | **Left as-is.** Not in the Stage 3 glossary's scope (time-off policy terms); already explained in the FAQ. Renaming the product's own algorithm name felt like a different, undirected change. |
| App.tsx "Show alternatives" | — | **Already plain.** No change. |
| MoreOptions.tsx "Days I can't take off" (the blackout section's actual heading) | — | **Already plain** — "blackout" itself is never shown to the user; the heading already avoids the jargon. No change. |
| Legend.tsx "Pinned by you" | — | **Already plain.** No change. |
| SummaryMetrics.tsx "Travel" / "Efficiency" labels | Solver-specific scoring terms, not in the 29-term glossary | **Left as-is**, flagged rather than silently expanded — these are a different concept from the time-off-policy glossary (Stage 3's explicit scope) and already have an FAQ explanation + hover hint (InfoHint). Adding them to the glossary would be scope creep without a product decision first. |
| `/docs` (`public/docs/index.html`) | Uses "accrual", "carryover", "notice period", "blackout" freely | **Left as-is.** `/docs` is an explicit technical API reference for the URL parameter contract (its own stated purpose), not worker-facing product copy — P5's plain-language rule targets the product UI. Flagged here as a deliberate scope boundary, not an oversight. |
| Footer.tsx | — | Already rewritten in run 1's Phase 6 (PR #27); no new jargon found this pass. |

**Grep for "entitled"/"must"/"should"/"legally"/"advice"** across every Feature 1 file
(Stage 6's own requirement, done here since it's the same audit pass): every hit reviewed
individually. None are policy-advice violations — each is either (a) an explicit disclaimer
("Is this legal advice? No...", Policy.tsx's own FAQ), (b) a descriptive statement about the
user's OWN stated policy ("Carried-over days must be used by X" — a fact about a deadline
the user entered, not a legal claim), (c) a definitional statement about what a term means
("you must work before you can use newly accrued PTO" — defining "waiting period", not
asserting a legal obligation), or (d) a suggested question FOR the user to ask HR (`askHR`
fields, where "should"/"must" are the user's own words in a question, not Days Off's
assertion). No changes needed; documented here as a clean result, not skipped.

## Stage 5C: Plan / Understand nav restructure

`SiteHeader.tsx` now groups into two labelled `<nav>` sections — Plan (PTO Optimizer,
Sabbatical Planning) and Understand (Your Policy, Glossary) — each already had
`aria-current="page"` on its active link from PR-B; unchanged, just regrouped. Still no
icons, no dropdown, same underline-for-active treatment.

## Stage 5D: the landing page's "Understand" section

Added, following the exact pattern every other landing section already uses (small label,
heading, 1-2 sentences, a REAL computed UI fragment): a live plain-English summary sentence
and the top alert for a representative default policy (20 days front-loaded, capped
carryover), linking to `/policy`. No mock-up, no invented numbers — `generatePolicySummary`/
`generateAlerts` computed live, same functions `/policy` itself calls.

## Stage 5G: confirmed and root-caused (fixed in PR-C's first commit)

Both bugs the run prompt named were confirmed and fixed:
- **Blank Travel/Efficiency scores**: root cause is `useAppState.ts` deliberately deferring
  that computation to a `useEffect` (a real Phase 5 performance fix — synchronous
  computation on every input change made a full-year calendar feel frozen on a real click).
  `renderToString` runs no effects, so the deferred computation never ran during
  prerendering. Fixed with a `__PTO_SSR__` flag `scripts/prerender.ts`'s own jsdom window
  sets (never present in the deployed HTML a real visitor's browser executes), read only by
  the state's lazy initializer — a real user's browser is completely unaffected. Verified in
  `dist/pto/index.html`: now reads "Travel 50th · Efficiency 100th" instead of "—".
- **"Longest stretch ahead"/"dry spell" stats**: per the earlier run's own PROGRESS.md
  (Phase 2/5 findings), these were already fixed by that run's holiday-data and K4
  dry-spell-redefinition work, which Feature 1 builds on top of (base branch
  `phase-2-holiday-data`). Re-confirmed still correct in this PR's own live-browser checks
  (the landing page's "21 / 3 / 5" stats in the screenshots above are real, not "—").

## Stage 6: quality pass

**A real interaction bug found and fixed** (not a checklist formality): while adding the
`<Term>` hints from the Stage 5A audit, live-clicked one in the real browser and the
popover didn't open — traced to `<Term>` being nested inside a `<label>` that also wraps a
form control, a known cross-browser footgun for nested interactive elements. Confirmed with
`elementFromPoint` (resolved to the exact right node) and a direct `.click()` call (worked
fine) that the component logic itself was correct — only a REAL coordinate-based click/hover
on that exact node failed, and only inside a `<label>`. Fixed everywhere this pattern
existed (`Policy.tsx`'s `Field` component, two standalone checkbox labels, and
`MoreOptions.tsx`'s notice-period label) by making `<Term>` a sibling of the `<label>`
rather than a descendant, using `useId()`+`htmlFor` for explicit label association instead
of the implicit nesting that caused the bug. Screenshot
`docs/screenshots/feature1/after-policy-term-popover-fixed-1440.jpg` shows it working
post-fix.

- **Keyboard walkthrough**: `/policy`'s inputs are all real `<select>`/`<input>`/`<textarea>`
  elements with normal tab order; `<Term>` hints are `tabIndex=0` with a real `aria-label`
  (confirmed via `Term.test.tsx`'s dedicated keyboard/Escape tests, 7/7 passing, plus the
  live-browser fix above).
- **Contrast**: computed WCAG contrast ratios for the alert boxes (amber-900 on amber-50:
  8.75:1, passes AAA), body text (slate-700 on white: 10.35:1, passes AAA), and this PR's
  own new "PLAN"/"UNDERSTAND" nav/section labels — **found these failed at slate-400
  (2.56:1, below the 4.5:1 AA minimum for normal text)** and fixed them to slate-500
  (4.76:1, passes). Pre-existing slate-400 usage elsewhere on the site (timestamps, the
  "(observed)" tag) predates this feature and was left alone — a site-wide contrast sweep
  is out of scope for this PR; flagged under Questions for Atiyk.
- **axe or similar automated a11y checker**: NOT run — not installed in this project and
  adding a new dependency for a one-time audit felt like the wrong tradeoff given this
  run's "flag new dependencies" rule; the manual contrast computation above and the
  component-level keyboard tests substitute for it here. Flagged as a gap, not hidden.
- **Mobile 375px walkthrough**: `/`, `/policy` (including the restructured `Field`
  component), and the landing "Understand" section all screenshotted at 375px — no
  horizontal scroll, no overflow, nav wraps cleanly to two lines. Not an exhaustive sweep of
  every route at every state (time-boxed), but covers every surface this PR actually
  changed.
- **Performance on /policy's live recompute**: measured directly in the browser — changing
  the accrual-amount input and timing until the next animation frame after the resulting
  re-render took **~5ms**, well under the ~16ms budget the spec names. The 18-month daily
  `projectBalance` loop plus `generateAlerts`/`generatePolicySummary` is cheap enough that
  no memoisation/deferral beyond the `useMemo` calls already in place is needed.
- **Copy grep** (entitled/must/should/legally/advice): done as part of Stage 5A above — no
  violations found.
- **Round-trip verification for each acceptance scenario's URL**: `src/ui/
  policyUrlState.test.ts` includes S1–S6-shaped policies built, round-tripped through
  `write`→`read`, and asserted byte-identical to the original state object. S7 (paste a
  paragraph) has no URL state to round-trip by design (P2: pasted text is never put in the
  URL) — verified instead that `writePolicyStateToURL` never touches an unrelated param
  (the `?highlight=` the glossary hand-off uses).
- **Grep diffs for submit-style verbs** (CLAUDE.md rule): `/policy` and every Stage 5 change
  checked — no submit/Generate button, no multi-step form, anywhere in this PR.

## Test / tsc / build status (end of PR-C)

`npm test -- --run`: **464 passed, 0 failed** (consistent across every commit in PR-C; the
K9 timing flake did not trip in any of this PR's test runs). `npx tsc --noEmit`: clean.
`npm run build`: clean, 40 routes.

---

# FINAL REPORT — Feature 1: "Your time-off policy, in plain English"

## The three PRs, in merge order (stack onto each other, then onto run 1's own
Phase 0-2 branches, then onto `main`)

| PR | Base | What it is |
|---|---|---|
| [#28](https://github.com/Atiyk/PTO-Optimizer/pull/28) `feature1-a-foundation` | `phase-2-holiday-data` (run 1, unmerged) | Spec, shared policy model, projection engine, 21 tests, vocabulary standard. No UI. |
| [#29](https://github.com/Atiyk/PTO-Optimizer/pull/29) `feature1-b-policy-tool` | `feature1-a-foundation` | /pto rewired onto the shared model, the 29-term glossary system (29 real prerendered routes), the full /policy tool (inputs, summary, chart, alerts, decode-a-paragraph, HR questions). All 7 acceptance scenarios as real tests. |
| `feature1-c-plain-language-ui` | `feature1-b-policy-tool` | /policy URL round-trip, the plain-language audit (applied), Plan/Understand nav, landing Understand section, the Travel/Efficiency prerender fix, and the quality pass (which found and fixed a real interaction bug). This PR's own link is recorded above its own section once opened. |

No Vercel preview URLs are given here: none of these PRs has been through a Vercel deploy
yet (all three are still drafts; a preview URL would come from the PR's own deployment
status once GitHub/Vercel builds it, which happens outside this sandbox). Check each PR's
own checks tab for its preview link once CI runs.

## What changed, what broke, what surprised me — across all three PRs

**What changed**: a complete second track for the site ("Understand", alongside the
existing "Plan" track) — a shared, richer policy model that both /policy and /pto now
describe policies through; a 29-term, readability-checked glossary with its own prerendered
pages; a full /policy tool with a live plain-English summary, a balance projection chart,
ranked alerts with direct hand-offs into /pto, a privacy-respecting paste-and-decode
feature, and HR-question generation; URL round-tripping for all of it; and a nav/landing
update that makes the new track discoverable and demonstrated with real data, not a
teaser.

**What broke** (always fixed before moving on, never left broken): nothing shipped broken.
Two things broke TEMPORARILY during development and were caught by the project's own
test/build gates before being committed: a `tsc -b`-only unused-parameter error (PR-A), and
a self-inflicted shell-escaping accident while trying to batch-edit a Tailwind class with
`sed` (PR-C's contrast fix) that briefly corrupted one JSX line in `SiteHeader.tsx` —
caught immediately by the next typecheck and repaired before any commit. Neither reached a
commit in a broken state.

**What surprised me**, genuinely, in order of how much it changed my approach:
1. **The `<Term>`-inside-`<label>` bug (PR-C).** This was the most surprising and most
   valuable finding of the whole run. It would have shipped invisibly — every unit test
   passed, the component logic was provably correct in isolation, and it LOOKED fine in a
   screenshot. Only driving it with a real simulated mouse click in the actual browser
   surfaced that it didn't work. This is a strong argument for the live-browser verification
   step in CLAUDE.md's workflow being load-bearing, not a formality.
2. **The glossary's first-draft readability failure (PR-B).** I expected the copy to be
   "pretty plain already" since I was writing it with P5 in mind from the start; instead,
   nearly every `long` field scored above the grade-10 ceiling on the first pass, because
   sentence LENGTH (not vocabulary) was the dominant factor the Flesch-Kincaid formula
   penalizes, and I'd written 2-3-clause sentences joined by commas without noticing.
3. **`toLegasySolverFields`'s own early design flaw (PR-B).** I wrote this function in
   PR-A, tested it, and it passed every test I wrote for it — because none of those tests
   happened to cover a case where `accrualPerMonth * 12 != budget`. Actually wiring it into
   `/pto` (not just testing it in isolation) is what surfaced that it silently discarded an
   explicit `accrualCap`. A reminder that a pure function's own unit tests only prove it
   correct for the cases someone thought to write.
4. **The Travel/Efficiency blank-score bug had a one-line-ish fix once root-caused.** I
   expected this to require restructuring the deferred-computation performance fix from
   Phase 5; instead, a single SSR-only flag the real browser never sees was enough, because
   the actual problem was narrower than it first looked (only the FIRST render during SSR
   needed the synchronous path, not every render).

## Glossary: term count, readability, legal statements

- **29 terms** (28 of the run prompt's 30 named terms, with "observed holiday" folded into
  "company holiday" as a documented alias — see Stage 3 notes above).
- **Readability** (Flesch-Kincaid grade level, `src/content/readability.ts`): average grade
  **5.5**, maximum grade **9.7**, **0 fields above grade 10** (the hard fail threshold),
  **6 fields above grade 8** (the soft warn threshold — acceptable per spec, which only
  requires flagging, not zero). This is the real, measured distribution from the final
  committed copy, run via `src/content/readability.test.ts`.
- **Terms with legal-sounding statements, and their sourcing**: `payout`, `use-it-or-lose-it`,
  `leave-of-absence`, and `negative-balance` all touch on what an employer "must" or "may"
  do. **None cite a specific jurisdiction's rule or statute** (`sources: []` on every entry
  in `terms.ts`) — each instead states generically that it "varies by where you work" and
  points to "your state or country's labor department," per P4's explicit instruction not
  to assert a specific legal claim without a primary, dated source. No entry needed a
  source because no entry makes a specific, sourceable legal claim.

## The plain-language audit table (Stage 5A)

See the table under "PR-C — Stage 5A" above (this section doesn't repeat it to avoid the
two copies drifting apart) — summary: 3 real jargon instances found and fixed in
`MoreOptions.tsx` (Accrual, carryover, notice period, all now `<Term>`-linked); 6 other
suspect areas checked and found already plain or deliberately out of scope (with the reason
stated for each, not silently skipped).

## Accessibility, mobile, and performance results

- **Accessibility**: found and fixed a real interaction bug (the `<Term>`/`<label>`
  nesting issue, detailed above) via live keyboard+click testing, not just a static audit.
  Contrast computed and fixed for this PR's own new text (2.56:1 → 4.76:1 on the nav/section
  group labels). `Term.test.tsx`'s 7 tests cover keyboard focus, Escape-to-dismiss, and tap.
  axe/automated a11y tooling was NOT run (not installed; flagged, not silently skipped).
- **Mobile**: 375px screenshots of every surface this feature touched, all clean (no
  horizontal scroll, no overflow, touch-friendly nav wrapping). Not an exhaustive sweep of
  every route at every input state.
- **Performance**: `/policy`'s live recompute measured at ~5ms per input change in the real
  browser (budget was ~16ms) — no further memoisation needed.

## Proof that old /pto URLs reproduce identical plans (Stage 2A rewiring)

`src/ui/pto-policy-regression.test.ts` (written in PR-B) compares the OLD inline ternary
logic against the NEW shared-policy-model path for every `ac`/`am`/`ex`/`xd`/`cc`
combination a real `/pto` URL can express, including the exact case that motivated the
`accrualCap` fix (`accrualPerMonth * 12 != budget`), plus one full `solve()` end-to-end
comparison asserting byte-identical output. All pass. The entire pre-existing
`solve.test.ts` suite (which already exercises many /pto-shaped inputs) also passed
unchanged throughout every commit in this feature, corroborating the dedicated test.

## Test / tsc / build status vs. the original K9 baseline

| Point | Tests | tsc | build |
|---|---|---|---|
| K9 baseline (run 1, before this feature) | 406 passed, 2 known-flaky | clean | clean, 9 routes |
| End of PR-A | 428 passed, 1 known-flaky | clean | clean, 9 routes |
| End of PR-B | 455 passed, 0 failed this run | clean | clean, 40 routes |
| End of PR-C (final) | **464 passed, 0 failed** | clean | clean, 40 routes |

No baseline failure was ever hidden or loosened; the K9 timing flake simply didn't trip on
several of this feature's own runs, which is expected given it's a machine-load-dependent
timing assertion, not evidence the flake was fixed.

## Questions for Atiyk — everything genuinely yours to decide, with my recommendation

1. **Merge order and timing.** All three Feature 1 PRs are stacked on `phase-2-holiday-data`
   (run 1's own unmerged branch), not on `main`. **Recommendation**: merge run 1's PRs
   (#21-27) first, in their own order, then rebase/retarget Feature 1's stack onto `main`
   (or merge it as-is onto `phase-2-holiday-data` and merge that whole chain), whichever is
   less disruptive for how you review. I did not attempt either merge or retarget myself —
   both are merge-order decisions, not implementation ones.
2. **The slate-400 site-wide contrast question.** I fixed the 2 new instances this feature
   introduced but left every pre-existing `text-slate-400` instance alone (timestamps, the
   "(observed)" tag, etc.) since a full sweep is a site-wide concern, not a Feature 1 one.
   **Recommendation**: a dedicated, small "contrast sweep" pass across the whole site,
   scoped on its own, rather than folding it into a future feature's PR by accident.
3. **axe/automated accessibility tooling.** Not installed, not run. **Recommendation**: if
   accessibility compliance becomes a harder requirement, add `@axe-core/playwright` (or
   similar) as a devDependency in its own small PR, not silently inside a feature PR — same
   reasoning as the `@testing-library/react` flag earlier.
4. **The travel/efficiency glossary gap.** `/pto`'s "Travel"/"Efficiency" scores aren't in
   the Stage 3 glossary (scoped to time-off POLICY terms specifically). **Recommendation**:
   leave them out of THIS glossary; if a future "Understand your plan" feature covers solver
   mechanics specifically, that's a natural home for them rather than retrofitting this one.
5. **Pro-rating a mid-year start** (carried over from PR-A, still open). **Recommendation**
   unchanged: add an `employmentStartDate` field when/if a future pass touches this area.

## Next Understand feature — what I'd recommend, not built here

Based on what Feature 1 had to explicitly leave out of scope (§6 of the spec, and the
`sick-leave`/`leave-of-absence`/`unpaid-leave` glossary entries all pointing at gaps):
**pay and benefits** is the most natural next "Understand" feature — specifically, a
"What does my pay stub actually mean" tool (gross vs. net, pre-tax deductions, what a pay
period vs. pay date actually determines) would directly reuse this feature's `pay-period`/
`pay-frequency` glossary terms and its "in plain English, personalized to your own numbers"
pattern. A close second: **sick leave**, since it's explicitly called out as out-of-scope in
this feature's own spec (§6) and is the single glossary term most likely to generate a
"why doesn't this cover my situation" moment for a real user landing on `/glossary/
sick-leave` today. I have not built either — this is a recommendation for a future run,
not a start on one.


# Regulated coverage

Build log: issue #54 ("Regulated coverage: build log", label `rc-run`). Strategy background:
`/mnt/project-files/strategy/coverage-and-scheduling.md` (the strategy thread's branch
`claude/strategy-coverage-scheduling` was not pushed when this run started, so the doc is
not copied into this branch).

**Base:** `main`. When this run started the SMB MVP PRs were unmerged, so Phase 0 first branched from `claude/smb-p8-launch`; at about 05:10 UTC the MVP stack was merged into `main` (7e9b146), so `main` was merged into `claude/rc-p0-audit` (no force-push) and PR #55 now targets `main`.

## Phase 0: audit and reconcile (`claude/rc-p0-audit`)

### What exists (read 2026-10-30)
- `packages/engine`: solver (Days Off), holidays, ledger fixed point, policy model
  (`front_loaded`, `per_pay_period`, `per_hour_worked`, `unlimited`; caps, carryover,
  use-by, waiting period, negative allowance), balance projection, day-level coverage
  (`coverage.ts`), team planner (min-cost max-flow + local search, `teamPlan.ts`).
- `apps/teams`: Next.js 16, Drizzle + PGlite tests, 35 capabilities in the registry, 17 of
  them on MCP, REST + OpenAPI, MCP server, webhooks with outbox, OAuth client credentials,
  personal tokens, autonomy levels, AI module with budgets and evals, Slack app, demo org.
- Docs: SPEC, ARCHITECTURE, PLANNER, SECURITY, PRIVACY, AGENT-AUTH, ACCEPTANCE.

### What the MVP final report says failed or was skipped
- A8 (Slack) passes on fixtures only; never run live.
- Per-person OAuth for agents (Q4) designed, not built.
- Security gaps: sessions not revocable, webhook secrets derived from `SESSION_SECRET`,
  DNS-rebinding window on webhooks, CSP allows inline scripts, no MFA/SSO beyond Slack.
- Privacy policy and DPA are drafts needing legal review.

### Baseline on `claude/smb-p8-launch` in this sandbox (4 vCPU)
- Typecheck: clean (root + all workspaces).
- Build: `npm run build:all` passes; `npm run verify:dist`: identical, 652 files.
- Teams tests: 125 passed, 2 skipped (live-only).
- Root + engine tests: 474 passed, **1–2 failed: `solve.test.ts` "performance" (a full-year
  solve took 1.16–1.66 s against a 1 s wall-clock budget) and once "every count works…"
  timed out at 5 s.** These are Days Off solver timing tests and fail only because this
  sandbox is slower; no logic failure. Not touched (Days Off is out of scope, and the
  root CLAUDE.md protects its build). Recorded as an environment flake; every gate below
  reports it separately.

### Known gaps that touch this work
See `docs/teams/COVERAGE-ARCHITECTURE.md` §6: hourly accrual uses scheduled hours, coverage
is day-level, tags instead of expiring credentials, no non-Slack staff sign-in.

### MVP defects fixed in this phase
None needed. Nothing in the MVP blocks the coverage work; the gaps above are extensions,
handled additively in Phase 1.

## Phase 1: spec and domain model (`claude/rc-p1-spec`)

- `docs/teams/COVERAGE-SPEC.md`: personas, entities, the required-staff computation and cover
  ranking written out with hand-verified examples (each is a test), sick-leave accrual
  examples, visibility, child-data and pay-rate rules, capability catalog (MCP 17 → 24),
  acceptance, out of scope.
- Engine (`packages/engine/src/coverage/`, pure): `timeBlocks` (DST via real UTC instants,
  midnight-crossing shifts, part-day leave), `requiredStaff` (ratio by mixed-age method
  youngest / majority / TX core child / proportional, group size, role-present per room or
  site, credential-gated counting, demand templates + exceptions), `ranking` (hard filters
  H1–H10 each with a failing test, integer score, member-id tie-break, cost band only),
  `sickLeave` (pack rule → ordinary `LeavePolicy`; `projectBalance` gained imported hours,
  `hoursPerUnit`, `annualAccrualCap`, `annualUseCap`; MVP policies unchanged).
- Seed packs (`packages/engine/rulepacks/`): childcare CA, TX, NY; clinic template (org
  policy only); labour CA, WA, NYS, NYC, CO (sick leave + overtime flags). One test per cited
  number (`rulepacks.test.ts`).
- Schema: migration `0005_regulated_coverage.sql` (15 new tables, 7 new defaulted/nullable
  columns), hand-written down script, an up → down → up test, and the child-data deny-list
  test over every column.

### Research log (retrieved 2026-10-30)
| Topic | Source used | Publisher | Status |
|---|---|---|---|
| CA infants 1:4 | 22 CCR § 101416.5(b) (Justia) | mirror | cited |
| CA toddlers 1:6, group 12 | H&S Code § 1596.955(a)(3)–(4), AB 762 (2015) enrolled text | enacted bill | cited; check the current statute |
| CA preschool 1:12 | 22 CCR § 101216.3(a) (Justia) | mirror | cited |
| CA school age 1:14 / 28 | 22 CCR § 101516.5(b)(1) (Justia) | mirror | cited |
| CA mixed ages | § 101516.5(c) (school-age centres) applied to general centres | mirror | **needs verification** |
| TX ratios and group sizes | 26 TAC §§ 746.1601, 746.1609 charts (Justia PDFs), § 746.1603 core child (Cornell) | mirror | cited |
| NY ratios, group sizes, mixed ages | 18 NYCRR § 418-1.8(k), (l) (Cornell) | mirror | cited |
| CA sick leave | Lab. Code § 246 (california.public.law), DLSE FAQ | mirror | cited |
| WA sick leave, overtime | RCW 49.46.210, 49.46.130 (app.leg.wa.gov) | official | cited |
| NYS sick leave | ny.gov guidance on Labor Law § 196-b | agency guidance | **carryover needs verification** (statute not fetchable) |
| NYC sick leave | DCWP FAQs | agency guidance | cited |
| CO sick leave | C.R.S. § 8-13.3-403 (colorado.public.law) | mirror | cited |
| Overtime CA / NY / CO | Lab. Code § 510(a); 12 NYCRR § 142-2.2; 7 CCR 1103-1 Rule 4.1.1 | mirror | cited |

The official CA (CDSS/Westlaw), TX (SOS) and NY State sites refused the sandbox's fetches,
so most childcare numbers come from mirrors of the official text. The UI labels the
publisher on every rule; verify against the official publisher before a customer relies on
them (Questions for Atiyk).

### Gate
- Typecheck clean; lint clean (warnings pre-existing); `npm run build -w apps/teams` passes;
  `npm run verify:dist`: identical, 690 files.
- Root + engine: 587 passed, the same 2 Days Off solver timing tests fail (environment).
- Teams: 131 passed, 2 skipped.
- No screens changed (no screenshots this phase).

## Phase 2: coverage core in the web app (`claude/rc-p2-core`)

### What was built
- **Capabilities** (registry, all with RBAC and tenant checks):
  - `getCoverage` (coverage:read; ui/rest/mcp/slack/assistant). Staff see only their own site.
  - `manageSchedule`: timezone, rooms, rule pack per site (a labour pack also creates the
    site's sick policy), weekly demand, demand exceptions, shifts, shift exceptions.
  - `manageCredentials`, `getCredentials` (expiry bands: expired, 7, 14, 30 days).
  - `importHoursWorked`: preview, commit with a batch id, undo.
  - `getSickLeave`, `listRulePacks`, `getCoverageSetup`.
  - Only `getCoverage` is on MCP, so MCP has 18 tools.
- **CSV import**: `importCsv` gains `credentials`, `shifts` and `hours`, plus `stage: 'undo'`
  with a batch id.
  - Coverage kinds use their own synonym list, so "From/To" means a time there and a date
    for leave.
  - Undoing a batch id that the org never wrote returns not_found.
- **Leave impact at block level (D4)**:
  - `evaluateRequest` computes `blockCoverage` for the member's regulated sites: the new
    ratio and role gaps this absence opens, each with its rule and citation.
  - `draftLeaveRequest` returns it, and the gaps show as warnings in the request form. An
    employee can still ask.
  - Any such gap blocks auto-approval.
  - `decideLeaveRequest` returns the gaps when a manager approves anyway.
  - Hours requests can carry `startTime`/`endTime`. They are stored in
    `leave_requests.start_minute/end_minute`.
  - The auto-approval basis text is unchanged, so MVP test A4 stays as it was.
- **Pages**:
  - `/app/coverage`: a 7-day gap list with citations, plus a room × 30-minute heatmap for
    one day. Gaps read in greyscale (−N, heavy border, stripes). Site, date and "count
    pending" are in the URL and update live.
  - `/app/admin/coverage`: setup in four steps (rules, rooms, children expected as counts
    only, staff schedules). It uses a weekly pattern editor where one line covers Mon–Fri.
  - `/app/admin/credentials`: expiry dashboard and forms.
  - `/app/sick`: balance, usable, the annual use cap and every accrual line ("1 per 30 hours
    worked × 77 hours (period)").
  - The import page has the new kinds, org-specific samples and an Undo button.
  - Nav: Coverage and Sick leave appear only when the org's vertical is not "general".
- **Demo seed** `seedChildcareCentre` (Sunbeam Early Learning, Oakland CA):
  - 3 rooms and 18 staff, with the CA childcare and labour packs.
  - CPR records: one expired and three expiring within 30 days.
  - Hours worked since January.
  - An approved toddler-teacher absence next Monday, which opens a cited 15:30–16:30 gap
    (H&S § 1596.955).
  - Available from `/dev/login` and tested in `seedCoverage.test.ts`.
- **Tests**:
  - `coverage.test.ts`: a staffed day has no gaps; a cited gap for pending leave; hours
    windows; D4; RBAC; credential CSV with bands and undo; shift CSV mapping; CA hourly
    accrual from imported hours, then undo; no child-data field in any capability schema.
  - The isolation test gains 17 attacks on the new capabilities, as a human and through
    agent tokens; snapshotOrg now covers the coverage tables.

### Setup click count (RC1, counted from the UI, not yet timed)
For one site with 3 rooms by hand:
- Pack: 2 interactions.
- Timezone: 2.
- Rooms: 3 × 3 = 9.
- Demand: each room is 1 line × 3 time bands, about 13 interactions, so about 39.
- **Total before staff: about 52 interactions.**

Staff schedules are about 6 per person by hand, or one CSV import (4 clicks).
Credentials take one CSV import. RC1 (under 10 minutes) gets a timed Playwright run in
Phase 7.

### Gate
- Typecheck clean for every workspace. The lint warnings are the existing `Date` purity
  pattern.
- Root `npm run build` passes, and `verify:dist` is identical (690 files).
- Teams: 141 passed, 2 skipped.
- Root: 587 passed, with the same 2 Days Off timing tests failing (environment, Q1).
- Screenshots are in `docs/screenshots/rc-p2/`:
  - Coverage, likely view, setup, demand editor open, credentials, import, credential
    import preview, sick leave, employee home (draft showing the toddler gap) and employee
    coverage.
  - Each at 1440/768/375 (import preview at 1440/375).
  - No horizontal overflow at 375 (checked with scrollWidth).
- "Before" for the changed MVP views (import page and request form) is
  `docs/screenshots/smb-p2/` and `smb-p6/`. The other views are new.

### Questions for Atiyk (Phase 2)
- Q4: A ratio gap warns the employee but does not stop them from asking. It only blocks
  auto-approval, and the manager sees it. The other option is to block the request
  outright. I recommend warning only, because the director may already have cover lined
  up.
- Q5: The CA labour citation regulation was renamed from "Cal. Labor Code § 246" to "Cal.
  Labor Code" (the section carries the §). This is a data fix with no behaviour change.

## Phase 3: cover workflow and employee PWA (`claude/rc-p3-cover`)

### What's in it
- **Cover workflow** (`src/domain/cover.ts`, `coverFlow.ts`):
  - A cover request's state is a fold over append-only `cover_events` (created, ranked,
    offers_sent, declined, rule_recheck_failed, filled, reverted, cancelled).
  - Offers go out in waves (default 3 people, 15 minutes apart) in the engine's ranking
    order. The next wave goes as soon as everyone in the last one declines.
  - First eligible "yes" wins. Every hard rule is re-checked at that moment, and a unique
    partial index allows one `filled` event per request, so a race has exactly one winner.
  - Accepting adds the cover shift to the person's schedule; cancelling a filled request
    removes it again.
  - Fairness ledger: covers taken, holiday covers and short-notice covers over 90 days, read
    from `filled` events. Pay rates are never loaded; ranking sees only the overtime band.
- **Capabilities**: `findCover`, `requestCover` (create needs an idempotency key; cancel),
  `respondToCover` (accept is human-only; an agent can't take a shift for someone),
  `reportCallOff`, `getCoverRequests`, `getMySchedule`, `setMyCoverPrefs`,
  `manageStaffSignIn`. MCP now has 22 tools.
- **Call-off** (two taps, no reason): today or tomorrow at the person's site time zone.
  It records approved sick leave with `source: call_off` and no note. It deducts sick
  hours only if the balance covers it (otherwise a note for the manager), then asks for
  cover for each new gap. A `reason` sent anyway is dropped by the schema, never stored.
- **Messages** (`src/server/messaging.ts`): in-app always; Web Push when VAPID keys exist
  and the person turned it on; SMS/WhatsApp behind an adapter. The mock records what would
  have been sent. The Twilio implementation is written and documented but OFF, and it
  throws if it is ever reached in tests. Message text is room, date, times and site only.
- **Staff sign-in without email or SMS**: passkeys (`@simplewebauthn/server` 14,
  discoverable credentials, challenge in a signed 5-minute cookie, public keys only) and an
  admin-issued one-time code (10 characters, 15 minutes, single use, stored hashed,
  rate-limited per IP). Slack OIDC is unchanged.
- **Staff app `/m`** (installable PWA, 375px first, 48px+ tap targets, a bottom tab bar):
  Today (next 7 days, offer banner, "I can't come in"), Offers ("Take it" / "Can't"),
  Leave (balances, sick hours, the same request form with its gap warning), Me (add a
  passkey, notifications on/off, cover preference, texts only when the employer turned
  texts on, own certifications, sign out), and `/m/signin`. The service worker only shows
  notifications; it caches nothing.
- **Manager pages**: "Find cover" on every fixable gap opens `/app/coverage/cover`: who
  can take it in fair order with "why this order", who can't and the rule that stops them,
  one button to ask the top 3, and the week's cover requests with cancel. All inputs are
  in the URL. The People page gains "Get a sign-in code".
- **Backstop for waves**: lazy advance on every cover read and decline, the daily cron, and
  `/api/cron/cover` (needs `CRON_SECRET`).
- **Fix found while building**: "today" was UTC everywhere in the cover flow, so a 6 pm call-off
  in California counted as tomorrow. Call-off and the schedule now use the site's time zone
  (`memberToday`), with a test.

### Tests
- `cover.test.ts` (10): ranking reasons, wave → fill → already_filled, a concurrent race
  with one winner, re-check at accept, wave advance, agents can't accept, the fairness
  ledger, call-off end to end (SMS mock outbox, schedule shows the shift as off), the
  reason being dropped.
- `staffAuth.test.ts` (7): code issue/redeem/expiry/single use, passkey options, the signed
  challenge, cover prefs never echo the phone, site-local today.
- The isolation test covers every new id-taking capability; migration 0006 goes up, down
  and up again.

### Gate
- Typecheck clean (root and teams). Lint: warnings only (the existing `Date` purity
  pattern, plus browser feature detection in effects).
- Root `npm run build` passes; `verify:dist` identical (690 files).
- Teams: 159 passed, 2 skipped.
- Root: 587 passed, with the same 2 Days Off solver timing tests failing (Q1; the solver is
  untouched by this branch).
- Screenshots in `docs/screenshots/rc-p3/`, an end-to-end run on the demo centre: a gap's
  Find cover link, ranked candidates, offers sent, the sign-in code, then on a 375px
  phone: sign in with the code, Today with the offer banner, Offers, take it, the cover
  shift on Today, Leave, Me, call-off confirm and done, and the manager's list showing
  "Filled by". No horizontal overflow at any width. The coverage page "before" is in
  `rc-p2/`; the other views are new.

### Questions for Atiyk (Phase 3)
- Q6: Waves only advance when someone opens the app, declines, or a cron runs. Vercel Hobby
  crons run once a day, so a 15-minute wave needs an external pinger. *Recommendation:* a
  free cron-job.org job every 5 minutes calling `GET https://<your-domain>/api/cron/cover`
  with header `Authorization: Bearer <CRON_SECRET>`. Click-path: cron-job.org → Sign up →
  Create cronjob → URL as above → Every 5 minutes → Advanced → Headers → add
  `Authorization` → Save. Or move to Vercel Pro and change the cron schedule.
- Q7: Turning on Web Push (free). Run `npx web-push generate-vapid-keys` locally, then
  Vercel → project → Settings → Environment Variables → add `VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (`mailto:you@yourdomain`) → Redeploy. On iPhone,
  staff must add the app to the Home Screen first (iOS 16.4+).
- Q8: Turning on texts (paid, off by default). Twilio Console → buy a number (or set up
  the WhatsApp sender) → copy Account SID and Auth Token → Vercel → Environment Variables →
  `MESSAGING_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`
  (E.164, or `whatsapp:+1…`) → Redeploy. US numbers need A2P 10DLC registration first.
  *Recommendation:* stay on push plus in-app until a customer asks.
- Q9: Call-off deducts sick hours only when the balance covers the whole shift, and
  otherwise leaves a note for the manager rather than going negative. Confirm that's the
  policy you want.
