# Expansion A2 integrated forecast + policy explanation candidate

**Owner:** Consumer expansion agent 2, after UX handoff and UX production READY at 01a2368c07d43b15404710609ffae567ab2bc462 on 2026-11-03.

## Scope and provenance
- Reuses the date-specific vacation comparison from draft PR #93, policy explanation functions and 19 tests from draft PR #98, and 1/3/6-month/year-end presets, dedicated browser QA and tests from draft PR #103.
- Integrates **on-demand** deterministic policy-rule descriptions into the existing QuickForecast component. No parallel policy projection engine or new localStorage/URL key. The UI does not load the explanation calculation until requested.
- User-visible descriptions distinguish *entered employer rules* from verified legal rights; departure payout is not an entitlement claim.
- Preserves the just-shipped UX PR #106, its always-visible sliders, and all B2B code and shared solver.
- Supersedes the three source drafts **for this integration candidate only**. Do not merge source drafts separately if this integration PR is merged.

## Release and critic gate
- Base main: 01a2368c07d43b15404710609ffae567ab2bc462
- Exact-head CI, lint, typecheck, production build, 1440/768/375/320 responsive browser, accessibility/Lighthouse and new on-demand explanation interaction evidence **pending until GitHub workflows complete**.
- Independent critic and privacy/security review **not obtained**. Do not merge or deploy before genuine review, release plan, and READY preview.
- Future work: connect vacation comparison to editable request flow; do not portray the pure comparison module as already a shipped user interface. Employer calendar and payout/school/carryover drafts remain separate.

## Privacy
The explanation uses the existing in-memory policy and requests; it does not add these values to public URLs, analytics, or a backend. It links to the existing /glossary guide. Any public share remains controlled by existing URL-state code.
