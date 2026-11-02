# Consumer UX: date-list keyboard and touch improvements (2026-11-02)

Scope: consumer root only. The existing overlap-day and unavailable-day editors had tiny remove buttons, no focus recovery after removing a chip, duplicate dates silently cleared, and both date inputs had the same accessible name.

Changes:
- Keep immediate existing planner callbacks and URL behavior. No submit/Generate step, no solver or B2B edits.
- Give the two editors distinct accessible labels, explicit 44px minimum touch targets and a flexible narrow layout.
- Add dates with Enter or Add; disable invalid/duplicate adds and explain duplicates without discarding the draft.
- Announce add/remove outcomes and restore focus to the date input when a chip is removed.
- Keep the selected ISO dates in a semantic list with named removal controls.

Validation plan:
- Unit tests for keyboard add, duplicate prevention, removal focus, accessible names, and touch-target classes.
- Exact-head consumer GitHub Actions: tests, typecheck, lint, production build.
- Browser script: real Chromium screenshots and interactions at 1440/768/375/320, no horizontal overflow, URL date-range retention, runtime-error checks.
- Independent critic review and exact-head Vercel preview READY required before merge. Keep draft if any gate is absent.

No changes to apps/teams, solver, engine, public policy, expansion features or personal account data.
