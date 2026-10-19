# PTO Optimizer

A client-side tool that turns a PTO budget and a public holiday calendar into
the best set of long weekends and bridges. Everything runs in the browser —
no backend, no database, no auth, no API keys, no environment variables. The
only network calls are to [Nager.Date](https://date.nager.at) for public
holidays (cached in `localStorage` after the first fetch, degrading
gracefully — see below — if it's unreachable) and to
[Plausible](https://plausible.io) for cookieless analytics (see Privacy).

**Live features**, beyond the solver itself:

- A shareable URL that encodes the full input state — the same link
  reproduces the same plan for anyone, any time (`src/ui/urlState.ts`).
- Export: download an `.ics` calendar file, copy a 1200×630 share image, or
  copy per-break request text (a plain date list or a manager email draft)
  for HR.
- A "share my days" partner-overlap link: a minimal URL carrying just your
  resulting days off, which prefills as the recipient's overlap days.
- Country landing pages at `/uk`, `/canada`, `/australia`, `/germany`,
  `/ireland`, `/india` — the same app with a country preset and its own
  `<title>`/meta description (`vite.config.ts`'s multi-page build).
- Dark mode, following the system preference only (no manual toggle) — see
  `src/index.css`'s CSS custom properties.

## Running it

```bash
npm install
npm run dev    # dev server
npm test       # vitest
npx tsc --noEmit   # typecheck
npm run build  # production build — emits the main app plus all six country pages
npm run lint   # oxlint
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
| `country?` | `string` | ISO country code — selects the travel-demand index (US has real TSA data; everything else gets a generic "Estimated" fallback) |
| `w?` | `number` | 0–100 (step 10). 0 = maximise days off, ignore travel demand. 100 = minimise travel demand, accept fewer days off. Default 30 |
| `breakCount?` | `number` | 0–7. 0 = unconstrained. 1–6 = target exactly that many breaks (falls back to the nearest achievable count). 7 = maximise break count. Default 0 |

### Output (`SolveResult`)

```ts
{
  primary: Break[];           // the chosen plan, chronological, non-overlapping
  alternatives: Alternative[]; // up to 2 near-equal-value swaps per primary break
  breakCountRequested: number;
  breakCountActual: number;   // may differ from requested if that exact count was infeasible
  budgetSpent: number;        // always the max spendable for the current (w, breakCount) - never leaves budget on the table
}
```

Each `Break` is one chosen trip:

```ts
{
  start: string;        // first day of the break, inclusive
  end: string;           // last day, inclusive
  days: string[];        // every date in the break
  totalDaysOff: number;  // days.length
  ptoCost: number;       // workdays actually spent as PTO inside the break
  multiplier: number;    // totalDaysOff / ptoCost, rounded to 2 decimals
  tags: BreakTag[];      // 'Peak travel' | 'Low travel demand' | 'Estimated' | 'Overlaps'
  meanDemand: number;    // mean travel-demand index across the break, 1.0 = an average day
}
```

### Algorithm

Weighted interval scheduling under a budget and a break-count target, not a
greedy search:

1. Classify every day in the range as off (weekend per `workWeek`, holiday, or
   already booked) or working. `blackouts` always force a day to "working",
   overriding everything else.
2. Enumerate every `[start, end]` candidate whose endpoints are both off days.
   The per-candidate PTO-cost cap is derived from the caller's own budget
   (`min(budget, n)`, or `budget1 + budget2` across both expiry windows when
   `expiryDate` is set) — never a fixed constant. An earlier fixed cap of 10
   workdays was the root cause of a real bug (a 15-PTO-day request silently
   capped at 10); see `NOTES.md` Phase 11/12 for the full writeup.
3. Sort candidates by end date and run a 3D DP — `dp[i][b][c]` = best value
   using the first `i` candidates, exactly `b` PTO days spent, exactly `c`
   breaks chosen — with the standard non-overlapping recurrence. Indexing by
   *exact spend* (not *remaining budget*) is what makes the accrual rule a
   one-line check (below); indexing by *exact break count* is what makes
   `breakCount` a target rather than a post-hoc filter.
4. Reconstruct the chosen, non-overlapping candidates from the DP table.

Tie-breaks (spent-first → value → earliest start → fewest breaks) are carried
as part of each DP cell's state via `betterCell`, not resolved after the
fact, so the result is byte-identical across repeated runs on the same input
— this is also what makes `w` a continuum rather than a discontinuous jump:
every candidate's value blends days-off against travel demand by the same
formula, weighted by `w`.

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
  browser locale (or from the country landing page's preset — see below),
  sensible defaults are applied, and a plan is solved and rendered
  immediately — there's no empty state, no onboarding modal, no cookie
  banner.
- The calendar's day-off "band" (the rounded strip behind a continuous run of
  off days) is computed once per render from the full solved range, then
  sliced per calendar week so a run crossing a week boundary draws one
  full-width segment per row, rounded only at the ends that are the *true*
  start/end of the run.
- Clicking a day (mouse) cycles it through default → force-include (free day
  off, like a company holiday) → force-exclude (blackout) → default,
  re-solving each time. On touch, a tap opens an info tooltip with an
  explicit "Toggle this day" button first, rather than toggling blind.
- A `CalendarErrorBoundary` wraps just the calendar grid, so a render crash
  there doesn't take the rest of the page down with it.
- Invalid input (end date before start, a negative or wildly oversized PTO
  budget, an expiry date outside the selected range — see
  `src/ui/validation.ts`) freezes the plan on the last successfully-solved
  result instead of re-solving against nonsense, with an inline banner
  explaining what to fix.
- If the public-holiday API is unreachable, `getHolidaysWithStatus` degrades
  to cached data (if any) or weekends alone, and says so inline — it never
  just silently shows "no holidays" as if that were a fact about the
  calendar.

## Deploy

Static site, no backend, no environment variables or secrets. Works on
Vercel, Netlify, or any static host.

1. Connect the repository to Vercel or Netlify (import the repo; both
   auto-detect the Vite build — `npm run build`, output directory `dist`).
   `vercel.json` / `netlify.toml` in this repo pin that down explicitly.
2. Set a custom domain in the host's dashboard.
3. **Update the placeholder domain.** `index.html`, each
   `<country>/index.html`, `public/robots.txt`, and `public/sitemap.xml` all
   reference `https://pto-optimizer.app` for the canonical URL, Open Graph /
   Twitter Card tags, and the sitemap — there's no real domain yet, so these
   need a find-and-replace for the actual one once it's live.
4. Every push to the connected branch redeploys automatically — no CI step
   needed beyond what the host runs itself.

No API keys: the Nager.Date holiday lookup and the Plausible analytics
script both work with zero configuration.

## Privacy

No personal data is collected by this app. Everything — the solver, your
inputs, your plan — runs entirely in your browser and is never sent
anywhere. Analytics (Plausible) are cookieless: no cookies are set, no
cross-site identifier is stored, and visitor counts are derived from a
rotating, salted daily hash that's discarded after 24 hours — which is why
no cookie-consent banner is shown. The only other network calls are to
Nager.Date, to fetch public holidays for the country you select.

## License

MIT — see [LICENSE](LICENSE).
