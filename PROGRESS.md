# Days Off — unattended run progress

Run started 2026-10-27, RUN MODE (see CLAUDE.md "Unattended runs"). Stacked branches,
draft PRs, no merges — Atiyk merges in the evening. Re-read this file first if resumed
after a restart or context compaction.

## Phase status

| Phase | Branch | Status | PR |
|---|---|---|---|
| 0 — Preflight & baseline | `phase-0-baseline` | in progress | (pending) |
| 1 — Canonical domain | `phase-1-domain` | not started | |
| 2 — Holiday data foundation | `phase-2-holiday-data` | not started | |
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

## Questions for Atiyk

(none yet — will accumulate here as phases proceed)

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

## Questions for Atiyk (SMB)
- Q1. main does not contain the open stacked PRs #23–#31 (phases 1–6, Feature 1). Phase 0
  branches from main as instructed, so the engine is extracted from main's solver.
  Merging the old stack later needs its solver/data changes re-applied under
  `packages/engine`. Recommended: merge or close the old stack before merging this one.
