# Gapless Consumer UI/UX: design principles and release checks

Owner's 2026-11-03 requested review sources:
- Mailchimp: https://mailchimp.com/resources/principles-of-design-websites/
- Figma: https://www.figma.com/resource-library/ui-design-principles/
- UXPin: https://www.uxpin.com/studio/blog/ui-design-principles/
- Laws of UX: https://lawsofux.com/

## Design decisions
1. **Clear hierarchy / user value first** (Mailchimp, Figma, UXPin): lead with an actionable PTO recommendation and an immediately editable preview. One prominent Plan PTO action, three secondary navigation destinations (My PTO, Learn, Sabbatical); no empty sign-in placeholder. Headings carry clear information scent, not generic "Tools."
2. **Cognitive load and Hick's Law** (Laws of UX): do not nest two nav categories in the header or add secondary choices that compete with the main CTA. Mobile keeps a conventional single Menu disclosure; the footer carries other supporting links.
3. **Fitts's Law and accessibility**: minimum 44px tappable targets, keyboard focus, 320/375/768/1440 responsive screenshots, Escape closes menu and returns focus, skip navigation to exactly one focusable main landmark on each route.
4. **Progressive disclosure appropriately** (Figma): the PTO slider, country and editable date fields remain immediately visible. Only the optional full 23-day calendar is collapsed on small screens, preserving access without burying the core controls.
5. **Consistency, typography and contrast** (Figma, UXPin): Figtree everywhere, a stronger Gapless wordmark, consistent hierarchy, 4.5:1 text contrast targets, warm neutral surfaces and the restrained evergreen-teal palette. Favicon and logo fallback use matching colors.
6. **Clarity and trust** (UXPin): descriptive link names, live calculation feedback, valid/invalid states and plain privacy explanations. No signup promises or dead support forms.
7. **Jakob's Law / familiarity**: simple top nav, visible email support, permanent FAQ/privacy entry points, familiar anchor links and browser-native mailto. Preserve old incoming URLs and deterministic planner behavior without promoting historical branding.

## Branding and privacy scope
Use Gapless PTO Optimizer and Gapless PTO. Remove historical product-name copy (including "formerly" and the older rename FAQ) from consumer surfaces, retaining ordinary natural-language phrases such as "days off" and internal package identifiers required by the solver. No changes to B2B apps/teams or shared packages/engine.

The privacy page documents only behaviors grounded in current implementation: browser-local records, plan-URL contents, Vercel/Plausible aggregate analytics, no-referrer, calendar import locally, holiday fallback, and ordinary hosting requests. Contact & feedback is a direct email to atiykahmeed6310@gmail.com; no data-collecting form or backend.

## Required release gates
- Latest-exact-head npm tests, TypeScript, lint, production build/prerender.
- Real browser comparison at 1440, 768, 375, 320: home, planner, policy, glossary, sabbatical, privacy, FAQ, header, 404. Keyboard/focus/touch, menu and privacy/contact, URL round-trips, icons, link destinations and no horizontal overflow.
- WCAG-oriented axe, Lighthouse, perceptual screenshots, contrast and typography critique.
- Separate read-only critic examines code and actual QA artifacts. Its explicit findings must be resolved, tested and independently rechecked. Do not substitute self-review or passing CI for critic approval.
- Keep the UI work in the existing consolidated draft PR #112, not multiple small PRs. Subsequent features are reviewed independently; production main merges/deployments only when the complete coordinated consumer release is ready and free-tier Vercel capacity permits. Branch protection stays enabled.

This document describes intended checks; it does not claim an independent critic has passed the latest SHA.
