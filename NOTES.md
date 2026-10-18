# Phase 4 — Verification & Review

`npx vitest run` → 64/64 passing. `npx tsc --noEmit` → clean. `npm run build` → clean.

Screenshots: [docs/screenshots/full-year-1440.jpg](docs/screenshots/full-year-1440.jpg), [docs/screenshots/full-year-375.jpg](docs/screenshots/full-year-375.jpg).

---

## Verification checklist — actual observed results

Every item below was checked live in the running app (via direct DOM/computed-style
inspection, not just a screenshot), and the real numbers/values are recorded, not just
"done".

**1. "Single days" with 5 PTO days returns 5 separate single-day breaks, never a block.**
Observed. Set PTO days to 5, selected "Single days", read the break-card list:
```
2026-10-19 → 2026-10-19  1 day off for 1 PTO day  1.00x
2026-10-20 → 2026-10-20  1 day off for 1 PTO day  1.00x
2026-10-21 → 2026-10-21  1 day off for 1 PTO day  1.00x
2026-10-22 → 2026-10-22  1 day off for 1 PTO day  1.00x
2026-10-23 → 2026-10-23  1 day off for 1 PTO day  1.00x
```
Five separate `Break` objects, each `start === end`. They happen to be five
calendar-consecutive weekdays, but each is its own 1-day break, not one 5-day block.

**2. Switching between all five chips visibly changes the plan each time.**
Partially observed — one pair ties. With the real default app state (country United
States, range Oct 18 – Dec 31 2026, 15 PTO days), four of the five transitions produce
visibly different plans, but **"Most days off" and "Avoid peak travel" produce an
identical plan**:
```
Most days off:     Oct18-25 (8/3), Nov7-15 (9/4), Nov21-29 (9/4), Dec19-27 (9/4)
Avoid peak travel: Oct18-25 (8/3), Nov7-15 (9/4), Nov21-29 (9/4), Dec19-27 (9/4)   <- identical
One long trip:     Oct23-Nov8 (17/10), Nov26-29 (4/1), Dec19-27 (9/4)
Long weekends:     Nov8-11 (4/2), Nov26-28 (3/1)
Single days:       15 separate 1-day breaks
```
This is not a bug - it's the direct, confirmed consequence of a decision made earlier
in this project: the demand index is built from real, honestly-smoothed 2025 TSA
throughput, and **no single day in that dataset crosses the 1.25 "high demand"
threshold** (the real peak is ~1.22, a summer Sunday). Over the Oct–Dec window, the
`avoid-peak` penalty term (`highDemandDayCount`) is 0 everywhere, so its value function
is mathematically identical to `most-days-off`'s. I verified the two objectives *do*
diverge given an input that actually spans a high-demand window (e.g. Dec 20–Jan 2 for
a non-US country, where the generic estimate does cross 1.25) - see the Phase 1 report
and the `solve.test.ts` "the five modes produce five visibly different plans" test,
which deliberately uses such a range. I'm reporting the literal default-state result
here rather than silently substituting a friendlier input.

**3. A month with no suggestions renders with no bands.**
Observed. With PTO days = 5 and the range widened to the full year, breaks landed only
in January, October, and November. Band-element count per month, read from the DOM:
```
Jan 2026: 2   Feb: 0   Mar: 0   Apr: 0   May: 0   Jun: 0
Jul: 0        Aug: 0   Sep: 0   Oct: 3   Nov: 2   Dec: 0
```
Nine of twelve months show exactly 0 band elements, despite several of them (e.g. June,
August) containing ordinary weekends.

**4. A 9-day run crossing a week boundary renders as 2 segments, not 1 and not vertically joined.**
Observed, in two variants:
- With the grid forced to Monday-first, the `2026-10-17 → 2026-10-25` (9-day) run
  rendered as exactly 2 band segments, with a measured 10px gap between them
  (`bottom` of segment 1 = top of segment 2 − 10px). This is the literal scenario the
  spec describes.
- With the default US (Sunday-first) grid, the *same* 9-day run actually spans **3**
  calendar rows (1 + 7 + 1 days), because Oct 17 lands in the last column of its row
  under that convention. It correctly rendered as 3 segments with clean 10px gaps
  between all of them - still never joined, just a different (also-valid) split than
  the spec's 2-segment example. I'm reporting both because the live app's default
  state produces the 3-segment case, and I don't want to quietly only report the
  example that matches the spec's wording.
- Unit tests (`calendarMath.test.ts`) cover the canonical 2-segment case directly,
  asserting `roundedLeft`/`roundedRight` on each segment independently.

**5. Selecting United States puts Sunday in the first column; selecting Germany puts Monday there.**
Observed directly:
```
US labels: ["Su","Mo","Tu","We","Th","Fr","Sa"]
DE labels: ["Mo","Tu","We","Th","Fr","Sa","Su"]
```

**6. Tab reaches every day cell; arrow keys move within a month; the marginal value is announced.**
Observed. All 365 day-cell buttons in the current view have `tabIndex === 0` and none
are `disabled` (0 excluded). `ArrowRight` from `day-2026-01-06` moved focus to
`day-2026-01-07`. A sampled eligible cell's `aria-label`:
`"January 6, working day, gains 1 day off"` - the marginal value is part of the
accessible name, so it's announced on focus, not just visible on hover.

**7. At 375px there is no horizontal page scroll and tap surfaces the day's value.**
Observed. At a 375px viewport: `document.documentElement.scrollWidth === window.innerWidth === 375`
(no overflow). Emulating a touch-only device (`matchMedia('(hover: hover)').matches === false`,
confirmed via the mobile viewport preset, which genuinely changes this media query),
tapping an eligible day did **not** toggle it - `aria-label` before and after the tap
were identical - and instead opened a tooltip reading
`"+1 day off for 1 PTO day (1.0x) — the suggestions above do better."` with an explicit
`"Toggle this day"` button inside it. Tapping that button performed the toggle.

**8. Identical inputs produce identical output across repeated solves.**
Observed. Ran the same `SolveInput` through `solve()` 200 times in isolation:
`unique outputs across 200 runs: 1`. This is additionally covered by the dedicated
`it.each` 100-run determinism test per objective in `solve.test.ts`, and by a separate
alternatives-determinism test.

---

## Review

### Deviations from the spec, and why

- **1A root cause.** The spec frames the bug as the length constraint "not being
  enforced." In isolation, the solver's pre-DP filter was already correct - passing
  `minBreakLength: 1, maxBreakLength: 1` directly to `solve()` reliably returned 5
  separate single-day breaks, not a block. The actual defect was architectural: the old
  UI let the objective chip and the shape dropdown be set independently, so
  `most-days-off` + `single-days` could be selected together and silently contradict
  each other. 1B's merge (one chip row, five atomic modes, each with its own
  non-overridable length bounds for `long-weekends`/`single-days`) fixes this by
  construction rather than by patching the filter itself, since the filter wasn't
  actually broken.

- **2B root cause.** The spec diagnoses the vertical-merge bug as "the renderer...
  treating grid adjacency as date adjacency." I did not find that bug - the segment
  computation (`computeBandSegments`) was already correctly date-driven, per-row, with
  no grid-position logic at all. The actual cause was a CSS rendering artifact from an
  earlier session: bands used a negative vertical margin (`-my-1`) to look "taller",
  which bled 4px into the 6px inter-row gap on each side; two adjacent rows' bands in
  the same column overlapped by 2px and visually fused. Fixed by removing the negative
  margin (bands now sit flush inside their own row's box) rather than by changing the
  date-adjacency algorithm, which didn't need changing.

- **"All in one trip" and "Week-long breaks" presets are gone, not just the dropdown.**
  1B's five-mode list doesn't include them. The underlying `maxBreaks` solver capability
  is still implemented and tested (`maxBreaks hard cap` in `solve.test.ts`), just not
  exposed through any control now that the dropdown is deleted.

- **Custom min/max for "Most days off" is opt-in, not always-on.** I added a "Limit
  break length" checkbox in More Options, defaulting off (so "Most days off" genuinely
  means "any break length" by default, matching its own description in the spec). The
  spec says to move the controls into More Options but doesn't say whether they should
  be always-active; gating them behind an explicit toggle seemed the more conservative
  reading, consistent with "Most days off" being the unconstrained mode by default.

### Ambiguous spec items I had to guess at

