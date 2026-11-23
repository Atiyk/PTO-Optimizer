# Timebower verified baseline — 2026-11-22

> **Update, 2026-11-22 evening.** While this sprint ran, `main` gained #160 (B2B `apps/teams` removed), #161 (P3 follow-ups) and #162 (`/guides`, 11 US 2027 pages). Vercel built `c6844cc` (#162) successfully, and the live site serves `/guides`, so **production is now on current `main`**. #158 and #159 are live. `leave_management` no longer has an app to build. The release-state table below is the morning snapshot.

Checked by the launch-readiness orchestrator from GitHub, the live site and the repository.
Each line is **Observed** unless marked otherwise.

## Release state

| Fact | Evidence |
| --- | --- |
| GitHub `main` is `97af5b9` (PR #159, 2026-11-17). No open PRs. | `gh api repos/Atiyk/PTO-Optimizer/commits` |
| Production is **behind main**. It serves #153 and #155 code, but none of the strings added by #158 (saved-plan identity, "Manage saved plans") or #159 (backup recovery, mobile trust copy). | String fingerprint of all 59 production JS/HTML files against each commit's added UI strings |
| Last successful Vercel production build for `pto-optimizer`: `767e875` (#157), 2026-11-17 02:56Z. #158 and #159 failed with "Deployment rate limited — retry in 24 hours" (`api-deployments-free-per-day`, more than 100). | Commit statuses on each SHA |
| Each push builds **two** Vercel projects (`pto-optimizer` and `leave_management`, which is the B2B app). The repo has 120+ branches. Every branch push uses up the Hobby daily deployment quota twice. | Commit statuses, PR bot comments |
| The "Daily redeploy" GitHub Action reports **success but deploys nothing**: the `VERCEL_DEPLOY_HOOK_URL` secret is not set, so it exits 0. The repo has no Actions secrets. Prerendered date-relative content (countdowns, "N days away") has been frozen since the last real build. | Run 44915113050 log, `gh secret list` |
| `main` ruleset: no deletion or force-push; PR required (0 approvals); required checks: "Consumer tests, types, lint, build" and "Consumer browser and visual evidence"; review threads must be resolved. | `gh api repos/.../rules/branches/main` |

## Live site (https://pto-optimizer-seven.vercel.app)

- Security headers: HSTS, nosniff, SAMEORIGIN, CSP frame-ancestors, a permissions policy, and the `no-referrer` meta tag.
- `robots.txt` allows everything. `sitemap.xml` lists `/`, `/pto`, `/sabbatical`, `/family`, `/faq`, `/data-sources`, six country routes, `/policy`, `/glossary` with about 30 term pages, `/docs`, `/privacy` and `/terms`.
- The homepage is prerendered with canonical, OG and Twitter tags (`og-images/landing.png`). Title: "Timebower — Plan and track your time off".
- PWA: `manifest.webmanifest` and `sw.js` are present. `llms.txt` is present.
- Analytics: Plausible `script.manual.js` (`data-domain=pto-optimizer-seven.vercel.app`) plus Vercel Web Analytics (`/_vercel/insights/script.js` returns 200). The Plausible dashboard's existence and ownership are **Unknown**: no account access.
- There are **no 2027-specific search landing pages**. Country routes all mount the full planner app.

## Product and code (repo root = consumer app; `apps/teams` = B2B, do not touch)

- Stack: Vite 8, React 19, Tailwind 4, TS 6, Vitest 4, oxlint, Playwright scripts. Prerendering: `scripts/prerender.ts`, route list `scripts/routes.ts`, sitemap `scripts/build-seo-files.ts`, origin `scripts/siteUrl.ts` (`SITE_URL` env).
- The engine is `packages/engine` (`@daysoff/engine`), deterministic. Every planner input round-trips through the URL (`src/ui/urlState.ts`). Public share format: `sv=1` (`src/ui/shareFormat.ts`, `publicSharePrivacy.ts`).
- Homepage `src/ui/Landing.tsx`: an "I have [15] PTO days in [country]" sentence gives a live plan card ("N days off", "X PTO days + Y …", calendar-days explainer, a holiday-assumption check, "See the full plan →"). Below it: tools list, holidays timetable, "Same inputs, same plan".
- Returning visitors: `ReturningDashboard` (lazy) when a saved plan or request exists.
- Request flow per break (`RequestPanel.tsx`): copy request text, ask-by date, mark requested and approved. ICS export, image and portrait share, partner overlap, family/school, policy forecast, expiry guard, backup and restore.
- Analytics API: `src/ui/analytics.ts`. Event names only, URL sanitized to origin+path, and tracking is skipped if the referrer has a query. There are about 40 events; the acquisition source is not recorded (UTM is stripped together with all other query parameters).
- Repo rules (`CLAUDE.md`): no submit or "Generate" buttons, no multi-step forms, free-form date pickers, URL round-trip for every control, accounts optional, privacy boundaries. Run `npm test`, `npm run typecheck`, `npm run lint` and `npm run build` (the build also runs `tsc -b`). Screenshots at 1440, 768 and 375 px.
- Brand: `src/brand.ts` holds `PRODUCT_NAME='Timebower'`. Legacy branding remains in `public/privacy.html` and `public/terms.html` (contact `gaplessreminders@gmail.com`, subject "Gapless Contact"), `docs/personal/DATA.md` ("Gapless"), CLAUDE.md and PRODUCT.md ("Gapless PTO Optimizer"), the `index.css` comments, and `gapless.*` localStorage keys. The keys must stay for compatibility.
- Evidence on hand: no users, testimonials, press or ratings. Do not invent any.

## External blockers (need the owner)

- Vercel: the daily deploy quota and the deploy-hook secret; Vercel dashboard access to confirm the production deployment SHA.
- Plausible account and site ownership; Google Search Console verification.
- A support email address under the Timebower name.
