# Consumer expansion — isolated school/calendar conflict contract

Status: **implementation foundation, not released**. This branch starts from main at `3187596230768e4818720d1907475c9a3341a54c`. The owner-authorized November 2 Vercel-quota exception permits **non-overlapping draft feature code**, not merging, publishing or declaring Gate 0 complete.

## Scope and ownership

- **Agent C (calendar/scheduling, executed sequentially by orchestrator):** new `src/personal/schoolCalendar.ts` and `src/personal/calendarConflicts.ts`, with tests. This branch does not touch `src/ui/App.tsx`, `src/ui/Landing.tsx`, `src/ui/PlanExplanation.tsx`, `scripts/consumer-qa.mjs` or the UX agent's PRs #87/#88.
- **Agent Q (independent critic):** required before merge. Tests written by the implementer are **not** independent signoff.
- No changes to `apps/teams`, `packages/engine`, routing, shared URLs, storage or production.

## Canonical data boundaries

| Domain | Canonical existing owner | Contract for this foundation |
| --- | --- | --- |
| Policy/forecast | `src/policy/model.ts`, `src/policy/projection.ts`, `src/personal/forecast.ts` | Do not create an accrual or payout engine. |
| Leave ledger | `src/personal/requestLedger.ts` | Read `PtoRequest.ptoDates` and status; confirmed approved/completed overlap is a hard block; planned/requested is advisory; rejected/canceled excluded. Never serialize request notes. |
| Employer calendar | `src/personal/employerCalendar.ts` and request calendar | Explicit blackout dates are hard blocks; employer holidays themselves are not automatically a conflict. |
| School calendar | `src/personal/schoolCalendar.ts` | Normalize manual and **already locally parsed** ICS all-day dates. Reuse `src/ui/icsImport.ts`; do not add a second ICS parser. School closures are contextual off-days, not inherently conflicts; explicit in-session dates are advisory. |
| Personal calendar | Existing `parseICSBusyDays` | Imported busy dates are advisory because the parser lacks reliable event-level blocking intent. Import truncation/recurrence omissions are disclosed, not silently treated as complete. |
| Conflict result | `src/personal/calendarConflicts.ts` | Deterministic, inclusive date range; `hard-block`, `review-needed`, `no-conflict-found-in-available-data`; report source coverage and missing sources. No false "all clear." |
| Privacy | Consumer local-first | Functions accept only date/status data and return no event titles, attendee names, notes, salary, employer names or public URLs. No storage or network operations. |

## Explicit limitations / future integration

This PR is a **pure domain foundation**; it does not yet ship school-mode or conflict indicators in the UI. It does not expand recurring ICS events, infer district schedules, claim a school-year catalog, or import child identity. The existing ICS parser has its own date-span/file-size constraints to review before exposing a new school import UI; this foundation deliberately accepts its parsed result rather than raw untrusted files.

Before release, integrate the functions with the planner and tracker, add responsive screenshots at 1440/768/375/320, keyboard/contrast checks, source completeness messaging, and an independent critic approval. Vercel preview/production READY-SHA verification is pending quota recovery. **Do not merge this draft while the predecessor UX Gate 0 is incomplete.**
