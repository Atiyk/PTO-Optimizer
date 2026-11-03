# Consumer UI-first polish, single consolidated release candidate

Owner's order on November 3, 2026: finish the **remaining visual/interaction work first in one UI-only PR**, and do **not merge it until all automated checks, four-viewport browser screenshots, genuine independent critic opinion and bug fixes pass**. Only then coordinate a single UI production release and resume the other expansion features.

This *initial batch* updates the current UX main without duplicating already-merged PR #106. All modifications are visual, semantic, and control affordances—**no new policy, payout, carryover, school, calendar or solver functionality**.

- A calmer evergreen-teal action/selection/focus scheme replaces the dominant burnt-orange accent across shared CSS tokens. Text contrast and calendar grayscale semantics stay covered by exact CSS-parsing regression tests. Existing Figtree, warm neutral surfaces and semantic classes remain.
- The homepage now exposes a **visible PTO-days slider** next to the exact numeric input, stays live with the same canonical state and URL, allows keyboard arrow changes, displays a numeric value and accessible value text, without adding a form submit.
- Home's existing three tool destinations are grouped under clearer **Value** and **Act** headings, retaining real recommended break first and retaining country-specific planner, forecasts, policy routes and links.
- Added React regression tests for slider/number synchronization, URL round trip, and Value/Act headings.

**Outstanding on this draft:** inspect production-quality 1440/768/375/320 before/after screenshots, tab/focus, mobile touch, performance/Lighthouse/axe, unrelated route and country regressions, independent critic, and fix all observed bugs on the final head. Continue refining this **same UI PR** in coherent batches; do not create small separate UI release PRs and do not merge feature PR #111 first. Keep B2B `apps/teams` and `packages/engine` untouched.

This document is a draft scope ledger, **not** a passed test report or approval.