- **"Hover-value ramp" (3.2).** I interpreted this as a legend entry explaining the
  hover/focus marginal-value feature ("Hover or focus a day to see what it would
  gain"), not a visual color-ramp/heatmap overlay on the calendar grid itself. No other
  part of the spec describes such a visual ramp, so I didn't build one. If a literal
  gradient-coded ramp was intended, that's unbuilt.

- **The aria-label example in 3.6** (`"January 5, suggested PTO day, gains 4 days
  off"`) pairs a day's *current* state ("suggested PTO day") with a *hypothetical*
  marginal gain, but marginal value is only defined for days that **aren't** yet
  suggested (3.0: "Skip blackouts, already-suggested days..."). An already-suggested
  day has no marginal value to report by this definition. I read the example as
  illustrative of the general shape (date + state + value-when-applicable) rather than
  a literal string to reproduce, and implemented: holiday name for holidays, marginal
  gain for not-yet-suggested eligible workdays, state only for everything else
  (including already-suggested PTO days). I'm not fully confident this is what was
  intended - the literal example can't occur under my model.

- **"Clearly worse than the plan" threshold (3.0).** The spec gives exactly one
  example (`1.0x` triggers the caveat) and no formula. I used `multiplier <= 1` as the
  threshold, which matches the one given example precisely but is my own
  extrapolation, not a specified rule.

- **Which countries are Sunday-first (3.1).** The spec names US, Canada, Japan
  explicitly; I implemented exactly that allowlist. Several other countries in the
  picker (parts of Latin America, the Middle East, South Asia) also conventionally use
  Sunday-first calendars in real life, but since the spec only named three, I didn't
  extend the list speculatively. This is a real completeness gap if the picker's full
  country list was meant to be covered generally rather than just the three named
  examples.

### Things I'm not confident are fully correct

- **Scheme B's specific hex values** (`blue-900` / `amber-200`) satisfy "deep
  neutral-blue" and "warm positive" and pass the contrast math I ran, but they're my
  own choice within that description, not something I could validate against real
  design or user-testing feedback. The spec explicitly asks to default to B "unless A
  clearly tests better" - I have no testing data either way; I'm using the directional
  reasoning already in the spec itself ("coral currently reads as a warning"), not
  actual comparative evidence.

- **`(hover: hover)` as the touch/mouse detector (3.7).** This is the standard,
  spec-recommended technique, but it detects device *capability*, not which input the
  user is about to use in the moment. A touchscreen laptop with both a trackpad and a
  touchscreen will report `hover: true` and get the desktop click-to-toggle flow even
  when the user is tapping the screen. I believe this is an acceptable, well-understood
  limitation of the technique rather than a bug, but it's not something I could fully
  verify across real hybrid hardware in this environment.

- **Date-input locale formatting (3.1).** Verified live that the `lang` attribute on
  the native `<input type="date">` does **not** change the displayed format in this
  Chromium-based environment - switching the country to Germany kept `MM/DD/YYYY`.
  This is a genuine, known cross-browser inconsistency (Firefox and Safari do respect
  per-element `lang` for this; Chromium uses its own browser/OS locale instead,
  regardless of the element's `lang`). The `lang` attribute is still the
  standards-correct thing to set, and it may work correctly for users on Firefox/Safari
  or with a non-English browser locale, but I can't claim it works as the spec
  describes ("Date input format follows the same locale") in the browser I tested in. A
  full fix would mean replacing the native date input with a custom-formatted one,
  which I judged to be disproportionate scope for one sub-bullet of 3.5/3.1; I flagged
  the limitation instead of silently shipping a claim I'd just disproven.

- **A methodology note, not an app bug:** repeatedly during this phase, synthetic DOM
  events dispatched from test scripts (`element.focus()`, `dispatchEvent(new
  MouseEvent('mouseenter'))`) did not reliably trigger React's event handlers in this
  particular browser-automation environment, while the same interactions performed via
  real OS-level input (the `computer` tool's mouse hover) always worked correctly. Every
  time I hit this, I re-verified with a real interaction before concluding anything was
  broken - e.g. the "holiday name doesn't show on focus" dead end during this session's
  testing turned out to be exactly this, confirmed by a real mouse hover showing the
  tooltip correctly. I'm noting this so a false "regression" isn't inferred from a
  future automated test using the same synthetic-event approach.

### 1A: pre-filter vs post-filter — the actual code

The length constraint is applied while **building the candidate set**, before the DP
ever runs over it - never as a filter on the DP's chosen result. From
`src/solver/solve.ts`:

```ts
function buildCandidates(
  days: ISODate[],
  isOff: boolean[],
  isBlackout: boolean[],
  overlapSet: Set<string>,
  expiryDate: ISODate | undefined,
  country: string | undefined,
  minLength: number,
  maxLength: number,
): Candidate[] {
  const n = days.length;
  const candidates: Candidate[] = [];

  for (let i = 0; i < n; i++) {
    if (!isOff[i]) continue;
    let cost = 0;
    let cost1 = 0;
    let cost2 = 0;
    let overlapDayCount = 0;
    let demandSum = 0;
    let highDemandDayCount = 0;
    for (let j = i; j < n; j++) {
      const dISO = days[j];
      if (isBlackout[j]) break;
      if (!isOff[j]) {
        cost++;
        if (cost > MAX_CANDIDATE_COST) break;
        if (!expiryDate || dISO <= expiryDate) cost1++;
        else cost2++;
      }
      if (overlapSet.has(dISO)) overlapDayCount++;
      const demand = demandFor(dISO, country).value;
      demandSum += demand;
      if (demand >= HIGH_DEMAND_THRESHOLD) highDemandDayCount++;
      const length = j - i + 1;
      // <-- the length constraint: a candidate is only ever created if it already
      //     satisfies [minLength, maxLength]. A too-short or too-long interval is
      //     never added to `candidates`, so the DP that runs afterwards never sees it
      //     and can never choose it. There is no step anywhere that takes the DP's
      //     output and drops/replaces entries that violate the bound.
      if (isOff[j] && cost >= 1 && length >= minLength && length <= maxLength) {
        candidates.push({ startIdx: i, endIdx: j, start: days[i], end: dISO, length, cost, cost1, cost2, overlapDayCount, demandSum, highDemandDayCount });
      }
    }
  }
  // ... standalone single-day candidates, also gated by `minLength <= 1 && maxLength >= 1`
  return candidates;
}
```

And the bounds themselves are resolved once, per objective, before candidates are built
at all:

```ts
function resolveLengthBounds(input: SolveInput): { min: number; max: number } {
  switch (input.objective ?? 'most-days-off') {
    case 'long-weekends':
      return { min: 3, max: 4 };
    case 'single-days':
      return { min: 1, max: 1 };
    case 'most-days-off':
      return { min: input.minBreakLength ?? 1, max: input.maxBreakLength ?? Infinity };
    default:
      return { min: 1, max: Infinity };
  }
}
```

Call order in `solve()` - bounds resolved, candidates built with those bounds baked in,
*then* the DP runs over whatever survived:

```ts
const { min: minLength, max: maxLength } = resolveLengthBounds(input);

const candidates = buildCandidates(
  days, isOff, isBlackout, overlapSet, input.expiryDate, input.country,
  minLength, maxLength,
);
candidates.sort((a, b) => a.endIdx - b.endIdx || a.startIdx - b.startIdx);
if (candidates.length === 0) return { primary: [], alternatives: [] };

const budgetMax = Math.max(0, Math.floor(input.budget ?? 0));
const chosen = input.expiryDate
  ? solveDualWindow(candidates, input, objective)
  : solveSingleWindow(candidates, input, budgetMax, objective);
```

`solveSingleWindow`/`solveDualWindow` (the DP) only ever select from `candidates` - they
have no visibility into anything that was excluded by the length check, and there is no
subsequent step that inspects `chosen` and discards/replaces anything based on length.

---

# Phase 5 — Two sliders replace the objective chips

`npm test -- --run` → 82/82 passing (50 in `src/solver`). `npx tsc --noEmit -p
tsconfig.app.json` → clean. `npm run build` → clean.

The five named objectives and the break-shape dropdown are gone - deleted, not hidden.
`ObjectiveChips.tsx` no longer exists. In their place: a weighting slider (0-100, step
10, trades days off against travel demand) and a break-count slider (0-7, a true
cardinality constraint, not a length constraint). Both are live in
[TopBar.tsx](src/ui/TopBar.tsx), backed by [WeightingSlider.tsx](src/ui/WeightingSlider.tsx)
and [BreakCountSlider.tsx](src/ui/BreakCountSlider.tsx).

Screenshots, all taken live in the running app via the `computer` tool (real input
events, not synthetic DOM dispatch - see the Phase 4 methodology note above, which still
applies):
- [docs/screenshots/weighting-w0.jpg](docs/screenshots/weighting-w0.jpg) - w=0, same
  input as w=100 below. 32 days off, mean demand 1.02, four bridging breaks (9+1+9+...
  days each).
- [docs/screenshots/weighting-w100.jpg](docs/screenshots/weighting-w100.jpg) - same
  input, w=100. 15 days off (was 32), mean demand 0.87 (was 1.02), ten single-day
  breaks. The feedback-strip "(was ...)" comparison is visible in the screenshot itself.
- [docs/screenshots/breakcount-1.jpg](docs/screenshots/breakcount-1.jpg) - count=1 on a
  full 2026 US calendar, 15 PTO days: "1 break · about 17 days each".
- [docs/screenshots/breakcount-5.jpg](docs/screenshots/breakcount-5.jpg) - same budget
  and range, count=5: "5 breaks · about 7 days each".
- [docs/screenshots/breakcount-infeasible.jpg](docs/screenshots/breakcount-infeasible.jpg) -
  bonus: count=6 with budget dropped to 2. Caption reads exactly `"6 breaks isn't
  possible with 2 PTO days — showing 2"`, and the calendar still shows a real 2-break
  plan, never an empty one.

## Break count is a true cardinality dimension in the DP, not a post-filter or a length proxy

This is the central technical claim the spec asked me to prove, so here is the actual
DP code, verbatim, from [src/solver/solve.ts](src/solver/solve.ts):

```ts
interface CellState {
  value: number;
  breakCount: number;
  earliestStart: string | null;
}

const EMPTY_CELL: CellState = { value: 0, breakCount: 0, earliestStart: null };
const UNREACHABLE: CellState = { value: -Infinity, breakCount: -1, earliestStart: null };

interface CountDPTable {
  dp: CellState[][][];
  choice: ('skip' | 'take')[][][];
  m: number;
  cMax: number;
}

/**
 * dp[i][b][c] = best value using exactly c breaks and at most b budget from the first i
 * candidates. The budget dimension keeps its existing "at most" semantics (final answer
 * takes max over b <= budgetMax, same as the unconstrained DP); the count dimension is
 * EXACT, which is why its base row only seeds (b, 0) as reachable - (b, c>0) at i=0 is
 * genuinely impossible (0 candidates can't produce any breaks) and must stay UNREACHABLE,
 * not fall back to EMPTY_CELL, or "exactly c" would silently degrade into "at most c".
 */
function buildCountDP(candidates: Candidate[], input: SolveInput, budgetMax: number, w: number, cMax: number): CountDPTable {
  const m = candidates.length;
  const dp: CellState[][][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: budgetMax + 1 }, () =>
      Array.from({ length: cMax + 1 }, (_, c) => (i === 0 && c === 0 ? EMPTY_CELL : UNREACHABLE)),
    ),
  );
  const choice: ('skip' | 'take')[][][] = Array.from({ length: m + 1 }, () =>
    Array.from({ length: budgetMax + 1 }, () => new Array(cMax + 1).fill('skip')),
  );

  for (let i = 1; i <= m; i++) {
    const c = candidates[i - 1];
    const pRow = findCompatiblePrefix(candidates, i - 1);
    for (let b = 0; b <= budgetMax; b++) {
      for (let cnt = 0; cnt <= cMax; cnt++) {
        const skipState = dp[i - 1][b][cnt];
        let takeState: CellState | null = null;
        if (cnt >= 1 && c.cost <= b) {
          const prior = dp[pRow][b - c.cost][cnt - 1];
          let allowed = prior.value !== -Infinity;
          if (allowed && input.accrualPerMonth) {
            const accrued = accruedBy(c.end, input.rangeStart, input.budget, input.accrualPerMonth);
            if (b > accrued) allowed = false;
          }
          if (allowed) {
            takeState = {
              value: prior.value + candidateValue(w, c),
              breakCount: cnt,
              earliestStart: prior.breakCount === 0 ? c.start : prior.earliestStart,
            };
          }
        }
        if (takeState) {
          const best = betterCell(skipState, takeState);
          dp[i][b][cnt] = best;
          choice[i][b][cnt] = best === takeState ? 'take' : 'skip';
        } else {
          dp[i][b][cnt] = skipState;
          choice[i][b][cnt] = 'skip';
        }
      }
    }
  }

  return { dp, choice, m, cMax };
}
```

The `take` transition at `dp[i][b][cnt]` reads from `dp[pRow][b - c.cost][cnt - 1]` -
one fewer candidate index, one less budget, **one less count**. A candidate can only be
taken into a cell whose count dimension is exactly one more than the prior state's. There
is no step anywhere that takes a DP result computed without regard to count and then
drops or re-filters entries to match a target - the count constraint is load-bearing
inside every transition, exactly like the Phase 1 length constraint was load-bearing
inside `buildCandidates`. And it is a count, not a length: `Candidate.length` (the
break's calendar-day span) never appears in the count dimension's indexing or in the
`take` condition at all - only `cnt`, an integer tally of candidates chosen, does. A
9-day break and a 1-day break both increment `cnt` by exactly 1.

Three callers use this table for the three distinct semantics the slider positions need:

```ts
// position 0 ("Any") doesn't use buildCountDP at all - it's the original 2D
// dp[i][b] unconstrained solve, kept as-is and just given the new w-weighted value fn.
function solveSingleWindow(candidates: Candidate[], input: SolveInput, budgetMax: number, w: number): Candidate[] { /* ... */ }

// positions 1-6: exact target, falling back to the nearest reachable count
function solveExactCount(candidates, input, budgetMax, w, target) {
  const cMax = Math.min(EXACT_COUNT_SEARCH_CAP, budgetMax, candidates.length);
  const table = buildCountDP(candidates, input, budgetMax, w, cMax);
  // scan every reachable cnt in [0, cMax], pick the one closest to target
  // (full code: solve.ts:354-381)
}

// position 7 ("as many as possible"): maximise count, uncapped at the literal number 7
function solveMaxCount(candidates, input, budgetMax, w) {
  const cMax = Math.min(budgetMax, candidates.length);
  const table = buildCountDP(candidates, input, budgetMax, w, cMax);
  for (let cnt = cMax; cnt >= 0; cnt--) {
    const found = bestForExactCount(table, budgetMax, cnt);
    if (found) return { chosen: reconstructCountDP(candidates, table, found.b, cnt), achieved: cnt };
  }
  return { chosen: [], achieved: 0 };
}
```

**Deliberate deviation from the spec's literal state-space sizing.** The spec describes
the state space as "365 days × 60 budget × 8 counts," which reads as one fixed
`cMax = 7` table. I didn't build it that way, for two reasons that are both direct
consequences of requirements the spec itself states:

1. Position 0 ("Any") must be genuinely unconstrained - identical to a solve with no
   count limit at all, not "capped at 7." A `cMax = 7` table would silently turn "Any"
   into "at most 7," which is wrong whenever the true optimum uses 8 or more breaks (it
   routinely does once w pushes toward fragmentation - see the determinism test "every
   count works at every weighting value," which exercises exactly this). So position 0
   bypasses the count dimension entirely and uses the original unconstrained 2D DP.
2. Position 7 ("as many as possible") must truly maximise count, which can be far more
   than 7 on a generous budget - capping its own search table at `cMax = 7` would make
   "as many as possible" stop at 7 even when 12 are achievable. So `solveMaxCount` sizes
   its table to `min(budgetMax, candidates.length)`, not a fixed 7.

Only positions 1-6 (an exact numeric target that's always ≤ 6, or ≤ `EXACT_COUNT_SEARCH_CAP
= 20` once accounting for fallback search) actually run at something close to the
spec's literal "8 counts" table size. I judged this the correct reading of the spec's
*intent* (every position must behave as its own description says) over its *literal
sizing description*, and I'm flagging the deviation explicitly rather than silently
reinterpreting "365 × 60 × 8" as if it described all three code paths.

**Performance** ("solve instantly in the browser - verify this"): the dedicated
`performance` test (`solve.test.ts`) runs a full-year US solve at every one of 22
`(w, breakCount)` combinations and asserts each individual solve stays under 1000ms; the
whole test (22 solves) completes in 715ms, so each one is comfortably sub-50ms in
practice, not just under the 1s ceiling.

## Determinism

Unchanged in spirit from Phase 1: `w` is rounded to the nearest integer multiple of 10
and clamped to `[0, 100]`; `breakCount` is rounded to an integer and clamped to `[0, 7]`;
`candidateValue` computes `(100 - w) * length - w * demandDeviationScaled` as pure
integer arithmetic (`demandDeviationScaled` is itself a pre-rounded integer, computed
once per candidate at build time - see the scale-calibration note below); and `betterCell`
keeps the existing tie-break order (value, then earliest start, then fewest breaks)
unchanged. `it.each` covers 8 `(w, breakCount)` pairs at 100 runs each, plus the
original 100-run tie-break test - all byte-identical across runs.

## `DEMAND_DEVIATION_SCALE`: empirically calibrated, not derived

The spec gives the value formula's shape but not a scale constant for the demand term,
and gets its only concrete units from the `meanDemand` index itself, which deviates from
1.0 by roughly ±0.1 to ±0.3 in real TSA data. I tried the naive choice first
(`SCALE = 100`, so a deviation of ±0.1-0.3 contributes ±10-30 to a candidate's value) and
verified it against a real full-year US fixture at budget=25: w=30 and w=100 produced
**byte-identical, fully-fragmented 25-single-day plans**, while w=0 gave 8 proper
multi-day bridges. The demand term was dominating so hard that any nonzero w collapsed
immediately to full fragmentation - exactly the "false binary, instant jump" failure
mode the two-slider redesign was supposed to fix, just moved from the chips into the
weighting slider's own math.

I then tested `SCALE` ∈ {10, 15, 20, 30} against the same fixture (a small standalone
`tsx -e` script, swapping the constant between runs) and picked 10 for its visibly
gradual progression:

| w   | breaks | days off |
|-----|--------|----------|
| 0   | 8      | 59       |
| 20  | 9      | 59       |
| 30  | 12     | 54       |
| 50  | 24     | 34       |
| 70  | 25     | 31       |
| 100 | 25     | 25       |

This is the same empirical-calibration methodology used earlier in the project for the
demand index itself - test against real data, don't guess a constant. The reasoning and
the `SCALE=100` failure mode are both documented in-line as a comment on
`DEMAND_DEVIATION_SCALE` in `solve.ts`, not just here.

## Bug found and fixed during this phase: `solveExactCount` returned an empty plan on tight budgets

My first implementation of the nearest-achievable-count fallback searched *outward* from
the target (`target - delta`, `target + delta`, `delta` from 0 to `cMax`). When
`target` itself exceeds `cMax` - which happens whenever the budget caps the table below
the requested count, e.g. target=6 on a 2-PTO-day budget where `cMax` resolves to 2 -
every single candidate the outward search considers (`6±0` through `6±2`, i.e. 4, 5, 6,
7, 8) falls outside `[0, cMax]` and gets skipped, so the loop checks zero valid counts
and returns `{ chosen: [], achieved: 0 }`. Verified the bug directly:
`requested 6 actual 0 []` - a genuinely empty calendar, which the spec explicitly says
must never happen ("never an empty calendar, never an error state").

Fixed by scanning every count in `[0, cMax]` directly and tracking the minimum distance
to `target`, instead of walking outward from a point that may not even be reachable from
within the valid range:

```ts
let bestCnt = -1;
let bestDistance = Infinity;
for (let cnt = 0; cnt <= cMax; cnt++) {
  if (!bestForExactCount(table, budgetMax, cnt)) continue;
  const distance = Math.abs(cnt - target);
  if (distance < bestDistance || (distance === bestDistance && cnt < bestCnt)) {
    bestDistance = distance;
    bestCnt = cnt;
  }
}
```

Re-verified after the fix, both via a standalone script and live in the browser
(`docs/screenshots/breakcount-infeasible.jpg`): budget=2, breakCount=6 now correctly
returns a real 2-break plan and the caption reads `"6 breaks isn't possible with 2 PTO
days — showing 2"`. Covered by the dedicated test `"6 breaks on 2 PTO days degrades to
the nearest achievable count, never an empty calendar"` in `solve.test.ts`.

## Scope limitation: break count on the expiry/carryover path is a simple cap, not full exact/maximise semantics

`solveDualWindow` (used whenever `expiryDate` is set) takes `breakCountCap: number |
null` and only enforces `prior.breakCount + 1 <= breakCountCap` on each take-transition -
an upper bound, not the exact-target-with-nearest-fallback behaviour `solveExactCount`
gives, and not a true maximise for position 7 (position 7 passes `cap = null`, i.e.
unconstrained, same as position 0 - "as many as possible" and "Any" are
indistinguishable on this path). Positions 1-6 will never *exceed* the requested count
on this path, but may return *fewer* breaks than requested with no "isn't possible -
showing N" message, unlike the single-window path.

I judged a full 4D `dp[i][b1][b2][c]` DP (adding a count dimension on top of the
existing two-budget-window dual DP) disproportionate scope for this phase: expiry and
accrual are already an advanced, secondary combination (both flags are off by default),
and dual-window plus exact break-count together is a narrow intersection. The simple cap
at least guarantees the two invariants that matter most (never exceed the limit, never
silently ignore it entirely) without the 4D table's combinatorial cost. This is a
genuine gap against the spec's "same constraint, wherever it's used" framing, not
something I'm claiming full compliance on.

## Other notes

- The URL migration (`src/ui/urlState.ts`) maps every removed `objective` value to a
  `(w, breakCount)` pair rather than erroring: `most-days-off`→(0,0), `avoid-peak`→(90,0),
  `single-days`→(30,7), `long-weekends`→(30,7), `one-long-trip`→(20,1). An unrecognised
  legacy value (or none at all) falls back to the slider defaults (30, 0) rather than
  throwing. Covered in `urlState.test.ts`.
- The FAQ section (`src/ui/FAQ.tsx`) replaces the previously-specified standalone SEO
  explainer per this phase's explicit instruction not to ship both - there is no other
  explainer section on the page. Verified live: all 6 `<details>` answers are present in
  the DOM with `open === false` (confirmed via `document.querySelectorAll('details')`),
  so the content is indexable while collapsed; expanding one via a real click correctly
  reveals its answer with no modal or animation beyond the native disclosure toggle.
- "Briefly highlight which breaks moved" is implemented in `useAppState.ts` by diffing
  break IDs between solves whenever `w` or `breakCount` changes, and clearing the
  highlighted set after 2.5s; `BreakCard.tsx` takes a `highlighted` prop that applies a
  teal border/background with a CSS transition, rather than a JS-animated effect.

---

# Phase 6 — Bug fix: w was silently reducing how many PTO days got used

## The bug and its root cause

At w=100 with 15 PTO days available, the plan used about 2. The root cause, exactly as
diagnosed in the bug report: the value function was `(100 - w) * length - w *
demandPenalty`. At w=100 that's `0 * length - 100 * demandPenalty` - the days-off term
hit zero and every candidate's score became purely about demand. Since skipping a
candidate (leaving its PTO day unspent) scored exactly 0, and a candidate with even a
slightly-above-average demand day scored *negative*, the DP's genuine optimum was to take
almost nothing. The solver was correct; the objective hitting zero was the defect.

## The fix

Two independent changes, both required:

**1. Budget-maximization is now a hard DP constraint, not a value-function penalty.**
`CellState` gained a `spent` field, and `betterCell` - the one function every DP in
`solve.ts` uses to decide every skip/take choice - now compares `spent` *before* `value`:

```ts
interface CellState {
  value: number;
  /** Total PTO cost spent to reach this cell. The PRIMARY key in betterCell - see there. */
  spent: number;
  breakCount: number;
  earliestStart: string | null;
}

/**
 * Lexicographic cell comparison: spent first, then value, then earliest start, then
 * fewest breaks. `spent` is compared BEFORE `value` and never involves w - that's the hard
 * budget-maximization constraint the bug report asked for, implemented structurally rather
 * than as a value-function penalty. Two cells reachable at the same (candidates-so-far,
 * budget-so-far) step always rank by how much budget they've actually used first; only
 * once that's tied does the w-weighted value get consulted at all. This is what guarantees
 * "spends the same number of PTO days at every w" without needing to separately verify it
 * empirically - it's true by construction, because the comparison that decides every
 * skip/take choice in the DP can't see w until spend is already decided.
 */
function betterCell(a: CellState, b: CellState): CellState {
  if (a.spent !== b.spent) return a.spent > b.spent ? a : b;
  if (a.value !== b.value) return a.value > b.value ? a : b;
  const aStart = a.earliestStart ?? SENTINEL_START;
  const bStart = b.earliestStart ?? SENTINEL_START;
  if (aStart !== bStart) return aStart < bStart ? a : b;
  if (a.breakCount !== b.breakCount) return a.breakCount < b.breakCount ? a : b;
  return a;
}
```

Every `take` transition (in `solveSingleWindow`, `buildCountDP`, and `solveDualWindow`)
now threads `spent: prior.spent + c.cost` (or `c.cost1 + c.cost2` for the dual-window
path) through alongside `value`. No separate "spend the budget" pass or penalty term was
added - the spec explicitly warned against a wasted-budget penalty reintroducing the same
tuning problem, and this avoids that: spend simply outranks value in every comparison,
unconditionally.

**2. The days-off term can no longer be annihilated.** `(100 - w) * length` is replaced
by a fixed, w-independent `DAYS_OFF_WEIGHT * length`:

```ts
/**
 * value = DAYS_OFF_WEIGHT * length - w * demandDeviationScaled, both terms already
 * integers. DAYS_OFF_WEIGHT is fixed (never scaled by w), so the days-off term can never
 * be annihilated the way the old `(100 - w) * length` term was at w=100 - see
 * DAYS_OFF_WEIGHT's comment. w only scales how heavily the demand term counts against
 * that fixed weight.
 *
 * Despite the name, this is no longer the function that decides HOW MANY PTO days get
 * used or how many breaks result - see betterCell (spend is the primary, w-independent
 * key) and solveAny (break count, for the unconstrained position, is also decided before
 * w is consulted). candidateValue is now only the tertiary tiebreak: given an
 * already-fixed spend and break count, which exact candidates (which dates) fill it.
 */
function candidateValue(w: number, c: Candidate): number {
  const weighted = DAYS_OFF_WEIGHT * c.length - w * c.demandDeviationScaled;
  return weighted * VALUE_MULT + c.overlapDayCount;
}
```

## Break count, for "Any" (position 0), is now decided independently of w too

Spend being hard-maximized wasn't enough on its own: for the unconstrained break-count
position, the *number* of breaks used to spend the budget was still an emergent property
of the (now w-weighted) value function, so w could in principle still have shifted which
count got chosen, even with spend fixed. The acceptance test "w=0 and w=100 return the
same break count" needs that decided independently of w too, not just empirically
similar. `solveAny` does this as a deliberate two-phase split:

```ts
/**
 * Break-count slider position 0 ("Any"). Two-phase, so that w can only ever decide WHERE
 * breaks land, never HOW MANY breaks or how much budget gets used - both of those must be
 * identical across every w on the same input.
 *
 * Phase 1 finds the canonical break count by running the ordinary unconstrained DP with w
 * forced to 0. At w=0, candidateValue is pure `DAYS_OFF_WEIGHT * length` - no demand term
 * at all - so this phase answers only "how many breaks, structurally, best spend this
 * budget", and that answer is w-independent by construction (nothing here ever reads the
 * caller's real w).
 *
 * Phase 2 takes that exact count as a hard constraint and re-solves with the REAL w, using
 * the same spend-maximizing count-DP the explicit break-count slider positions already use
 * (buildCountDP). Because phase 1's count is guaranteed achievable - it's where phase 1
 * itself landed - this never needs solveExactCount's nearest-achievable fallback search.
 */
function solveAny(candidates: Candidate[], input: SolveInput, budgetMax: number, w: number): Candidate[] {
  const structural = solveSingleWindow(candidates, input, budgetMax, 0);
  const targetCount = structural.length;
  if (targetCount === 0 || w === 0) return structural;

  const table = buildCountDP(candidates, input, budgetMax, w, targetCount);
  const found = bestForExactCount(table, budgetMax, targetCount);
  if (!found) return structural; // defensive: phase 1 already proved this count is reachable
  return reconstructCountDP(candidates, table, found.b, targetCount);
}
```

This is a correctness argument, not an empirical hope: `betterCell`'s `spent` key never
reads w, so for a *fixed* exact break count, the maximum achievable spend is a function of
the candidates and the budget alone - identical for every w. Combined with phase 1
pinning the count before w is consulted, both "spend" and "count" are mathematically
guaranteed invariant across w for the same input, not just observed to be so in testing.
The explicit break-count slider positions (1-6, 7) already had their count fixed via the
`dp[i][b][c]` dimension, so they needed no equivalent split - just the `spent`-first
`betterCell` change, which they get automatically.

## Recalibration: `DEMAND_DEVIATION_SCALE`

Now that spend and count no longer depend on w at all, `DEMAND_DEVIATION_SCALE` only has
to be large enough to move the *tertiary* choice (which exact candidates fill an
already-fixed spend+count) - a much narrower job than before, when it also had to compete
with the days-off term for control of how much budget got used. Swept SCALE ∈ {10, 20,
30, 40, 60} against the same full-year US fixture used in Phase 5, budget=15:

| SCALE | w=0 days off | w=25 | w=50 | w=75 | w=100 |
|-------|-------------|------|------|------|-------|
| 10    | 36          | 36   | 36   | 36   | 35    |
| **20**| **36**      | **36** | **33** | **30** | **25** |
| 30    | 36          | 36   | 30   | 25   | 25    |
| 40    | 36          | 36   | 30   | 25   | 25    |
| 60    | 36          | 30   | 25   | 25   | 25    |

SCALE=10 barely moves at all; SCALE=30+ saturates to its floor by w=50-75, which would
have failed the existing "gradual continuum" test (w=20 should stay closer to w=0 than to
w=100). SCALE=20 is the only one in this sweep with a smooth, strictly-decreasing curve
across the whole 0-100 range, so that's what's committed.

## Verification: the exact table the bug report asked for

Script run against the same full-year US fixture as the `optimisation weighting` test
suite, at budget = 1, 5, 15, 40:

```
=== budget=1 ===
{"w":0,  "spent":1, "count":1, "totalDaysOff":4,  "meanDemand":0.93}
{"w":25, "spent":1, "count":1, "totalDaysOff":4,  "meanDemand":0.93}
{"w":50, "spent":1, "count":1, "totalDaysOff":4,  "meanDemand":0.93}
{"w":75, "spent":1, "count":1, "totalDaysOff":1,  "meanDemand":0.67}
{"w":100,"spent":1, "count":1, "totalDaysOff":1,  "meanDemand":0.67}

=== budget=5 ===
{"w":0,  "spent":5, "count":4, "totalDaysOff":14, "meanDemand":0.953}
{"w":25, "spent":5, "count":4, "totalDaysOff":14, "meanDemand":0.867}
{"w":50, "spent":5, "count":4, "totalDaysOff":11, "meanDemand":0.797}
{"w":75, "spent":5, "count":4, "totalDaysOff":8,  "meanDemand":0.733}
{"w":100,"spent":5, "count":4, "totalDaysOff":8,  "meanDemand":0.733}

=== budget=15 ===
{"w":0,  "spent":15,"count":5, "totalDaysOff":36, "meanDemand":0.934}
{"w":25, "spent":15,"count":5, "totalDaysOff":36, "meanDemand":0.914}
{"w":50, "spent":15,"count":5, "totalDaysOff":33, "meanDemand":0.858}
{"w":75, "spent":15,"count":5, "totalDaysOff":30, "meanDemand":0.806}
{"w":100,"spent":15,"count":5, "totalDaysOff":25, "meanDemand":0.76}

=== budget=40 ===
{"w":0,  "spent":40,"count":11,"totalDaysOff":90, "meanDemand":0.967}
{"w":25, "spent":40,"count":11,"totalDaysOff":90, "meanDemand":0.965}
{"w":50, "spent":40,"count":11,"totalDaysOff":79, "meanDemand":0.86}
{"w":75, "spent":40,"count":11,"totalDaysOff":74, "meanDemand":0.828}
{"w":100,"spent":40,"count":11,"totalDaysOff":66, "meanDemand":0.783}
```

`spent` and `count` are exactly constant down every column, at every budget tested;
`totalDaysOff` and `meanDemand` move, and move together (lower demand, fewer days off) -
the real tradeoff, never unspent PTO.

Live in the browser, same full-year 2026 US input, budget=15:
[docs/screenshots/spend-fix-w0.jpg](docs/screenshots/spend-fix-w0.jpg) (w=0: 5 breaks,
costs 1+4+4+4+2=15) vs.
[docs/screenshots/spend-fix-w100.jpg](docs/screenshots/spend-fix-w100.jpg) (w=100: 5
breaks, costs 10+1+1+1+2=15) - same count, same total spend, visibly different dates and
three of the five breaks now tagged "Low travel demand".

## The "no valid candidate can absorb them" notice

`SolveResult` gained `budgetSpent`. The UI (`TopBar.tsx`) shows a notice under the PTO
days field whenever `budgetSpent < budget`, in the exact format the spec gave:
[docs/screenshots/unspent-budget-notice.jpg](docs/screenshots/unspent-budget-notice.jpg)
shows "Using 11 of 15 days — the remaining 4 add no days off at any position" on a
budget=15, Jan 1-16 range where only 11 days can genuinely be absorbed - and the calendar
still shows the real, maximal 11-day plan, never an empty or truncated one. This notice
isn't gated on *why* the budget went unused (true infeasibility vs. an explicit
break-count target constraining it): in both cases the wording is accurate - given the
plan's current settings, those remaining days add nothing.

## Tests

10 new tests in `solve.test.ts` under `optimisation weighting (slider 1) > w never leaves
spendable budget unused (regression)`, covering every acceptance criterion from the bug
report: same spend across all w at budgets 1/5/15/40 (and that spend equals the
unconstrained-maximum), exactly 3 breaks at every w when `breakCount: 3`, same spend and
count but different dates at w=0 vs w=100, and strictly lower demand + strictly fewer
total days off at w=100 vs w=0 at every tested budget. All pre-existing tests
(determinism, performance, the original gradual-continuum test) still pass unchanged - 92
tests total, `npx tsc --noEmit` clean, `npm run build` clean.

---

# Phase 7 — Discoverability, break-count relabel, indexed scores

`npm test -- --run` → 105/105 passing. `npx tsc --noEmit` → clean. `npm run build` →
clean. `npm run lint` → clean. The "exaggeration/stretch" idea from an earlier draft of
this phase's spec was dropped before implementation - displayed scores are raw indexed
values, no additional scaling on top of what's documented below.

## 1. Surfacing click-to-force

[DayCell.tsx](src/ui/DayCell.tsx): every day cell got `cursor-pointer` plus a subtle
`hover:outline` (1px, offset, slate-400) - applied uniformly, not gated on having a
tooltip, because every cell genuinely is click-to-force (`toggleDay` in `useAppState.ts`
cycles include/exclude for any date, not just ones with a marginal-value tooltip). The
existing marginal-value tooltip (`marginalValueText`) gained one appended sentence,
"Click to pin.", not added to the separate holiday-name tooltip since the spec scoped
this to "the existing marginal-value tooltip" specifically. [App.tsx](src/ui/App.tsx) got
one new line directly beneath the `<Calendar>`: "Click any day to pin it in or rule it
out." - small, secondary (`text-xs text-slate-400`), no tour/modal/pulsing-dot.
Screenshot: [docs/screenshots/force-a-day-tooltip.jpg](docs/screenshots/force-a-day-tooltip.jpg)
shows the hover state and the appended tooltip line together on a live cell.

## 2. Break-count slider: fewest-to-most, "Let the solver decide" replacing position 0

[BreakCountSlider.tsx](src/ui/BreakCountSlider.tsx) is now `min=1 max=7` with end labels
"All in one" ↔ "As many as possible", plus a "Let the solver decide" checkbox (checked by
default) that disables the slider while on. Position labels: 1 is "1 (all in one)", 2-6
are just their number, 7 is "As many as possible" - folded into the existing
solved-plan-derived caption (`1 (all in one) · about 16 days`,
`As many as possible · 11 breaks, about 8 days each`), not a separate static label, so the
"report the result, not a prediction" rule from Phase 5 still holds.

**The checkbox is UI state only - no solver change.** `breakCount: 0` ("Any"/"let the
solver decide") already exists and is unchanged; the removed slider position 0 was never
a distinct solver mode, just a UI label for the same `breakCount: 0` the checkbox now
sends. `useAppState.ts` holds `letSolverDecide` (boolean) and `manualBreakCount` (1-7, the
slider's own remembered position, defaulting to 4) separately, and derives
`breakCount = letSolverDecide ? 0 : manualBreakCount` - the exact same number the solver
has always taken. `urlState.ts` needed no changes at all: the URL's `count` param is still
0-7, 0 still means "let the solver decide," 1-7 still means an explicit target - Phase 5's
migration table and defaults are untouched. Screenshot:
[docs/screenshots/breakcount-position1-relabeled.jpg](docs/screenshots/breakcount-position1-relabeled.jpg)
shows position 1 captioned "1 (all in one) · about 16 days" with the checkbox unchecked.

Test (`solve.test.ts`, "removing the 'Any' position does not change the default result"):
`solve({..., breakCount: 0})` equals `solve({...}/* no breakCount field */)` - the
literal claim the spec asked for, and trivially true since this path was never touched.

## 3. Indexed Efficiency and Travel scores, with percentiles and color

New `computeScores(input, result)` in [solve.ts](src/solver/solve.ts), exported alongside
`solve`, returns `{ efficiency: {value, percentile}, travel: {value, percentile} } | null`
(`null` when there's no plan to score). Both scores and both percentiles are documented
in full in the function's own comment; summary:

- **Efficiency** = `(totalDaysOff / budgetSpent) / medianCandidateRatio * 100`, where
  `medianCandidateRatio` is the median `length/cost` across *every* candidate achievable
  anywhere in the selected date range (not just the chosen ones, and not budget-scoped -
  "the median achievable ratio across the selected date range" is a range-wide baseline,
  read literally). Its percentile is ranked against a sweep of plans actually solvable at
  the *same* (budget, breakCount) pair, varying only w (`SCORE_W_SWEEP = [0,20,40,60,80,100]`,
  plus the caller's own exact w so the current plan is always a literal member of its own
  comparison set) - "achievable plans at the same budget and break count."
- **Travel** = `meanDemand * 100`. No separate baseline computation needed: the demand
  index is already normalized so 1.0 = the annual mean (see `demandIndex.ts`'s own "1.0 =
  average day" comment), so indexing against "the annual mean" is just the existing
  `meanDemand` figure times 100. Its percentile is ranked against the mean demand of every
  real non-overlapping 7-day chunk of the selected range ("all weeks in the selected date
  range").
- Both percentiles are a plain count-based rank against the real sampled distribution -
  `worseCount / distribution.length * 100`, no scaling or transform of any kind. A
  perfectly flat distribution (every week identical to the plan's own demand) correctly
  gives percentile 0, not a padded default of 50 - covered by its own test, see below.

**Judgment call, flagged:** "the median achievable ratio across the selected date range"
doesn't specify whether "achievable" means per-candidate or per-plan. I read it as
per-candidate (every single possible break, not every possible combination of breaks),
since the spec's own parenthetical phrase is "across the selected date range," not "at
this budget" - and a per-plan reading would make Efficiency's two components (value vs.
percentile) use two different, inconsistently-scoped baselines (range-wide vs.
budget-scoped), which the spec doesn't ask for anywhere else. I'm not fully certain this
is the intended reading.

### Colour

Confined entirely to the summary strip - a small dot plus the leading "Label value"
segment of each score line, never the calendar, the band, a day cell, or a break card
(`SummaryStrip.tsx`'s own comment explains why: the calendar already has its own
coral/teal - or blue/amber under color scheme B - legend, and a traffic-light score next
to it would read as part of that legend). Bands: percentile >= 67 green, 34-66 yellow
(rendered as `amber-700`, not `yellow-700` - see below), < 34 red
([scoreFormat.ts](src/ui/scoreFormat.ts)). Colour is reinforcement only: every score line
always spells the percentile out in words via the one shared `formatScoreLine` helper
(`efficiencyLine`/`travelLine` both call it), so the strip is fully interpretable with
every color stripped out - verified directly in `scoreFormat.test.ts`
("always spells out the percentile in words...").

**Deviation, documented in-code:** the spec calls the middle band "yellow," but plain
yellow text routinely fails 4.5:1 contrast against a light background at any reasonable
weight. Since the color is reinforcement only (the words already carry the meaning),
substituting an accessible `amber-700` for the "yellow" band costs nothing and was the
obvious trade. Contrast, computed via the WCAG 2.x relative-luminance formula (same
method `colorScheme.ts` already uses and documents) against both backgrounds the strip
can sit on:

| band   | class         | vs. slate-50 | vs. white |
|--------|---------------|--------------|-----------|
| green  | `text-green-700` | 4.79:1    | 5.02:1    |
| yellow | `text-amber-700` | 4.80:1    | 5.02:1    |
| red    | `text-red-700`   | 6.18:1    | 6.47:1    |

All six clear 4.5:1. Asserted directly in `scoreFormat.test.ts`.

### FAQ

One sentence appended to "Where does the travel data come from?" per the spec: "The
Travel score and its percentile are built from this same throughput data, which moves far
less than destination-level prices do."

### Screenshot

[docs/screenshots/scores-default.jpg](docs/screenshots/scores-default.jpg) - the default
view (w=30, letting the solver decide, budget=15), showing the full summary strip:
headline "15 PTO days (32 days off) · Efficiency 140 · Travel 94," then the two colored
percentile lines beneath it ("Efficiency 140 · better than 14% of plans at this budget" in
red, "Travel 94 · quieter than 82% of weeks" in green).

### Tests

- `solve.test.ts`, `indexed scores (efficiency & travel)`: a hand-verifiable "both scores
  read exactly 100" fixture (a flat-demand month with a 7-day work week and no holidays,
  so every candidate is a standalone single day with ratio exactly 1 and demand exactly
  1.0 - the plan's own numbers can only equal both baselines, not approximate them); the
  flat-distribution travel-percentile-is-0 test described above; moving w 0→100 lowers
  both scores, raises the travel percentile, and leaves `budgetSpent` unchanged (reusing
  the Phase 6 fixture); travel value is exactly `meanDemand * 100`, asserted against the
  real computed mean, not a hardcoded number; the breakCount:0 equivalence test for item
  2 above; and a null-result edge case.
- `scoreFormat.test.ts` (new file): color-band thirds match the stated boundaries exactly
  at 0/33/34/66/67/100; text and dot classes always agree on the same band; the 4.5:1
  contrast table above, asserted programmatically; `formatScoreLine` produces the
  spec's exact verbatim strings for the given example numbers (142/91, 94/78); and the
  greyscale-readability check (percentile always present as literal digits in the string).

---

# Phase 8 — Percentile-only scores, single-hue bar, legend fix

`npm test -- --run` → 117/117 passing. `npx tsc --noEmit` → clean. `npm run build` →
clean. `npm run lint` → clean.

## 1. The percentile IS the score now

The indexed "100 = average" numbers from Phase 7 are gone entirely - not hidden, removed.
`ScoreValue` (`solver/types.ts`) is now just `{ percentile: number }`; `computeScores` no
longer computes a median-ratio baseline or an indexed travel value at all, since neither
was ever used for anything but that display number. The summary strip headline is now
`"15 PTO days (32 days off) · Travel 82nd · Efficiency 14th"` (Travel before Efficiency,
matching the spec's own example order throughout), each score rendered via a shared
`ordinal()` helper (`scoreFormat.ts`) through the single `formatScoreLine` template, with
a fixed gloss per score ("quieter than most weeks" / "better than most plans at this
budget") rather than a dynamically-worded percentage sentence.

**The travel inversion, verified, not just trusted.** The underlying percentile math
(`percentileBetterThan` in `solve.ts`) was already correct from Phase 7 - travel's
`higherIsBetter: false` flag already counted weeks busier than the plan, which is exactly
"quieter than N% of weeks." But since the spec's own concern is that a flipped version of
this looks equally plausible, I added a test that hand-computes an expected percentile
from a known 8-week distribution (2 flat weeks, 6 elevated weeks; see
`solve.test.ts`, "verifies the travel inversion") and asserts the real result is 75, not
its complement 25 - a difference large enough that no rounding slop could produce it by
accident. Confirmed again live: moving w from 0 to 100 (same full-year fixture as Phase
6/7) raised Travel from 82nd to 100th and dropped Efficiency from 14th to 0th -
[docs/screenshots/scores-w100-inversion-check.jpg](docs/screenshots/scores-w100-inversion-check.jpg).

## 2. Percentile bar: single-hue (indigo) intensity ramp, fill-only

Each score now renders with a quiet horizontal bar beneath it
(`PercentileBar` in `SummaryStrip.tsx`): a `h-1 w-16` (4px × 64px) `bg-slate-200` track, a
fill from 0 to the percentile with no animation, gradient, or rounded end caps, and a
faint 50-mark tick. The tick uses `mix-blend-difference` on a white line rather than a
fixed color, specifically so it stays visible whether it lands on the light track or the
(comparatively dark) fill - a single solid tick color can't satisfy both.

**Colour lives only on the bar fill, never the numeral** - `SummaryStrip.tsx`'s score text
is plain `text-slate-600`, matching the spec's "the numeral itself stays in normal text
colour." Three bands, even thirds (not 40/60, which would flag two-fifths of outcomes as
worst): `SCORE_INTENSITY` in `scoreFormat.ts` is the one named constant holding both
`thresholds: [33, 66]` and the three fill classes, so they can't be edited independently
or drift apart.

**Deviation, documented:** the spec's "slate through indigo" range, read literally (actual
light slate/indigo shades), fails 4.5:1 outright - a pastel fill is the whole point of
"lightest," but contrast is the harder, non-negotiable constraint. All three bands are
solid indigo (`indigo-600`/`700`/`800`), chosen by sweeping real Tailwind shades for the
lightest one that still clears 4.5:1 against both backgrounds the strip can sit on:

| band       | class          | vs. slate-50 | vs. white |
|------------|----------------|--------------|-----------|
| below 33rd | `bg-indigo-600`| 6.01:1       | 6.29:1    |
| 33rd-66th  | `bg-indigo-700`| 7.55:1       | 7.90:1    |
| 66th+      | `bg-indigo-800`| 9.49:1       | 9.93:1    |

Asserted directly in `scoreFormat.test.ts`. No red/yellow/green anywhere, per the spec's
own reasoning (worst palette for colourblindness, clashes with the calendar's coral/teal
or blue/amber, and "red" implies broken rather than merely below-average) - and indigo is
used nowhere else in the calendar or legend, so it carries no other meaning to collide
with.

Screenshot: [docs/screenshots/legend-and-scores-default.jpg](docs/screenshots/legend-and-scores-default.jpg)
shows both bars at their real percentiles (82%/indigo-800, 14%/indigo-600) live.

### Tests

`scoreFormat.test.ts`: `barFillWidthPercent` equals the raw percentile exactly at 0/50/100
and is identical across a band boundary (32 vs 34, 65 vs 67) - proving width never reads
colour; `intensityBand`/`barFillClass` match the 33/66 thresholds exactly, sourced from
`SCORE_INTENSITY` itself so the test can't drift from the constant it's checking; all
three `SCORE_INTENSITY.rgb` values clear 4.5:1 against both backgrounds; and a
greyscale-independence check confirming both the gloss text and the bar width are
colour-free signals on their own.

## 3. Legend fix: holiday fill, swatch consistency, weekend entry removed

Public holidays get their own fill now - `COLORS.holidayBg`/`holidayBorder`/`holidayText`
(new tokens in `colorScheme.ts`, defined for both schemes), rendered in `DayCell.tsx`
exactly like `suggested-pto` (filled box, border, text color), replacing the small violet
dot marker entirely. The legend's holiday entry is the same `h-5 w-5 rounded border`
swatch as "Suggested PTO" - same size, spacing, and label style, which is also what fixes
the "1/2" numeral-adjacency reading the spec called out (there's no bare numeral
`<span>` sitting next to another one anymore; every swatch is a sized box). "Alternative
placement" is shortened to "Alternative" to match the spec's own wording. The Weekend
entry is removed outright - weekend cells keep their existing muted-numeral styling in
`DayCell.tsx` (`TEXT_MUTED` when not in a band), only the legend line is gone.

**Judgment call, documented:** the spec's "resulting legend" lists exactly four entries,
which could mean the Overlap day marker and the "Hover or focus a day..." hint should be
removed too. I read it as describing the four-swatch *color-box* row the request is
actually about (holiday/PTO/alternative/days-off - the ones with a "[box]"/"[dashed box]"
in the given list), not the whole component: Overlap day and the hover hint aren't
day-cell fills in the same sense, nothing explicitly asked for them to go, and removing
them would be a real usability regression (there'd be nothing on the page explaining what
the small black dot on an overlapping day means) for a change nobody requested. I kept
both, after the four swatches. If the literal "four entries total, nothing else" reading
was intended, that's unimplemented.

**Colour choice, with its trade-off made explicit.** All three calendar fills (holiday,
PTO, days-off band) need to differ in VALUE (luminance), not just hue, in both color
schemes at once - scheme B's PTO fill is near-black (`blue-900`, luminance 0.051) and its
band is near-white (`amber-200`, luminance 0.793), which only leaves so much room for a
third, well-separated value. `violet-600` (luminance 0.134) was the best compromise found
across both schemes - reasonable separation from both the darkest and lightest existing
fill in each scheme, though scheme B's holiday-vs-PTO pairing is the weakest of the three
at 1.82:1 (a real, if modest, perceptible difference - not a tie):

| scheme | holiday vs PTO | holiday vs band | PTO vs band |
|--------|-----------------|-------------------|--------------|
| A (coral/teal) | 2.02:1 | 3.85:1 | 1.90:1 |
| B (blue/amber, default) | 1.82:1 | 4.58:1 | 8.32:1 |

Asserted directly (`colorScheme.test.ts`, threshold 1.5:1 - comfortably below the real
1.82:1 minimum, so the test genuinely fails if any pairing ever collapses). Screenshot:
[docs/screenshots/legend-holiday-fill-zoom.png](docs/screenshots/legend-holiday-fill-zoom.png)
shows the purple holiday fill next to the navy PTO fill live, clearly distinct even at
small size.

### Tests

`colorScheme.test.ts`: both schemes' three fills are pairwise distinguishable at >=1.5:1.
`Legend.test.tsx` (new - first component test in the project, via `react-dom/server`'s
`renderToStaticMarkup`, no new test-library dependency needed): no "Weekend" text anywhere
in the rendered output; all four required entries present and in the specified order;
Public holiday and Suggested PTO share the identical swatch-shape class string; and the
holiday and PTO color tokens are confirmed distinct (not the same class reused by
mistake).

---

# Phase 9 — Forced days vs holidays: shape, not a sixth colour

`npm test -- --run` → 132/132 passing. `npx tsc --noEmit` → clean. `npm run build` →
clean. `npm run lint` → clean.

## Root cause of the bug

Phase 7 added click-to-force; Phase 8 added a dedicated holiday fill. Neither phase
noticed that a day forced 'include' and a genuine public holiday went through the exact
same code path. `useAppState.ts`'s `categoryOf` checked `baseOffSet.has(iso)` to decide
'public-holiday' - but `baseOffSet` is `effectiveOffDays`, which already *contains* every
forced-include date (that's the whole mechanism: forcing a day 'include' makes the solver
treat it as free, by adding it to the off-days set). So a pinned day and a real holiday
were, structurally, the identical case - "render identically" wasn't a styling miss, it
was the same `DayCategory` value for two different facts.

## The fix: a new category, not a new colour

`DayCategory` gained `'pinned'`, checked **before** the holiday/weekend/suggested logic in
a newly-extracted pure function:

```ts
// src/ui/dayCategory.ts
export function classifyDay({ isBlackout, forcedState, isBaseOff, isWeekend, isChosen }: DayCategoryInputs): DayCategory {
  if (isBlackout) return 'working';
  if (forcedState === 'include') return 'pinned';
  const wasOff = isBaseOff || isWeekend;
  if (!wasOff && isChosen) return 'suggested-pto';
  if (isBaseOff) return 'public-holiday';
  if (isWeekend) return 'weekend';
  return 'working';
}
```

This was pulled out of `useAppState.ts` (previously inline in a `useCallback`) into its
own pure, directly-testable module specifically so the "forced vs holiday" distinction -
the exact thing that broke - has a unit test that doesn't require mounting the hook. It's
the first genuinely new architectural module this phase added; everything else is a
rebalancing of existing color tokens.

## The colour rebalance: two colours, one neutral

The holiday fill from Phase 8 is gone entirely - not reduced, removed. `ColorTokens` lost
`holidayBg`/`holidayBorder`/`holidayText`; nothing in `colorScheme.ts` references violet
anymore. In its place:

- **Public holiday**: no fill. A small dot (`HOLIDAY_DOT = 'bg-slate-600'`) beneath the
  numeral, numeral at normal weight - reusing the app's existing neutral (slate) family
  rather than introducing a new hue, which is the literal bug this phase exists to fix
  (every feature claiming its own colour). `DayCell.tsx`'s `stateLabel`/`categoryClasses`
  both dropped the holiday-fill branch entirely.
- **Pinned**: the *exact same* `COLORS.ptoBg`/`ptoBorder`/`ptoText` as `suggested-pto` -
  sharing coral (or blue, in the active scheme) deliberately, since both mean "a day
  you're taking." Distinguished by `border-2` (vs. suggested-pto's 1px `border`) and a
  small corner triangle, `COLORS.ptoAccentBg` (a new token: the *same hue* as `ptoBorder`,
  just as a background-fillable class, since Tailwind's `border-*` utilities only set
  border-color) clipped into the top-right corner via `clip-path: polygon(100% 0%, 100%
  100%, 0% 0%)`. Both signals are pure shape/weight, not hue - verified directly (see
  Tests below) by stripping every color-ish class from the rendered output and confirming
  `pinned` and `suggested-pto` still render different markup.

That leaves exactly two colour roles in the whole calendar - the PTO role (coral/blue,
fills `suggested-pto` and `pinned` alike) and the band role (teal/amber, `MonthGrid`'s
off-run bands, unchanged) - plus the one neutral dot. `Legend.tsx` matches this precisely:
mixed swatch types (a bare dot for Public holiday, not a box; a box+corner for Pinned,
reusing the exact same markup pattern `DayCell` uses) rather than forcing every entry into
an identical rectangle, and the "Pinned by you" entry is new.

Screenshots: [docs/screenshots/pinned-day-and-legend.jpg](docs/screenshots/pinned-day-and-legend.jpg)
(Nov 2 pinned live, Nov 26 - Thanksgiving - showing the dot, new 5-entry legend),
[docs/screenshots/pinned-day-corner-zoom.png](docs/screenshots/pinned-day-corner-zoom.png)
(the heavier border and corner triangle up close), and
[docs/screenshots/legend-v2-swatches.png](docs/screenshots/legend-v2-swatches.png) (the
legend's mixed swatch types side by side).

## "Coral"/"teal," read as role names, not a scheme switch

The request describes "Suggested PTO: Coral fill" and "Days off band: Teal" as
"(unchanged)." The project's actual active default is `COLOR_SCHEME: 'B'`
(blue-900/amber-200), not scheme A's literal coral/teal - a deliberate choice from an
earlier phase ("coral reads as a warning color," see `colorScheme.ts`). I read "coral"/
"teal" here as the established *role names* for `COLORS.ptoBg`/`COLORS.bandBg` (the
codebase's own long-standing vocabulary, visible throughout `colorScheme.ts`'s own
comments even when describing scheme B), not a literal instruction to switch the active
scheme - the surrounding text is about fill-vs-no-fill and shape-vs-colour, never about
reconsidering A vs. B, and switching schemes would be a large, unrelated visual change
nothing else in the request asked for. Implemented using whichever scheme is active
(`COLORS.ptoBg`/`ptoBorder`/`ptoText`/`bandBg`), unchanged in both A and B. If a literal
scheme switch to coral/teal was intended, that's unimplemented - flagged here rather than
guessed at silently.

## Tests

- `dayCategory.test.ts` (new): the exact regression - a forced-include day and a genuine
  holiday produce different categories even though both have `isBaseOff: true`; pinned is
  also distinct from plain `suggested-pto`; forced-include wins over every other signal
  (chosen, weekend, also-a-holiday); blackout still wins over forced-include (a day can't
  be both); a scenario with nothing chosen and nothing pinned never produces a fill
  category; and the plain four-category cases are unaffected by the new branch.
- `DayCell.test.tsx` (new, via `renderToStaticMarkup`): pinned and public-holiday render
  different markup outright; pinned and suggested-pto remain distinguishable after a
  `stripColor()` helper deletes every bg-_/border-_-color/text-_-color/hex class from the
  rendered HTML (what's left: `border-2` and the `clip-path` corner element, present only
  on pinned); pinned and suggested-pto share the identical `ptoBg`/`ptoBorder`/`ptoText`
  tokens (proving the shared-coral claim); a pinned day inside a band (`inBand: true`)
  still renders `z-10` and the full PTO fill/text pair (coral-over-teal, numeral legible);
  and no category ever renders "violet" or "indigo" in its output.
- `colorScheme.test.ts` (rewritten - the old holiday-fill-distinguishability premise is
  gone along with the fill itself): every numeral/background pair referenced by the spec
  reaches 4.5:1 - `ptoText` on `ptoBg` in both schemes, `TEXT_PRIMARY` on white and on the
  band fill in both schemes, `TEXT_MUTED` on white (the only background a weekend numeral
  not in a band ever sits on, since `inBand` already switches it to `TEXT_PRIMARY`).
- `Legend.test.tsx` (updated): the five entries render in the specified order with no
  "Weekend" text anywhere; Public holiday's swatch is a bare dot with no PTO-fill class
  anywhere before it in the markup; Pinned by you reuses the PTO fill (checked by counting
  `COLORS.ptoBg` occurrences across both PTO-colored entries) plus the corner-triangle
  accent and a `clip-path` style; and the rendered legend never contains "violet",
  "indigo", or a dangling reference to the removed `holidayBg` token.

---

# Phase 10 — Screenshot-review fixes: two real bugs, five polish items

`npm test -- --run` → 144/144 passing. `npx tsc --noEmit` → clean. `npm run build` →
clean. `npm run lint` → clean. Screenshot of the default view, 1440px, after every change
below: [docs/screenshots/default-1440-phase10.jpg](docs/screenshots/default-1440-phase10.jpg).

## 1. Bug: the gloss text was hardcoded, not derived from the percentile

`efficiencyLine`/`travelLine` always returned the SAME gloss string regardless of the
percentile passed in - "Efficiency 14th · better than most plans" was two independent,
disconnected pieces of text that happened to render next to each other. Fixed by deriving
both glosses from `intensityBand(percentile)` - the exact same `[33, 66]` thresholds that
already drive the bar's colour, via two new lookup tables (`EFFICIENCY_GLOSS`,
`TRAVEL_GLOSS` in `scoreFormat.ts`), so the words and the bar colour can never disagree
about what counts as below/at/above average. New test in `scoreFormat.test.ts` asserts
the gloss changes across all three bands for both metrics, plus a dedicated boundary test
at 0/32/33/65/66/100 confirming the gloss and `intensityBand` never diverge.

## 2. Bug investigation: which of (a)/(b)/(c) explained 32 days off scoring 14th percentile

**None of them, exactly - it was a percentile-rank tie-handling bug, closest in spirit to
(c) but not the inversion itself.** Full diagnosis, reproduced directly against the live
default view's input (Oct 18 - Dec 31 2026, budget 15, w=30):

```
w=0:   spent=15  daysOff=32  efficiency=2.133
w=20:  spent=15  daysOff=32  efficiency=2.133
w=30:  spent=15  daysOff=32  efficiency=2.133   <- the actual plan being scored
w=40:  spent=15  daysOff=32  efficiency=2.133
w=60:  spent=15  daysOff=32  efficiency=2.133
w=80:  spent=15  daysOff=32  efficiency=2.133
w=100: spent=15  daysOff=29  efficiency=1.933
```

(a) was false: every point in the sweep spends the full budget (Phase 6's invariant held
correctly) - the distribution genuinely is "achievable plans at this budget and break
count," nothing in it is a phantom. (b) was also false: w=30 is not "costing" anything -
its efficiency (2.133) is tied for the maximum achievable value in the entire sweep.
**The actual plan is literally as efficient as it is possible to be at this budget.**

The real bug was in `percentileBetterThan`'s comparison: `worseCount = distribution.filter(d
=> d < value).length` is a STRICT inequality, so a value tied with most of the
distribution only gets credited with beating the points that are strictly below it. Here,
6 of the 7 sweep points tie at the maximum (w=30 among them); only w=100 is strictly
worse. `worseCount` was 1, `percentile = round(1/7*100) = 14`. The plan wasn't scored
badly because it performed badly - it was scored badly because it had lots of good
company, and the formula only counted the ONE point that didn't. This is a direct,
foreseeable consequence of Phase 6/7's own design: spend and plan structure are
deliberately flat across wide ranges of w, so ties at the maximum (or minimum) are the
*common* case for this specific small-sample distribution, not an edge case.

**The fix**: `percentileBetterThan` now computes an inclusive percentile rank - "% of the
distribution my plan is at least as good as" (`d <= value` for higherIsBetter, `d >=
value` for lower-is-better) instead of "% my plan strictly beats." This is the standard
convention real percentile-rank reporting already uses (a tied-for-first test score is
commonly reported as the 100th percentile, not penalised for the tie), and it's exactly
what the requested test demands: when a plan tied with the rest of a sweep IS the
distribution's maximum, every member of that distribution is `<= ` it by definition, so
the formula now always returns exactly 100 in that case - not "near 100," exactly 100,
structurally, regardless of how many other points happen to tie or how many don't.

New test, `solve.test.ts`, "a plan tied for the efficiency maximum scores at or near 100":
reproduces this exact scenario (same offDays/budget/w=0, the canonical unconstrained-max
case) and asserts `efficiency.percentile >= 95`. The two existing hand-verified travel
tests (the flat-distribution test and the inversion-verification test) both had their
expected values updated from 0/75 to 100, with revised reasoning comments - they were
correct under the old strict convention and are now correct under the inclusive one; nothing about the direction of either test changed, only the tie-handling.

## 3. Alternatives overwhelming the calendar

**The 2-per-break cap was already correctly enforced** - a new test
(`never exceeds MAX_ALTERNATIVES_PER_BREAK (2) per break, even when far more than 2
candidates tie in value`) constructs a fixture with dozens of tied candidates specifically
to try to break it, and it holds. What the screenshot actually showed was the cap's
*consequence* at volume: 4 of 5 primary breaks each had 2 alternatives, and several of
those alternatives were 8-9 day spans - 8 alternative date-ranges, several nearly as long
as the primary breaks themselves, is enough to blanket most of two months even at exactly
"2 per break."

Two real fixes, both implemented:
- **"Keep the 2 closest in value," literally**: `findAlternatives`'s sort previously
  ranked by raw value descending, which prefers a candidate markedly *above* the
  primary's value over one much closer but slightly below it - not "closest." Now sorts
  by `|value - primaryValue|` ascending. `findAlternatives` is exported from `solve.ts`
  specifically so this has a direct unit test (`solve.test.ts`) rather than an indirect,
  input-engineering-heavy one.
- **Visibly fainter dashed outline**: `DayCell.tsx`'s alternative treatment dropped from
  `border-2` (2px, full-opacity) to `border` (1px) at `${COLORS.altBorder}/40` (40%
  opacity) - noticeably lighter than the solid PTO fill now, matching "a suggestion about
  a suggestion," not equal visual weight to "a day you're taking."

## 4. Suggested vs pinned were indistinguishable at cell size

The corner triangle and `border-2` weight difference from Phase 9 didn't actually read at
real cell size - confirmed by eye in the review screenshot. Replaced entirely: `pinned`
now renders the exact same fill AND border as `suggested-pto` (no weight difference left
to be illegible), distinguished only by a small pin glyph (`PinIcon`, an inline SVG using
`fill="currentColor"`) rendered **beside the numeral**, not in a corner. `currentColor`
means the glyph always renders in whatever `COLORS.ptoText` already is - no new hue, no
separate contrast check needed, since it's literally the same text color already
verified. `ColorTokens.ptoAccentBg` (the triangle-only token) is gone along with the
triangle.

Cell height went from `h-11` (44px) to `h-12` (48px, `MonthGrid.tsx`'s `gridTemplateRows`
updated to match) to give the glyph+numeral pair breathing room, per the spec's own
instruction to grow the cell rather than shrink the mark. Confirmed live, actual size, no
zoom: [docs/screenshots/pinned-vs-suggested-actual-size.jpg](docs/screenshots/pinned-vs-suggested-actual-size.jpg)
(the pinned "16📍" is legible next to plain "9"/"10" suggested cells in an unscaled
1440px screenshot) and
[docs/screenshots/pinned-vs-suggested-zoom.png](docs/screenshots/pinned-vs-suggested-zoom.png)
for a closer look. `Legend.tsx`'s "Pinned by you" swatch was updated to show the same
glyph, reusing the exported `PinIcon` component so the legend can never drift from what
the calendar actually renders.

**Observed, not fixed (out of scope for this phase):** a day that is simultaneously
pinned AND an alternative-placement candidate for some other break renders both
treatments layered (the pinned fill/glyph plus the faint alternative dashed outline on
top), and its accessible label reads "alternative placement" rather than "pinned by you" -
`stateLabel`'s existing priority checks `isAlternative` before the category switch, a
rule that predates this phase. This is a genuine, if rare, coincidence (nothing requested
addressing it), noted here rather than silently left unmentioned.

## 5. Disabled break-count slider looked active

`BreakCountSlider.tsx`: while `letSolverDecide` is checked, the track/thumb now switch to
`accent-slate-300` (a visibly flat grey) instead of `accent-slate-800` at reduced opacity
- a colour change reads as "inert" at a glance, where dimming the same blue still looked
"set to something." The caption gained a `letSolverDecide` parameter and now reads
"Solver chose 5 breaks · about 6 days each" while the checkbox is on, instead of the bare
"5 breaks · about 6 days each" that implied the user had picked that position.

## 6. Out-of-range days and month-grid height

Two separate findings here, both real:

- **Out-of-range days weren't present at all, not merely unstyled.** `buildMonths`
  (`calendarMath.ts`) was silently converting every date outside `[rangeStart, rangeEnd]`
  to `null` - the exact same value used for leading/trailing grid-alignment padding. Oct
  1-17 (range starts Oct 18) weren't "ordinary cells with no indication" so much as
  genuinely absent, rendering as blank grid space indistinguishable from the month simply
  not having those days. Fixed by keeping every real calendar date as itself; the caller
  now decides how to render an out-of-range day. `MonthGrid.tsx` computes
  `isOutOfRange = iso < rangeStart || iso > rangeEnd` per cell and passes it to
  `DayCell`, which (new prop) renders it `disabled`, with no fill, no decorative markers,
  and `text-slate-300` (very muted) - confirmed in the 1440px screenshot, Oct 1-17 are
  now visibly present but clearly inert.
- **The "fixed six-row month height" rule was never actually implemented.** `buildMonths`
  padded each month to a multiple of 7 cells (`cells.length % 7 !== 0`), which gives a
  4-week February next to a 6-week January - different heights, the "ragged" look flagged
  in the review. Now pads to exactly 42 cells (6 full weeks) always. Three new tests in
  `calendarMath.test.ts` cover both fixes directly: out-of-range dates are present (not
  null) in a partial month, every month has exactly 6 rows of 7 cells regardless of how
  many it needs, and every real day of the month appears exactly once with no duplicates.

## 7. Legend layout

`Legend.tsx` dropped its trailing "Hover or focus a day..." line (previously rendered as
if it were a sixth legend entry) and the Overlap day swatch; both the hover hint and the
existing "Click any day to pin it in or rule it out" line now live together as one
sentence beneath the calendar, in `App.tsx`, where the click instruction already was. The
legend itself was already using `flex flex-wrap` (wraps naturally, doesn't stretch) - the
cramped full-width impression in the screenshot came from fitting 7 items (5 swatches +
Overlap day + the hover hint) onto one row; down to 5, it wraps and sits left-aligned as
specced.

**Judgment call, reversing Phase 9's own:** the spec lists "Keep the five entries" as the
entirety of the resulting legend, which I read literally this time - Overlap day's
separate documentation is dropped, not merely deprioritized. Phase 9 had deliberately kept
it as a 6th entry on the reasoning that nothing had explicitly asked for its removal; this
phase's explicit "keep the five entries" wording is a more specific instruction that
supersedes that earlier guess. The overlap marker itself (the small dot on a day cell)
is unchanged in the calendar - only its legend explanation is gone.

## Tests

82 tests touched or added across `solve.test.ts` (the percentile-rank fix, the alt-cap
and closest-in-value tests), `scoreFormat.test.ts` (the gloss-derivation tests),
`calendarMath.test.ts` (out-of-range dates, six-row padding), `DayCell.test.tsx` (pin
glyph vs corner triangle, fainter alternative outline, disabled/muted out-of-range
rendering), and `Legend.test.tsx` (no instruction text, pin glyph reuse). All pass
alongside the full pre-existing suite - 144 total.

---

# Phase 11 — Root cause: a fixed candidate-cost cap, not a weighting problem

`npm test -- --run` → 151/151 passing. `npx tsc --noEmit` → clean. `npm run build` →
clean. `npm run lint` → clean.

## Root cause, confirmed

The correction was right: "one break can't absorb 15 days" was never true (15 PTO days
is three work weeks; taken consecutively that's >=19 calendar days once the two weekends
inside are included, trivially constructible in any 10-week range). The actual defect was
`MAX_CANDIDATE_COST = 10` in `buildCandidates` - a fixed ceiling on how many workdays any
single candidate interval could ever cost, present since the function was first written
as a cheap bound on enumeration:

```ts
// BEFORE
function buildCandidates(
  days: ISODate[], isOff: boolean[], isBlackout: boolean[], overlapSet: Set<string>,
  expiryDate: ISODate | undefined, country: string | undefined,
): Candidate[] {
  ...
  for (let i = 0; i < n; i++) {
    if (!isOff[i]) continue;
    let cost = 0;
    ...
    for (let j = i; j < n; j++) {
      ...
      if (!isOff[j]) {
        cost++;
        if (cost > MAX_CANDIDATE_COST) break;   // <-- stops extending the interval at 10
        ...
      }
      ...
      if (isOff[j] && cost >= 1) {
        candidates.push({ ... });                // never reached for cost > 10
      }
    }
  }
  ...
}
```

No candidate costing more than 10 PTO days could ever be constructed, at any budget. The
DP downstream (`betterCell`'s spent-first ordering, from the Phase 6 budget-maximization
fix) was working correctly the whole time - maximizing spend over whatever candidates it
was shown - but 10 was the hard ceiling on what any one candidate could ever cost, so
"maximize spend in one break" silently capped out at 10 regardless of how much budget was
actually available. The plan spending exactly 10 of 15 was not a coincidence or a
weighting side-effect; it was the cap, read directly off the data.

**The fix**: the cap is now computed per-solve from the caller's own budget, bounded a
second time by the range itself (cost only counts workdays, which can never exceed the
day count):

```ts
// AFTER
function buildCandidates(
  days: ISODate[], isOff: boolean[], isBlackout: boolean[], overlapSet: Set<string>,
  expiryDate: ISODate | undefined, country: string | undefined,
  maxCandidateCost: number,                       // <-- now a parameter, not a constant
): Candidate[] {
  ...
      if (!isOff[j]) {
        cost++;
        if (cost > maxCandidateCost) break;
        ...
      }
  ...
}

// in solve():
const budgetMax = Math.max(0, Math.floor(input.budget ?? 0));
const maxCandidateCost = Math.min(budgetMax, n);   // n = days.length, the whole range
const candidates = buildCandidates(days, isOff, isBlackout, overlapSet, input.expiryDate, input.country, maxCandidateCost);
```

Live confirmation, same offDays/range used throughout this project, full year 2026:

| budget | breakCount=1 result |
|--------|----------------------|
| 2  | one break, Nov 11 → Nov 15, 2 PTO days spent |
| 15 | one break, Jan 1 → Jan 25 (25 calendar days), **15 of 15 spent** |
| 40 | one break, Mar 28 → May 25 (59 calendar days), **40 of 40 spent** |
| 80 | one break, **80 of 80 spent** (8x the old fixed constant) |

## Every magic number in the solver, reviewed

Searched the whole enumeration and DP path (`solve.ts`) for fixed numeric constants and
checked each one against the same question: does this silently truncate something the
user asked for, the way `MAX_CANDIDATE_COST` did?

| constant | value | what it does | silently truncates a request? |
|---|---|---|---|
| `MAX_CANDIDATE_COST` | ~~10~~ | capped every candidate's cost | **yes - this was the bug, now removed entirely, replaced by the per-call `maxCandidateCost` parameter** |
| `EXACT_COUNT_SEARCH_CAP` | 20 | bounds the count-DP table size when searching for the nearest achievable break count (slider positions 1-6) | No. The slider only ever requests a target in 1-6; 20 is already >3x the largest possible target, so the "nearest achievable" search is never truncated before it could reach a real answer. Reviewed and left as-is. |
| `MAX_ALTERNATIVES_PER_BREAK` | 2 | caps alternatives shown per primary break | No - this is an intentional, specced display limit (re-confirmed working by direct cell count below), not an enumeration bound. |
| `ALTERNATIVE_VALUE_TOLERANCE` | 0.15 | how close in value a candidate must be to qualify as an alternative at all | No - a relevance filter, not a count or length cap. |
| `HIGH_DEMAND_THRESHOLD` / `LOW_DEMAND_THRESHOLD` | 1.25 / 0.85 | cosmetic tag thresholds ("Peak travel"/"Low travel demand") | No - informational labels only, never affect what the solver can find or choose. |
| `DAYS_OFF_WEIGHT` / `DEMAND_DEVIATION_SCALE` / `VALUE_MULT` | 100 / 20 / 1000 | value-function weighting and integer-precision scaling | No - these shape which candidate wins a tie, never which candidates exist. |
| `w` clamp / `breakCount` clamp | [0,100] / [0,7] | the sliders' own specced input ranges | No - these are UI-contract bounds on the input itself, not internal truncation of a valid request. |
| `SENTINEL_START`, `DEFAULT_W` | n/a | tie-break sentinel, default weighting | No - not bounds at all. |

`MAX_CANDIDATE_COST` was the only one that matched the pattern described: a fixed
constant silently standing in for what should have been a function of the user's actual
input.

## Performance: measured, not estimated

Per the warning that a larger cap grows `O(days^2)`-bounded enumeration, timed directly
(5-run average, full year 2026, same offDays fixture, warm JIT):

| budget | breakCount=0 | breakCount=1 | breakCount=7 |
|--------|---|---|---|
| 15 | 10.8ms | 20.3ms | 16.1ms |
| 40 | 69.9ms | 144.1ms | 229.5ms |
| 60 | 197.7ms | 213.3ms | 501.5ms |

All comfortably under the project's established 1000ms ceiling (the existing `performance`
test in `solve.test.ts`, budget=60 across w in {0,50,100} and breakCount in {0,1,3,7} - 12
solves - already covered this exact scenario and passed both before and after this
change, just slower in aggregate: ~850ms total before, ~4.3s total after across the full
22-combination sweep in the `break count` describe block's own throughput test). The
slowest single case (breakCount=7 "maximize count" at budget=60, 501ms) is the 3D
count-DP's `cMax = min(budgetMax, candidates.length)` now running at a much larger table
size than before, since far more candidates now exist at every cost level, not just up to
10. Still well inside budget - no need for a cheaper strategy or a reintroduced cap, but
flagged here as the one case worth watching if budgets grow substantially further.

## The three "still open" items - re-investigated after the real fix, not re-guessed

- **count=1 returning two breaks (Nov 10-26 with Nov 27-28 unfilled)**: this was a direct
  downstream symptom of `MAX_CANDIDATE_COST`, not a separate bug. With no candidate able
  to cost more than 10, a count=1 target that needed more than 10 PTO days to express as
  one break was never achievable as requested, so `solveExactCount`'s nearest-achievable
  fallback was settling for 2 breaks instead. Confirmed resolved live: count=1 at 15 PTO
  days now returns exactly one break card, `2026-11-28 -> 2026-12-20, 23 days off for 15
  PTO days` - no gap, no second break.
- **Alternatives uncapped, October nearly all dashed**: re-verified by counting rendered
  DOM cells directly (not reading the code), in the browser, in two scenarios:
  - Default view (5 primary breaks, "let the solver decide"): 37 dashed cells across
    exactly **6** contiguous date-runs - well within the 5 breaks x 2 = 10 maximum, and
    each run independently confirmed non-overlapping with any other break.
  - The count=1 extreme case (a single ~23-day "all in one" break): 44 dashed cells, but
    grouped into exactly **2** contiguous runs (~22 days each) - precisely the 2-per-break
    cap, just visually large because "all in one" alternatives are themselves long spans
    by construction. Not a cap failure; the cap held in both cases.
  The "nearly all dashed" appearance in the original report was most likely the same
  downstream symptom as the count=1 bug above (a fragmented, cap-truncated plan producing
  many short alternatives) rather than a distinct enforcement defect - with the real fix
  in place, both scenarios checked out cap-compliant by direct count.
- **Out-of-range days with alternative outlines at normal weight**: re-checked live;
  Oct 1-17 (range starts Oct 18) are `disabled: true`, `text-slate-300`, zero cells with
  `border-dashed` among them. This was already fixed by the out-of-range work in Phase 10
  (`isOutOfRange` suppresses the alternative overlay in `DayCell.tsx`); re-confirmed here
  rather than assumed.

## Tests

`solve.test.ts`, new describe block `candidate enumeration cap (regression: a single
break must be able to spend the full budget)`: count=1 at 2/15/40/80 PTO days each spend
the full budget in exactly one break (80 specifically to prove no fixed cap remains at
all, 8x the old constant); an explicit assertion that `budgetSpent` equals the full
budget whenever nothing is genuinely unspendable (so the "Using X of Y days" message has
nothing to trigger on for these inputs); and a timed full-year, 60-budget, count=1 solve
under the 1000ms ceiling. Also added: `position 1 spends the FULL budget in that one
break, not just however much fit under a stale per-candidate cap` in the existing `break
count` describe block, since the pre-existing `position 1 returns exactly one break` test
checked COUNT only and would have passed even under the old broken cap (a 1-break plan
costing 10 instead of 25 still satisfies "exactly one break") - it never actually
exercised the bug.

---

# Phase 12 — Bug check: the Phase 11 cap fix had its own blind spot

Requested as a follow-up sanity pass on Phase 11, not a response to a new report. Found
and fixed one real regression the Phase 11 fix itself introduced, by reasoning about the
fix's own edge cases rather than re-testing only the scenarios already covered.

## The bug: `maxCandidateCost` used `input.budget` alone, but dual-window spend isn't bounded by that alone

Phase 11's fix capped candidate enumeration at `Math.min(budgetMax, n)`, where
`budgetMax = Math.floor(input.budget)`. That's correct for the plain single-window case -
but with an expiry date set, a single candidate's cost splits across TWO budgets
(`cost1` pre-expiry, `cost2` post-expiry), and `budget2Max` (the post-expiry pool) is
`carryoverCap` plus any post-expiry accrual - a number that can legitimately exceed
`input.budget` on its own whenever `carryoverCap` adds room beyond it. Capping enumeration
at `budgetMax` alone silently excluded any boundary-crossing candidate needing more than
that, even when `budget1Max + budget2Max` genuinely allowed it - the exact same class of
bug Phase 11 had just fixed, just reintroduced in a narrower, easier-to-miss scope.

Reproduced directly: a holiday-free stretch straddling an expiry date, `budget: 5`,
`carryoverCap: 20` (so `budget1Max=5`, `budget2Max=20`, total 25 genuinely affordable).
Before this fix, `breakCount: 1` returned a single break capped at cost 5 - silently
truncated, with 20 of carryover never even offered to the solver. After the fix, the same
input returns a single break spanning the boundary at cost 20+ (varies with exactly where
the window falls), using carryover as intended.

**The fix**: `budget1Max`/`budget2Max` computation was pulled out of `solveDualWindow`
into a standalone `dualWindowBudgets()` helper, callable before any candidates are built.
`solve()` now computes `maxCandidateCost` as `budget1Max + budget2Max` when `expiryDate`
is set, and `budgetMax` alone otherwise - never just `input.budget` unconditionally.

## Also re-verified live, not just re-read

- **Dual-window UI path**: enabled "PTO expires on a date" and set a carryover cap
  through the actual `MoreOptions` form (not a direct `solve()` call) - renders cleanly,
  no console errors, confirming the fix reaches the UI through the normal
  `useAppState` -> `solveInput` -> `solve()` pipeline, not just the unit tests.
- **Non-US country path**: switched to Germany live - the "Estimated" tag appears on the
  generic-heuristic break, and the Travel score correctly read "18th · busier than most
  weeks" (a low percentile paired with the low-percentile gloss, confirming Phase 10's
  gloss-derivation fix holds on a real, non-synthetic result, not just the hand-built test
  fixtures).
- Re-read `DayCell.tsx`, `MonthGrid.tsx`, `useAppState.ts`, `BreakCountSlider.tsx`, and
  `SummaryStrip.tsx` fresh end-to-end (not from memory) specifically checking the
  out-of-range/alternative/pinned interactions, the `scores`/`totalDaysOff`/`budgetSpent`
  wiring, and the `letSolverDecide` branch of the caption - no further issues found.
  Confirmed `computeMarginalValues` and `holidayEntries` are both already scoped to
  `[rangeStart, rangeEnd]`, so an out-of-range date was never at risk of leaking a real
  tooltip or marginal value even before `DayCell`'s own `isOutOfRange` suppression - two
  independent layers happen to agree, not one relying on the other silently.

## Tests

New test in `solve.test.ts`'s `expiry windowing` describe block: a single candidate
spending more than `input.budget` alone via carryover, with budget/budgetSpent asserted
directly rather than inferred. 152 tests total, all passing; `tsc`/`build`/`lint` clean.
