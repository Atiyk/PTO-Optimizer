# Feature 1 — "Your time-off policy, in plain English"

Status: spec written, policy engine (Stage 2) in progress. Glossary (Stage 3), the /policy
tool UI (Stage 4) and the site-wide plain-language pass (Stage 5) are not started yet — see
PROGRESS.md "Feature 1" section for exact status.

## 1. Jobs this feature does (in the worker's own words)

- "My handbook says I accrue 4.62 hours per pay period. What is that in days a year?"
- "Will I lose days in December?"
- "Why did my balance stop going up?"
- "What does 'front-loaded' mean?"
- "I have a cap of 22.5 days — when do I actually hit it, and what happens then?"
- "My plan year isn't the calendar year — when does my balance actually reset?"
- "I just started this job three months ago — how much time do I actually have?"
- "What should I ask HR before I lose money or days I didn't need to?"

Every one of these is answered by computing the user's own numbers forward in time, never by
a generic rule. Nothing here is legal advice (P4): the tool describes what a policy's own
terms mean and what the user's own numbers show, not what the law entitles them to.

## 2. The policy model

### 2.1 Today's /pto model (read from the current code, not reconstructed from memory)

`/pto`'s accrual/expiry/carryover state lives in `src/ui/urlState.ts` /
`src/ui/useAppState.ts` and is consumed by `src/solver/solve.ts`. It is a **flat annual**
model:

| Field | URL param | Type | Default | Meaning |
|---|---|---|---|---|
| `budget` | `b` | number | — | Total PTO days available for the year (the ceiling). |
| `accrualEnabled` | `ac` | `'1'` / absent | `false` | Whether accrual is modelled at all. |
| `accrualPerMonth` | `am` | number | `1.25` | Days credited per full month since `rangeStart`, capped at `budget`. Used by `accruedBy(date, rangeStart, budget, accrualPerMonth) = min(budget, monthsElapsed(rangeStart, date) * accrualPerMonth)`. |
| `expiryEnabled` | `ex` | `'1'` / absent | `false` | Whether a single reset/expiry date applies. |
| `expiryDate` | `xd` | ISO date | end of range | The one date past which only `carryoverCap` (plus any further accrual) is spendable. |
| `carryoverCap` | `cc` | number | `0` | Days allowed to carry past `expiryDate`. |
| `reserveDays` | `rv` | number | `3` | Kept off the usable budget as a UI-level buffer (`effectiveBudget = budget - reserveDays`); not part of the policy itself. |
| `unlimitedPto` | `up` | `'1'` / absent | `false` | Flat "treat budget as unlimited" flag; solver-level, not policy-level. |

This models **one** vacation/PTO bank, **one** accrual rate, **one** reset date, with no
concept of hours, pay periods, anniversary-vs-calendar year, waiting periods, negative
balances, or a starting balance as of a date — those are exactly the gaps Feature 1's model
(2.2) fills in.

### 2.2 The shared policy model (`src/policy/model.ts`)

A pure TypeScript module (no React, no DOM) used by **both** `/policy` and `/pto`. `/pto`'s
existing fields above become one projection of this richer model — not a fork of it:

