# PTO Optimizer

A client-side tool that turns a PTO budget and a public holiday calendar into
the best set of long weekends and bridges. Everything runs in the browser —
no backend, no database, no auth, no API keys. The only network call is to
[Nager.Date](https://date.nager.at) for public holidays, and that's cached in
`localStorage` after the first fetch.

## Running it

```bash
npm install
npm run dev    # dev server
npm test       # vitest
npx tsc --noEmit   # typecheck
npm run build  # production build
```

## Architecture

```
src/solver/   pure TypeScript, zero React/DOM imports — the scheduling engine
src/data/     holiday fetching (Nager.Date) + a static country/subdivision list
src/ui/       everything React — state, calendar rendering, controls
```

`src/solver` is intentionally isolated so it can be tested and reasoned about
without a browser. It never calls `Date.now()`, never uses `Math.random()`,
and never parses a date string with the locale-sensitive `new Date(string)`
constructor — all date arithmetic happens in UTC on `YYYY-MM-DD` strings via
`src/solver/dateUtils.ts`.

## Solver contract

### Input (`SolveInput`, see `src/solver/types.ts`)

| Field | Type | Meaning |
|---|---|---|
| `offDays` | `string[]` | Dates already off for free (public/company holidays, pre-booked PTO) |
| `rangeStart`, `rangeEnd` | `string` | Inclusive `YYYY-MM-DD` window to solve over |
| `budget` | `number` | Total PTO days available over the whole range |
| `accrualPerMonth?` | `number` | If set, PTO becomes available gradually instead of all at once |
| `expiryDate?` | `string` | If set, splits the range into two budget windows (see below) |
| `carryoverCap?` | `number` | Max PTO that survives past `expiryDate`, into window 2 |
| `blackouts?` | `string[]` | Dates that can never be PTO, even if they'd otherwise be off |
| `overlapDays?` | `string[]` | Someone else's days off; breaks touching these get a small value bonus and an `Overlaps` tag |
| `workWeek?` | `[boolean×7]` | Monday→Sunday, `true` = normally a working day. Defaults to Mon–Fri |
| `objective?` | `Objective` | `'most-days-off' \| 'one-long-trip' \| 'spread-out' \| 'avoid-peak'`. Defaults to `'most-days-off'` |

### Output (`Break[]`)

Each `Break` is one chosen trip, in chronological order:

```ts
{
  start: string;        // first day of the break, inclusive
  end: string;           // last day, inclusive
  days: string[];        // every date in the break
  totalDaysOff: number;  // days.length
  ptoCost: number;       // workdays actually spent as PTO inside the break
  multiplier: number;    // totalDaysOff / ptoCost, rounded to 2 decimals
  tags: string[];        // exactly one of "Peak pricing" / "Low travel demand", plus "Overlaps" if relevant
}
```

### Algorithm

Weighted interval scheduling under a budget, not a greedy search:

1. Classify every day in the range as off (weekend per `workWeek`, holiday, or
   already booked) or working. `blackouts` always force a day to "working",
   overriding everything else.
2. Enumerate every `[start, end]` candidate whose endpoints are both off days
   and whose interior workday count ("PTO cost") is 1–10.
3. Sort candidates by end date and run a 2D DP — `dp[i][b]` = best value using
   the first `i` candidates with exactly `b` PTO days spent — with the
   standard non-overlapping recurrence. Indexing by *exact spend* rather than
   *remaining budget* is what makes the accrual rule a one-line check (below).
4. Reconstruct the chosen, non-overlapping candidates from the DP table.

Tie-breaks (earliest start → fewest breaks → lowest cost) are carried as part
of each DP cell's state, not resolved after the fact, so the result is
byte-identical across repeated runs on the same input.

Each `objective` only changes the per-candidate value function the DP
maximizes — the DP itself is unchanged:

- **most-days-off** — `value = length`
- **one-long-trip** — `value = length²`. Squaring rewards concentrating
  budget into one big interval over splitting it across several (sum of
  squares < square of the sum for a fixed total length), and any leftover
  budget still gets spent on whatever's left, since the DP always prefers
  spending positive-value budget over leaving it idle.
- **spread-out** — `value = 1` if `length ≥ 4` else `0`, maximizing the
  *count* of qualifying long weekends rather than total days off.
- **avoid-peak** — `value = length − 2 × peakDaysInside`, where peak windows
  (US Thanksgiving week, Dec 20–Jan 2, mid-March–mid-April, Jul 1–7) are
  hardcoded, not fetched from anywhere.

### Expiry windowing

When `expiryDate` is set, the range is split into two budget pools instead of
one:

- **Window 1** (`rangeStart` → `expiryDate`, inclusive of `expiryDate`):
  budget = PTO accrued by `expiryDate` (or the full `budget`, if accrual is
  off).
- **Window 2** (the day after `expiryDate` → `rangeEnd`): budget =
  `carryoverCap` + anything accrued after `expiryDate`.

A single break that crosses the boundary charges each of its workdays to
whichever window that calendar day falls into — a 9-day bridge with 2
workdays before expiry and 2 after costs 2 against window 1 and 2 against
window 2, independently. Internally this means the DP tracks a budget *pair*
`(b1, b2)` instead of a single number when `expiryDate` is set, with a
candidate's cost split into `cost1`/`cost2` at generation time.

### Accrual

`accruedBy(date)` is linear: `accrualPerMonth × full months elapsed since
rangeStart`, capped at `budget`. Because the DP is indexed by exact
cumulative spend, enforcing "you can't spend what you haven't earned yet" is
just: a candidate can only be chosen into budget column `b` if
`b ≤ accruedBy(candidate.end)`.

## Holiday data (`src/data/holidays.ts`)

- Fetches `https://date.nager.at/api/v3/PublicHolidays/{year}/{countryCode}`,
  one request per country-year, cached in `localStorage` indefinitely (never
  re-fetched once cached). Every `localStorage` access is wrapped in
  `try/catch` independently — a throwing or unavailable `localStorage` just
  means re-fetching, not a crash.
- A date range spanning multiple years fetches each year it touches.
- US/GB/CA/AU holidays landing on a weekend are shifted to the observed
  weekday ourselves (Saturday → Friday, Sunday → Monday), since Nager.Date's
  own shifting is unreliable. `Holiday.date` is the observed date;
  `Holiday.nominalDate` is what the API actually returned.
- Holidays with a `counties` field (state/region-specific — the UK and US
  don't have one national calendar) are excluded unless a matching
  subdivision is passed in.

## UI notes

- Single screen, no wizard. On first load the country is guessed from the
  browser locale, sensible defaults are applied, and a plan is solved and
  rendered immediately — there's no empty state.
- The calendar's day-off "band" (the rounded light-teal strip behind a
  continuous run of off days) is computed once per render from the full
  solved range, then sliced per calendar week so a run crossing a week
  boundary draws one full-width segment per row, rounded only at the ends
  that are the *true* start/end of the run.
- Clicking a day cycles it through default → force-include (free day off,
  like a company holiday) → force-exclude (blackout) → default, re-solving
  each time. That's the only interaction, by design.
