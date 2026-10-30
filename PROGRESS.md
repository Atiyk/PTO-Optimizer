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