```ts
type PolicyUnit = 'days' | 'hours';

type AccrualMethod =
  | { kind: 'front-loaded'; amount: number; grantDate: ISODate }
  | { kind: 'per-pay-period'; amount: number; frequency: 'weekly' | 'biweekly' | 'semi-monthly' | 'monthly'; payDateAnchor: ISODate }
  | { kind: 'per-hour-worked'; rate: number; typicalWeeklyHours: number }
  | { kind: 'unlimited'; expectedDaysPerYear: number };

type PlanYear =
  | { kind: 'calendar' }
  | { kind: 'anniversary'; startDate: ISODate }
  | { kind: 'custom'; resetDate: ISODate };

interface CarryoverRule {
  mode: 'none' | 'all' | 'capped';
  cap?: number;          // only for 'capped'
  useByDate?: ISODate;   // optional deadline distinct from the reset date itself
}

interface TimeOffPolicy {
  unit: PolicyUnit;
  hoursPerDay: number;            // default 8; only meaningful when unit === 'hours'
  accrual: AccrualMethod;
  planYear: PlanYear;
  accrualCap?: number;            // max balance; accrual pauses once reached
  carryover: CarryoverRule;
  waitingPeriodDays?: number;     // days can't be used before this many days of employment
  negativeBalanceAllowance: number; // 0 = can't go negative; >0 = can borrow up to this many
  payoutOnLeaving: 'pays' | 'doesnt' | 'not-sure'; // display-only, no legal claim (P4)
  currentBalance: number;
  balanceAsOf: ISODate;
  plannedDays: ISODate[];         // reuses DateListEditor
}
```

**Mapping to /pto's existing params**, so `/policy` and `/pto` describe the same policy and
old `/pto` links keep working unmodified:

| Policy model | /pto equivalent |
|---|---|
| `accrual.kind === 'per-pay-period'`, amount converted to a monthly rate | `accrualEnabled=1`, `accrualPerMonth` |
| `accrual.kind === 'front-loaded'` | `accrualEnabled=0` (full `budget` available from day one) |
| `planYear.kind === 'custom'`, `resetDate` | `expiryEnabled=1`, `expiryDate` |
| `carryover.mode === 'capped'`, `cap` | `carryoverCap` |
| `currentBalance` at `balanceAsOf` | `budget`, when `balanceAsOf === rangeStart` and no existing accrual |
| `plannedDays` | the existing pinned-days mechanism (`p=`) |

Fields `/pto` cannot yet represent (`unit`, `hoursPerDay`, `waitingPeriodDays`,
`negativeBalanceAllowance`, `payoutOnLeaving`, anniversary-year `planYear`, a `useByDate`
distinct from the reset date) are **additive**: `/pto`'s URL reader (`readSliderStateFromURL`
/ the accrual block in `urlState.ts`) is extended with new optional params that default to
today's behaviour when absent, so every existing `/pto?...` link parses to the exact same
`TimeOffPolicy` (and therefore the exact same solver input) it did before this feature. A
regression test loads a fixed set of pre-existing-style URLs and asserts the solver output is
byte-identical before and after this change (see Stage 2A test plan below).

### 2.3 Projection

`projectBalance(policy: TimeOffPolicy, horizonEnd: ISODate): { series: BalancePoint[]; events: PolicyEvent[] }`
walks day by day from `balanceAsOf` to `horizonEnd` (default horizon: 18 months), in the
policy's native unit (hours stay hours internally; rounding happens only at display time).
Events emitted: `accrual-credited`, `cap-reached` (carrying the accrual that would have been
credited but was lost), `reset`, `carryover-applied`, `forfeited` (days lost at reset beyond
the carryover rule), `carried-days-expiring` (when `useByDate` differs from the reset date),
`waiting-period-ended`, `planned-day-taken`.

## 3. Term list (Stage 3 data, named here so the engine and glossary agree on IDs)

`pto`, `vacation`, `sick-leave` (defined, explicitly out of scope — see §6), `personal-day`,
`floating-holiday`, `company-holiday`, `observed-holiday`, `bridge-day`, `accrual`,
`accrual-rate`, `pay-period`, `pay-frequency`, `front-loaded`, `accrual-cap`, `carryover`,
`use-it-or-lose-it`, `forfeiture`, `payout`, `plan-year`, `anniversary-year`, `pro-rated`,
`waiting-period`, `negative-balance`, `blackout-period`, `notice-period`, `unlimited-pto`,
`sabbatical`, `unpaid-leave`, `leave-of-absence`, `pto-request`. Aliases per term are recorded
in `docs/VOCABULARY.md` (Stage 2D) and the glossary data itself (Stage 3A) once built.

