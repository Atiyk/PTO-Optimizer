# Timebower launch readiness ledger

Branch `growth/launch-readiness-20261121`. Updated 2026-11-22. One row per task. "Evidence" points at
a file, test or check that can be rerun. Verified baseline: [BASELINE.md](BASELINE.md).

**Statuses**
- **Verified**: implemented and verified on this branch, but not deployed until merged *and* Vercel builds it.
- **Owner review**: prepared for owner review.
- **External**: requires external setup.
- **Deferred**
- **Not recommended**

## Release reliability

| Task | Priority | Owner | Status | Evidence | Remaining blocker |
| --- | --- | --- | --- | --- | --- |
| Find which commit production serves | P0 | Orchestrator | Verified | BASELINE.md: 59 live files fingerprinted; Vercel status per SHA | Production is `767e875` (#157). #158 and #159 were never deployed |
| Stop the "Daily redeploy" Action from silently passing while deploying nothing | P0 | Orchestrator | Verified | `.github/workflows/daily-redeploy.yml` now warns and writes a step summary; the secret is passed via env | Owner adds the `VERCEL_DEPLOY_HOOK_URL` secret |
| Avoid exhausting the Vercel Hobby quota (100 deployments/day, two projects build per push) | P0 | Owner | External | Ignored-build-step cancels still count ([Vercel docs](https://vercel.com/docs/projects/project-configuration/ignored-build-step)) | Owner decides: set `"git": {"deploymentEnabled": {"main": true, "*": false}}` in `apps/teams/vercel.json` (stops B2B previews), and/or prune the 120+ stale branches. This sprint pushes once |
| Ship one consolidated production release | P0 | Orchestrator, then owner | Owner review | This branch's PR | Merge only after green CI and a critic GO; check Vercel actually built it |

## Discovery (SEO)

| Task | Priority | Owner | Status | Evidence | Remaining blocker |
| --- | --- | --- | --- | --- | --- |
| Six 2027 guide pages (`/2027`, `/10-pto-days`, `/15-pto-days`, `/long-weekends`, `/four-day-week`, `/uk-annual-leave`) | P1 | Agent B | Verified | `src/content/guides/*.test.ts`: 16 plans match /pto; holiday dates checked against OPM and gov.uk; axe 0 at 375/1440; screenshots in `docs/screenshots/growth-seo/` | Deploy; submit the sitemap in Search Console |
| Plans on federal holidays and on a six-holiday employer list, both reproducible by link | P1 | Agent B | Verified | `guidePlannerParity.test.tsx` (`eh` param) | None |
| Data-driven guide workflow for new years and countries | P2 | Agent B | Verified | `guides2027.ts`, plus a test that fails when a year has no holiday data | Before 2028: add the config, then verify the dates |
| Internal links (footer, homepage, llms.txt, sitemap with lastmod) | P2 | Agent B and orchestrator | Verified | `Footer.tsx`, `Landing.tsx` "2027 guides" group, `public/llms.txt` | None |
| Remove the dated "expiring Dec 31, 2026" hub section after New Year | P2 | Owner | Owner review | SEO-STRATEGY.md | Edit it in January 2027 |
| `/uk` opens with no region, so England & Wales Easter Monday and the August bank holiday are missing | P2 | Owner | Owner review | SEO-STRATEGY.md audit | Product decision: default region |
| Scotland 2 January substitute date: Nager has Sat Jan 2, gov.uk says Mon Jan 4 | P3 | Owner | Deferred | SEO-STRATEGY.md | Data-source fix; no guide uses Scotland |
| "How to ask for PTO" request-email page | P2 | Next sprint | Deferred | COMPETITIVE-RESEARCH.md lesson 2 | Needs a careful worked example from `requestText.ts` |
| Mass-generated per-holiday or per-number pages | — | — | Not recommended | Thin-content risk | — |

## Activation, sharing, retention

| Task | Priority | Owner | Status | Evidence | Remaining blocker |
| --- | --- | --- | --- | --- | --- |
| Homepage says what it does (H1 "Find your best days off." and a subhead) | P1 | Agent C+D | Verified | `Landing.test.tsx`; screenshots `docs/screenshots/growth-ux/after-home-*` | None |
| Explain PTO the plan leaves unused (kept back vs doesn't fit) | P1 | Agent C+D | Verified | `landingState.test.ts` uses the solver's `meta.reserveKept` | None |
| Next real action: ask-by date for the next break | P1 | Agent C+D | Verified | Matches the planner's request panel for 4 country and budget cases | None |
| Shared-plan recipient framing, plus "Use my own PTO days" | P1 | Agent C+D | Verified | `SharedPlanNotice.test.tsx`; `publicSharePrivacy.test.ts` checks every private key with a sentinel | Notice still sits below the result card (moving it means editing App.tsx) |
| Request text follows the vocabulary rule ("days off in total") | P3 | Agent C+D | Verified | `requestText.test.ts` | None |
| Ask-by date for "Considering" (saved) breaks | P2 | Owner | Owner review | ACTIVATION-AUDIT.md finding 3 | Rule N-P1-2 gives deadlines to Planned only; owner picks the behaviour |
| Calendar reminder on the ask-by date | P1 | Existing | Verified | `icsExport.ts` already writes a "Request time off" event with an alarm | None |
| Streaks, points, daily engagement mechanics | — | — | Not recommended | Once-a-year task (Lally et al. 2010) | — |
| Native push or sync promises | — | — | Not recommended | No infrastructure to keep them | — |

## Measurement

| Task | Priority | Owner | Status | Evidence | Remaining blocker |
| --- | --- | --- | --- | --- | --- |
| Campaign attribution, privacy-safe (`utm_source/medium/campaign`, strict allowlist, Plausible pageview only) | P1 | Agent E | Verified | `analyticsPrivacy.test.ts` (emails, dates, numbers, encodings dropped); `consumer-journey.mjs` checks the real pageview | None |
| Funnel events: landing CTA, guide CTA, holiday check, request copied, shared plan made own, first interaction | P1 | Agent E, C+D, B | Verified | `ANALYTICS_EVENTS`; privacy page list enforced by a test | None |
| Return-visit counting no longer counts reloads | P2 | Agent E | Verified | `analytics.test.ts` regression | None |
| Plausible site, goals, funnel | P0 | Owner | External | METRICS.md §5 (a funnel needs Plausible Business) | Plausible has no free plan; site ownership Unknown (the public dashboard returns 404). Without it, events record nothing |

## Brand, marketing, business

| Task | Priority | Owner | Status | Evidence | Remaining blocker |
| --- | --- | --- | --- | --- | --- |
| Positioning, homepage copy | P1 | Agent A+F | Owner review | POSITIONING.md, HOMEPAGE-COPY.md | — |
| Marketing kit: calendar, 10 concepts, 5 scripts, press draft, fact sheet, outreach templates, community rules, FAQ, checklist | P1 | Agent A+F | Owner review | MARKETING-KIT.md | Nothing is sent or posted. Owner fills contact, founder and handle placeholders |
| Contact links say Timebower | P1 | Orchestrator | Verified | `contact.ts`, `privacy.html`, `terms.html` and tests | The inbox is still `gaplessreminders@gmail.com`. Owner creates a Timebower address |
| Competitive research and evidence | P1 | Research | Owner review | COMPETITIVE-RESEARCH.md (39 sources) | — |
| Monetization options and model | P2 | Readiness | Owner review | MONETIZATION.md | Vercel Hobby terms forbid commercial use: any revenue needs Pro first |
| Custom domain and native app readiness | P2 | Readiness | Owner review | APP-AND-DOMAIN-READINESS.md | Trademark attorney check; no purchase made |
| Native app wrapper or store listing now | — | — | Not recommended | Apple 4.2; Google 12-tester rule; $99/yr + $25 | Revisit at the METRICS.md thresholds |
