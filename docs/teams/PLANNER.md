# Team planner: clearing expiring leave under coverage

Code: `packages/engine/src/leave/teamPlan.ts` (pure, no DB). Tests: `teamPlan.test.ts`.
App: capability `runTeamPlan` (read) and `sendPlanProposals` (commit) in
`apps/teams/src/capabilities/actions/planner.ts`; screen **Planner**.

## Problem

For each person with days that will be forfeited (from the ledger + policy projection:
the next scheduled forfeiture, i.e. year-end over the carry-over limit or carried days
past their use-by date), choose working days before that deadline so that

1. the fewest days are forfeited in total, then
2. each person gets long runs off (bridging weekends, holidays and leave already booked),

and no coverage rule ("at least N in", optionally "at least N with tag X", per weekday)
is broken on any day. Already-booked leave (approved and pending), holidays per person's
location, blackouts and dates a person wants to keep free are respected.

## Algorithm

**Stage 1: min-cost max-flow.** Source → person (one unit edge per needed day, the k-th
costing a little more than the (k-1)-th) → (day, innermost rule containing the person) →
(day, enclosing rule) → … → day → sink. A rule node's outgoing capacity is that day's
slack (people present minus the minimum). Successive shortest paths with SPFA.

- The maximum flow is the most days that can be placed, so forfeiture is minimal. With
  laminar rules (any two rules in a team either nested or disjoint, e.g. "2 people" and
  "1 engineer", or "1 engineer" and "1 designer") this is exact; the result says
  `exact: true`.
- Edge costs: 100 per day, minus 30 per side that touches a day already off (50 if both),
  minus 20 in a preferred month, plus 500 on a date the person wants to avoid, plus up to
  20 on days with little slack. Rising per-person unit costs share scarce days out evenly
  instead of first come, first served.

**Stage 2: local search.** For each person and each planned day, move it to another
eligible day if that increases Σ (run length)² over the runs of days off containing a
planned day and every rule still has room. Counts never change, so stage 1's minimum
stands. At most 6 passes, and it stops at the time budget (`stoppedEarly`).

**Non-laminar rules** (overlapping tags): stage 1 chains each person's rules by size, then
every planned day is re-checked against every rule and dropped if it would break one.
Coverage is still never violated; the minimum is no longer guaranteed (`exact: false`).

**Determinism.** Inputs are sorted by id, adjacency and queues are FIFO in insertion
order, ties break by date. Same inputs, same plan, whatever the input order (tested).
Only the time budget can change the result, and only by stopping stage 2 early, which is
reported.

## Complexity and timings

V ≈ P + D·(R + 1), E ≈ P·D + P·max need. Stage 1 does one SPFA per placed day:
O(F · V · E) worst case, far less in practice. Stage 2 is O(passes · P · need · D · W)
with W the window length, using typed arrays.

Measured in the test suite (Node 22, this container):

| Case | Time | Placed |
|---|---|---|
| 50 people × 60 days, 3 laminar rules (30 in; 18 eng; 8 ops) | ~100–130 ms | 319 / 319 |
| 50 people × 60 days, 45 of 50 must be in | ~30 ms | 215 / 319 (the minimum forfeiture) |

The app recomputes on every input change (debounced 300 ms) with a 1.5 s budget.

## What is not modelled

Half days (the plan places whole days; a fractional remainder is reported), hours-based
policies are converted at the person's hours per day, only the next forfeiture event per
person is planned, and preferences are per run, not stored.