## 4. /policy page layout (mobile first)

### 375px (single column, reading order = handbook order)

```
┌─────────────────────────────┐
│ Your time-off policy,        │
│ in plain English             │
├───────────────────────────────┤
│ [ Paste your handbook text ]  │  (Stage 4C, collapsed by default)
├───────────────────────────────┤
│ How you get days              │
│  ( ) Front-loaded              │
│  ( ) Per pay period             │
│  ( ) Per hour worked            │
│  ( ) Unlimited                  │
│ ...fields for the chosen kind   │
├───────────────────────────────┤
│ How much · When it resets       │
│ Limits · Leaving                │
├───────────────────────────────┤
│ "Your policy, in plain English" │
│ 3–6 sentences                   │
├───────────────────────────────┤
│ Balance chart (scrolls)         │
├───────────────────────────────┤
│ Alerts (ranked by days at stake)│
│  → each with an action into /pto│
├───────────────────────────────┤
│ Questions to ask HR  [Copy]     │
├───────────────────────────────┤
│ Export row: .ics · image · link │
└───────────────────────────────┘
```

### 1440px (two columns: inputs left ~40%, output right ~60%, sticky on scroll)

```
┌───────────────┬─────────────────────────────┐
│ How you get    │ Your policy, in plain English│
│ days           │ ──────────────────────────── │
│ How much       │ Balance chart                 │
│ When it resets │ ──────────────────────────── │
│ Limits         │ Alerts → actions into /pto     │
│ Leaving        │ ──────────────────────────── │
│ [paste text]   │ Questions to ask HR            │
│                │ Export row                      │
└───────────────┴─────────────────────────────┘
```

## 5. Edge cases (drive the Stage 2C test list)

Hours vs days; part-time hours/day; per-hour-worked accrual; anniversary vs calendar vs
custom-date plan year; mid-year start (pro-rating); waiting period; negative balance
(borrowing); unlimited/"flexible" PTO; a cap reached mid-period; a carryover use-by date that
differs from the reset date; leap years inside the projection window; pay-period anchors that
don't align with month boundaries; a current balance entered as of a date in the past.

## 6. Scope

**In**: one vacation/PTO bank, computed forward from the user's own stated terms.

**Out** (said explicitly in the UI, not silently dropped):
- Separate sick-leave banks — often set by statute, not employer policy; a later Understand
  feature.
- State/country-specific legal rules (e.g. which jurisdictions mandate payout, or ban
  use-it-or-lose-it) — P4 forbids asserting these without a primary source per jurisdiction.
  Where a term varies by law, the copy says "this varies by where you work — check your
  state or country's labor department" rather than guessing.
- Pay and benefits (salary, health insurance, etc.) — separate Understand features.
- Parsing/interpreting pasted handbook text beyond literal glossary-term matching (Stage 4C
  highlights matches; it never infers or auto-fills values).

## 7. Test plan

- Unit tests for `projectBalance` covering every item in §5, with hand-verified arithmetic in
  comments (Stage 2C).
- The seven acceptance scenarios S1–S7 from the run prompt, each as a real test asserting the
  generated alerts, the /pto hand-off URL, and (for S7) that pasting text never changes the
  URL or persists after reload.
- A regression test: a fixed list of pre-existing-style `/pto?...` URLs produces byte-
  identical solver output before and after the urlState.ts extension (Stage 2A).
- Readability scoring test for every glossary `short`/`long` field (Stage 3D): fail above
  grade 10, warn above grade 8.
- Round-trip test: for each acceptance scenario, build the URL, reload it, assert identical
  output (Stage 6).

## 8. Copy rules and vocabulary

Grade ~8 reading level (P5); acronyms spelled out on first use; one word per concept — see
`docs/VOCABULARY.md` for the chosen word and its banned alternatives. Never use employer
framing (P1) or "entitled to" / "should" / "must" / "legally" language (P4) outside a sourced,
dated legal statement.
