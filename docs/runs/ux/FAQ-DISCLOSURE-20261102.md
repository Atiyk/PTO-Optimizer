# FAQ disclosure and responsive keyboard QA — 2026-11-02

## Scope and defect
Consumer `/faq` and inline `/pto` FAQs used native `<details>` but removed the default disclosure marker without providing a replacement. The summary had no explicit keyboard focus indicator, and the `/faq` section navigation did not wrap or meet the 44px target height on narrow screens.

## Implementation
- Preserve native `<details><summary>` semantics, the same FAQ arrays and prerendered answers, while adding a visible chevron and a high-contrast focus-visible outline.
- Make summaries and `/faq` anchored navigation at least 44px high; allow section links to wrap at 320px.
- Preserve `/faq`, `/pto`, JSON-LD and existing FAQ wording; do not touch `apps/teams` or solver code.

## Verification gates (not yet claimed passed)
- Root consumer validation: npm test, TypeScript, lint, build, existing browser/visual evidence and Lighthouse/axe.
- Dedicated `Consumer FAQ browser evidence` workflow: actual Chromium screenshots at 1440, 768, 375, 320 on both `/faq/` and inline `/pto/` FAQ; keyboard Enter toggles disclosure, answer visibility, native closed state, 44px summary/nav targets, anchored section navigation, no horizontal overflow, and FAQ text in prerendered response HTML.
- Independent tester/critic must review evidence and semantic behavior; do not treat author self-review as approval.
- Exact-head Vercel consumer preview must be READY; B2B `leave_management` deployments do not count.
- Keep PR draft until every gate is met. Merge with exact-head SHA and normal protections, then verify production READY at the merge SHA.

## Scope isolation
This work owns only `src/ui/FAQ.tsx`, `src/ui/FaqPage.tsx`, its new tests/QA script/workflow, and documentation. It does not overlap the implementation files of UX PRs #87, #88, #90, #92, #95, #97, #99 or #101. It must not be merged ahead of unresolved earlier UX release gates.
