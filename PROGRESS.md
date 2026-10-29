# Days Off — unattended run progress

Run started 2026-10-27, RUN MODE (see CLAUDE.md "Unattended runs"). Stacked branches,
draft PRs, no merges — Atiyk merges in the evening. Re-read this file first if resumed
after a restart or context compaction.

## Phase status

| Phase | Branch | Status | PR |
|---|---|---|---|
| 0 — Preflight & baseline | `phase-0-baseline` | done | [#21](https://github.com/Atiyk/PTO-Optimizer/pull/21) |
| 1 — Canonical domain | `phase-1-domain` | done | [#22](https://github.com/Atiyk/PTO-Optimizer/pull/22) |
| 2 — Holiday data foundation | `phase-2-holiday-data` | done | (pending) |
| 3 — Sabbatical correctness | `phase-3-sabbatical-correctness` | not started | |
| 4 — Sabbatical UX & features | `phase-4-sabbatical-ux` | not started | |
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

## Questions for Atiyk

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
| 2B — Projection | done | `src/policy/projection.ts` |
| 2C — Tests (hand-verified) | done | `src/policy/projection.test.ts`, `src/policy/model.test.ts` — see below for which edge cases are covered and which are deferred |
| 2D — Vocabulary standard | done | `docs/VOCABULARY.md`, `src/content/vocabulary.ts` + lint test |
| 3 — Glossary system | **not started** | deferred to a continuation of this run |
| 4 — /policy tool (PR-B) | **not started** | deferred |
| 5 — Plain-language pass (PR-C) | **not started** | deferred |
| 6 — Quality pass | **not started** | deferred |

**This is an honest partial delivery of PR-A only** (Stages 0–2), stopped at a clean,
tested, committed point because this run is operating under a single-pass turn budget.
PR-A itself is complete and in good shape to review/merge on its own — it adds no UI and
changes no existing behavior, only new pure modules plus docs. PR-B and PR-C (the actual
`/policy` tool, the glossary, and the site-wide plain-language pass) have not been started.

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

## Test / tsc / build status (end of this delivery)

- `npm test -- --run`: **428 passed, 1 failed** (the same K9 `<1000ms` perf-budget timing
  flake, this run at ~1022ms — not a new failure; no solver file touched). 21 new tests
  added (`src/policy/*.test.ts`, `src/content/vocabulary.test.ts`), all passing.
- `npx tsc --noEmit`: clean.
- `npm run build` (`tsc -b && vite build` + prerender postbuild): clean. Caught one real
  `tsc -b`-only error during development (`TS6133: 'rangeStart' is declared but its value
  is never read` in `toLegacySolverFields` — `tsc --noEmit` did not catch it, consistent
  with this repo's established pattern that only the composite build does) — fixed by
  renaming the currently-unused parameter to `_rangeStart` with a comment explaining why
  it's part of the signature already.

## Questions for Atiyk

- **Should `/pto`'s `useAppState.ts`/`urlState.ts` actually be rewired onto
  `TimeOffPolicy`** (Stage 2A's "make /pto use it too"), or is the current state — a pure,
  tested, documented mapping function that /pto doesn't yet call — the right amount of risk
  for an unattended run? **My recommendation**: keep it as a mapping function for now;
  rewire it in PR-B alongside the actual `/policy` UI, with the explicit regression test
  (fixed pre-existing-style `/pto?...` URLs → byte-identical solver output) the spec
  describes, so the risky change ships together with its own safety net rather than sitting
  in PR-A unverified against the real solver.
- **Pro-rating a mid-year start**: the model has no explicit "employment start date" apart
  from `balanceAsOf` (a snapshot date, not a start date) and the anniversary plan year's
  own `startDate` (which only exists for anniversary plans). A front-loaded policy with a
  calendar plan year and a genuine Mar 1 hire date currently has no clean way to express
  "pro-rate the first year's grant." **My recommendation**: add an optional
  `employmentStartDate` field to `TimeOffPolicy` in PR-B once the /policy UI needs to ask
  for it, and prorate front-loaded/per-pay-period first-year accrual from that date — flagged
  here rather than guessed at silently.
- **Continuing this run**: Stages 3–6 (the glossary, the actual /policy tool and its
  alerts/hand-offs into /pto, the site-wide plain-language audit, and the quality pass) are
  unstarted. They're the majority of the user-visible feature. Recommend resuming this run
  stage by stage rather than attempting all of it in one further pass, given how much
  Stage 4 alone involves (inputs, projection chart, alerts, HR-question generation, the
  paste-and-highlight feature, exports).
