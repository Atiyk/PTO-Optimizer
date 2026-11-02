# Consumer UX — Navigation keyboard and touch accessibility

**Date:** 2026-11-02  
**Owner:** Consumer UX workstream; no B2B changes.

## Defect and scope

The shared site header rendered its mobile Menu button at `h-10` (40px), below the 44px touch-target goal in the approved UX brief. Navigation links had hover styling but no explicit keyboard-visible focus treatment; the compact desktop call-to-action also lacked a guaranteed 44px minimum height.

## Implemented

- Mobile Menu control now has `min-h-11 min-w-11` (44px by 44px), with centered content and an explicit focus-visible outline.
- Header logo, desktop navigation links, both CTA placements, and mobile disclosure links now expose a clear focus-visible outline.
- Desktop navigation links have a 44px minimum target height; the compact CTA has a 44px minimum height.
- Added regression coverage for target sizing and focus affordances alongside the existing Escape-to-close/focus-return test.
- No route, planner state, URL, solver, holiday data, tracking, B2B app, or third-party integration changed.

## Release/critic gates

This branch is intentionally isolated from open UX PRs #87, #88, #90, #92, #95 and expansion drafts. The PR must remain draft until exact-head tests, typecheck, lint, production build, 1440/768/375/320 browser screenshots and interaction evidence, independent critic review, and Vercel preview READY at the matching head SHA are verified. This note is a workstream record, **not** independent critic signoff.

After successful merge, verify production Vercel READY at the exact merged SHA. Do not claim this fix is live based on a preview or green CI alone.
