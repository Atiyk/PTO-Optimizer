# Consumer UX — result-first homepage milestone

**Owner authorization:** Gapless consumer redesign only; no `apps/teams` or shared B2B code.

**Branch:** `gapless/ux-landing-result-first-20261102` (based on main `3187596230768e4818720d1907475c9a3341a54c`).

## What changed

- The landing page now puts the actual solver-backed recommended vacation **before** the customization inputs, both in visual order and in DOM/keyboard reading order. This makes the dates, PTO cost, calendar days off and employer/public-holiday assumptions discoverable without first scrolling through a form.
- On desktop, the headline and real break preview form the first two-column row; the editable country/PTO/date inputs form a compact two-column row beneath. On mobile, the sequence is headline → recommendation → editable inputs → full-plan action.
- No new solver calculation, no submission step, no removal of free-form dates, no URL state change, no new analytics, and no personal-data transfer.
- Added SSR test for the result-first reading order and Playwright assertions for visual/DOM ordering at 1440/768/375/320. Browser capture includes the 320px homepage for the first time.

## Independent critic checklist — PENDING

- [ ] Exact-head npm test, TypeScript, lint and production build pass.
- [ ] Exact-head Chromium screenshots inspected at 1440, 768, 375 and 320 pixels, no horizontal overflow or missing preview.
- [ ] Keyboard focus order matches visual order; input fields and links have accessible names.
- [ ] Homepage updates immediately when country, PTO budget or dates change.
- [ ] Saved employer holiday preferences and deterministic URL handoff preserved.
- [ ] Vercel consumer preview READY at the exact PR head SHA.
- [ ] Independent reviewer/critic signs off before merge.
- [ ] After merge, production Vercel READY on exact main SHA, with smoke test.

**Known blocker:** As of 2026-11-02, PR #87 has a Vercel deployment rate-limit failure (`api-deployments-free-per-day`, retry in ~24 hours). Do not bypass preview validation or merge this PR until its own preview succeeds. This PR is independent of #87's plan-explanation code but touches the shared browser QA script; reconcile after #87 merges.

## Workflow

Keep draft until checks and critic approval. No B2B changes. This milestone is not completion of the overall UX redesign. The recurring UX run should continue through review, merge, verified production and any remaining visual refinements.
