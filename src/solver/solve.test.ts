import { describe, it, expect } from 'vitest';
import { solve, computeScores, findAlternatives } from './solve';
import type { SolveInput } from './types';

function baseInput(overrides: Partial<SolveInput> = {}): SolveInput {
  return {
    offDays: [],
    rangeStart: '2026-01-03',
    rangeEnd: '2026-01-11',
    budget: 4,
    ...overrides,
  };
}

describe('standard four-day bridge', () => {
  it('turns a midweek holiday into 9 days off for 4 PTO days', () => {
    const { primary } = solve(
      baseInput({
        offDays: ['2026-01-07'], // Wednesday holiday
        rangeStart: '2026-01-03', // Saturday
        rangeEnd: '2026-01-11', // Sunday
        budget: 4,
      }),
    );
    expect(primary).toHaveLength(1);
    expect(primary[0].start).toBe('2026-01-03');
    expect(primary[0].end).toBe('2026-01-11');
    expect(primary[0].totalDaysOff).toBe(9);
    expect(primary[0].ptoCost).toBe(4);
  });
});

describe('deterministic tie-breaking', () => {
  // Two Wednesday-holiday weeks, each offering two equally-valued "half-bridge" options
  // (holiday-to-weekend on either side: 5 days off for 2 PTO days). Budget only affords
  // one of these four tied candidates, so the earliest-starting one must win.
  const input = baseInput({
    offDays: ['2026-01-07', '2026-02-04'],
    rangeStart: '2026-01-03',
    rangeEnd: '2026-02-08',
    budget: 2,
  });

  it('prefers the earlier-starting plan when multiple plans tie in value', () => {
    const { primary } = solve(input);
    expect(primary).toHaveLength(1);
    expect(primary[0].start).toBe('2026-01-03');
    expect(primary[0].end).toBe('2026-01-07');
    expect(primary[0].totalDaysOff).toBe(5);
    expect(primary[0].ptoCost).toBe(2);
  });

  it('produces byte-identical output across 100 runs', () => {
    const results = Array.from({ length: 100 }, () => solve(input));
    const first = JSON.stringify(results[0]);
    for (const r of results) {
      expect(JSON.stringify(r)).toBe(first);
    }
  });
});

describe('expiry windowing', () => {
  it('blocks a bridge that would overspend the post-expiry carryover budget', () => {
    const { primary } = solve(
      baseInput({
        offDays: ['2026-01-07'],
        rangeStart: '2026-01-03',
        rangeEnd: '2026-01-11',
        budget: 4,
        expiryDate: '2026-01-07',
        carryoverCap: 1, // the full bridge needs 2 post-expiry days, cap only allows 1
      }),
    );
    // Full 9-day bridge crosses the boundary needing 2 PTO days after expiry; disallowed.
    expect(primary.some((b) => b.start === '2026-01-03' && b.end === '2026-01-11')).toBe(false);
  });

  it('charges each window correctly and allows the crossing bridge when carryover suffices', () => {
    const { primary } = solve(
      baseInput({
        offDays: ['2026-01-07'],
        rangeStart: '2026-01-03',
        rangeEnd: '2026-01-11',
        budget: 4,
        expiryDate: '2026-01-07',
        carryoverCap: 2, // exactly covers the 2 post-expiry PTO days needed
      }),
    );
    expect(primary).toHaveLength(1);
    expect(primary[0].start).toBe('2026-01-03');
    expect(primary[0].end).toBe('2026-01-11');
    expect(primary[0].ptoCost).toBe(4); // 2 charged to window1 (Jan5,6), 2 to window2 (Jan8,9)
  });
});

describe('accrual', () => {
  it('prevents spending unearned PTO early in the range', () => {
    const { primary } = solve(
      baseInput({
        offDays: ['2026-01-07', '2026-02-04'],
        rangeStart: '2026-01-03',
        rangeEnd: '2026-02-08',
        budget: 4,
        accrualPerMonth: 4, // 0 accrued in month 0 (January), 4 accrued once February starts
      }),
    );
    // January bridge needs 4 PTO days before any has accrued -> blocked.
    expect(primary.some((b) => b.start === '2026-01-03')).toBe(false);
    // February bridge is reachable once a full month has elapsed.
    expect(primary.some((b) => b.start === '2026-01-31' && b.end === '2026-02-08')).toBe(true);
  });
});

describe('blackouts', () => {
  it('forces a different plan when a blackout invalidates the optimal bridge', () => {
    const { primary: withoutBlackout } = solve(
      baseInput({
        offDays: ['2026-01-07', '2026-02-04'],
        rangeStart: '2026-01-03',
        rangeEnd: '2026-02-08',
        budget: 4,
      }),
    );
    expect(withoutBlackout[0].start).toBe('2026-01-03'); // earlier bridge normally wins

    const { primary: withBlackout } = solve(
      baseInput({
        offDays: ['2026-01-07', '2026-02-04'],
        rangeStart: '2026-01-03',
        rangeEnd: '2026-02-08',
        budget: 4,
        blackouts: ['2026-01-07'], // kills the January bridge's free holiday
      }),
    );
    expect(withBlackout.some((b) => b.start === '2026-01-03' && b.end === '2026-01-11')).toBe(false);
    expect(withBlackout.some((b) => b.start === '2026-01-31' && b.end === '2026-02-08')).toBe(true);
  });

  it('blocks a bridge from spanning a blacked-out ordinary workday, not just a blacked-out holiday', () => {
    // Jan5 and Jan6 are plain Mon/Tue workdays inside the Jan3-11 bridge, not holidays or
    // weekends. Blacking out Jan6 must prevent any candidate from bridging across it at all.
    const { primary } = solve(
      baseInput({
        offDays: ['2026-01-07'],
        rangeStart: '2026-01-03',
        rangeEnd: '2026-01-11',
        budget: 4,
        blackouts: ['2026-01-06'],
      }),
    );
    expect(primary.some((b) => b.start === '2026-01-03' && b.end === '2026-01-11')).toBe(false);
    for (const b of primary) {
      expect(b.days).not.toContain('2026-01-06');
    }
  });
});

describe('optimisation weighting (slider 1)', () => {
  // A full year of real US federal holidays, rich enough for the weighting to have
  // genuinely different candidates to trade off against each other.
  const weightingInput = (w: number, overrides: Partial<SolveInput> = {}): SolveInput => ({
    offDays: [
      '2026-01-01', '2026-01-19', '2026-02-16', '2026-05-25', '2026-07-03',
      '2026-09-07', '2026-10-12', '2026-11-11', '2026-11-26', '2026-12-25',
    ],
    rangeStart: '2026-01-01',
    rangeEnd: '2026-12-31',
    budget: 25,
    country: 'US',
    w,
    ...overrides,
  });

  it('w=0 and w=100 return measurably different plans on the same input', () => {
    const low = solve(weightingInput(0)).primary;
    const high = solve(weightingInput(100)).primary;
    expect(JSON.stringify(low)).not.toBe(JSON.stringify(high));
  });

  it('w=100 yields a lower mean demand index across chosen breaks than w=0', () => {
    const low = solve(weightingInput(0)).primary;
    const high = solve(weightingInput(100)).primary;
    const meanOf = (brks: typeof low) => brks.reduce((s, b) => s + b.meanDemand, 0) / brks.length;
    expect(meanOf(high)).toBeLessThan(meanOf(low));
  });

  it('is a gradual continuum, not a step function: w=20 stays close to w=0, not jumping to w=100\'s shape', () => {
    const w0 = solve(weightingInput(0)).primary;
    const w20 = solve(weightingInput(20)).primary;
    const w100 = solve(weightingInput(100)).primary;
    const totalDaysOff = (brks: typeof w0) => brks.reduce((s, b) => s + b.totalDaysOff, 0);
    // w20 should still be much closer in total days off to w0 than to w100's heavily-fragmented plan.
    const distTo0 = Math.abs(totalDaysOff(w20) - totalDaysOff(w0));
    const distTo100 = Math.abs(totalDaysOff(w20) - totalDaysOff(w100));
    expect(distTo0).toBeLessThan(distTo100);
  });

  // Regression tests for the "w silently reduces how many PTO days get used" bug: the
  // weighting slider must only ever decide WHERE breaks land, never HOW MANY PTO days are
  // spent or how many breaks result - see solveAny()/betterCell() in solve.ts.
  describe('w never leaves spendable budget unused (regression)', () => {
    it.each([1, 5, 15, 40])('every w from 0 to 100 spends the same number of PTO days, at budget=%i', (budget) => {
      const spends = [0, 25, 50, 75, 100].map((w) => solve(weightingInput(w, { budget })).budgetSpent);
      const first = spends[0];
      for (const spent of spends) expect(spent).toBe(first);
      // and that number is the maximum this budget can actually use, not an arbitrary one -
      // spending less than the w=0 (pure days-off-maximizing) run's spend would mean budget
      // was left on the table purely because of w.
      const unconstrainedSpend = solve(weightingInput(0, { budget })).budgetSpent;
      expect(first).toBe(unconstrainedSpend);
    });

    it('with 15 PTO days and count=3, every w returns exactly 3 breaks', () => {
      for (const w of [0, 25, 50, 75, 100]) {
        const { primary, breakCountActual } = solve(weightingInput(w, { budget: 15, breakCount: 3 }));
        expect(breakCountActual).toBe(3);
        expect(primary).toHaveLength(3);
      }
    });

    it('w=0 and w=100 spend the same budget and return the same break count, but different dates', () => {
      const low = solve(weightingInput(0, { budget: 15 }));
      const high = solve(weightingInput(100, { budget: 15 }));
      expect(high.budgetSpent).toBe(low.budgetSpent);
      expect(high.primary).toHaveLength(low.primary.length);
      const lowDates = low.primary.map((b) => `${b.start}|${b.end}`).sort();
      const highDates = high.primary.map((b) => `${b.start}|${b.end}`).sort();
      expect(highDates).not.toEqual(lowDates);
    });

    it.each([1, 5, 15, 40])(
      'w=100 yields strictly lower mean demand and strictly fewer total days off than w=0, at budget=%i',
      (budget) => {
        const low = solve(weightingInput(0, { budget }));
        const high = solve(weightingInput(100, { budget }));
        const meanOf = (r: typeof low) => r.primary.reduce((s, b) => s + b.meanDemand, 0) / r.primary.length;
        const totalOf = (r: typeof low) => r.primary.reduce((s, b) => s + b.totalDaysOff, 0);
        expect(meanOf(high)).toBeLessThan(meanOf(low));
        expect(totalOf(high)).toBeLessThan(totalOf(low));
        // the tradeoff shows up as fewer days off, never as unspent PTO
        expect(high.budgetSpent).toBe(low.budgetSpent);
      },
    );
  });
});

describe('break count (slider 2)', () => {
  const countInput = (breakCount: number, overrides: Partial<SolveInput> = {}): SolveInput => ({
    offDays: [
      '2026-01-01', '2026-01-19', '2026-02-16', '2026-05-25', '2026-07-03',
      '2026-09-07', '2026-10-12', '2026-11-11', '2026-11-26', '2026-12-25',
    ],
    rangeStart: '2026-01-01',
    rangeEnd: '2026-12-31',
    budget: 25,
    country: 'US',
    w: 30,
    breakCount,
    ...overrides,
  });

  it('position 0 returns the same plan as the unconstrained solver at the same w', () => {
    const withZero = solve(countInput(0));
    const { breakCount: _omit, ...unconstrainedInput } = countInput(0);
    const unconstrained = solve(unconstrainedInput);
    expect(JSON.stringify(withZero)).toBe(JSON.stringify(unconstrained));
  });

  it('position 1 returns exactly one break', () => {
    const { primary, breakCountActual } = solve(countInput(1));
    expect(primary).toHaveLength(1);
    expect(breakCountActual).toBe(1);
  });

  it('position 1 spends the FULL budget in that one break, not just however much fit under a stale per-candidate cap', () => {
    // "Exactly one break" alone doesn't catch the old MAX_CANDIDATE_COST=10 bug - a single
    // break costing far less than the budget still satisfies "exactly 1 break." This
    // checks the thing that bug actually broke: budgetSpent must equal the full budget.
    const { primary, breakCountActual, budgetSpent } = solve(countInput(1, { budget: 25 }));
    expect(breakCountActual).toBe(1);
    expect(primary).toHaveLength(1);
    expect(budgetSpent).toBe(25);
    expect(primary[0].ptoCost).toBe(25);
  });

  it.each([2, 3, 4, 5, 6])('position %i returns exactly that many breaks when feasible', (n) => {
    const { primary, breakCountRequested, breakCountActual } = solve(countInput(n));
    expect(breakCountRequested).toBe(n);
    expect(breakCountActual).toBe(n);
    expect(primary).toHaveLength(n);
  });

  it('increasing the count monotonically decreases average break length (ties allowed)', () => {
    const avgLengths = [1, 2, 3, 4, 5, 6].map((n) => {
      const { primary } = solve(countInput(n));
      return primary.reduce((s, b) => s + b.totalDaysOff, 0) / primary.length;
    });
    for (let i = 1; i < avgLengths.length; i++) {
      expect(avgLengths[i]).toBeLessThanOrEqual(avgLengths[i - 1]);
    }
  });

  it('6 breaks on 2 PTO days degrades to the nearest achievable count, never an empty calendar', () => {
    const result = solve({
      offDays: ['2026-01-07'],
      rangeStart: '2026-01-03',
      rangeEnd: '2026-01-11',
      budget: 2,
      breakCount: 6,
    });
    expect(result.breakCountRequested).toBe(6);
    expect(result.breakCountActual).toBeLessThan(6);
    expect(result.breakCountActual).toBeGreaterThan(0);
    expect(result.primary.length).toBeGreaterThan(0);
    expect(result.primary).toHaveLength(result.breakCountActual);
  });

  it("position 7 maximises break count, uncapped at 7", () => {
    const { primary, breakCountActual } = solve(countInput(7));
    const unconstrained = solve(countInput(0));
    expect(breakCountActual).toBeGreaterThanOrEqual(unconstrained.primary.length);
    expect(primary).toHaveLength(breakCountActual);
  });

  it('breakCountActual always matches primary.length, at every position', () => {
    for (let n = 0; n <= 7; n++) {
      const { primary, breakCountActual } = solve(countInput(n));
      expect(breakCountActual).toBe(primary.length);
    }
  });

  it('every count works at every weighting value without throwing', () => {
    for (const w of [0, 30, 50, 100]) {
      for (let n = 0; n <= 7; n++) {
        expect(() => solve(countInput(n, { w }))).not.toThrow();
      }
    }
  });
});

describe('determinism across (w, breakCount) pairs', () => {
  it.each([
    [0, 0], [30, 0], [100, 0], [30, 1], [30, 3], [100, 3], [0, 7], [30, 7],
  ])('w=%i, breakCount=%i produces identical output across 100 runs', (w, breakCount) => {
    const input: SolveInput = {
      offDays: ['2026-01-08', '2026-02-04'],
      rangeStart: '2026-01-03',
      rangeEnd: '2026-02-08',
      budget: 10,
      w,
      breakCount,
    };
    const results = Array.from({ length: 100 }, () => solve(input));
    const first = JSON.stringify(results[0]);
    for (const r of results) {
      expect(JSON.stringify(r)).toBe(first);
    }
  });
});

describe('performance', () => {
  it('a full-year solve completes quickly at every (w, breakCount) combination', () => {
    const input: SolveInput = {
      offDays: [
        '2026-01-01', '2026-01-19', '2026-02-16', '2026-05-25', '2026-07-03',
        '2026-09-07', '2026-10-12', '2026-11-11', '2026-11-26', '2026-12-25',
      ],
      rangeStart: '2026-01-01',
      rangeEnd: '2026-12-31',
      budget: 60,
      country: 'US',
    };
    for (const w of [0, 50, 100]) {
      for (const breakCount of [0, 1, 3, 7]) {
        const start = performance.now();
        solve({ ...input, w, breakCount });
        const elapsed = performance.now() - start;
        expect(elapsed).toBeLessThan(1000);
      }
    }
  });
});

describe('candidate enumeration cap (regression: a single break must be able to spend the full budget)', () => {
  // Real root cause of "15 PTO days returns only 10 spent": buildCandidates used to stop
  // extending a candidate interval once its workday cost passed a fixed MAX_CANDIDATE_COST
  // (10), regardless of how much budget the user actually had. No candidate costing more
  // than 10 could ever exist, so a single break could never spend more than that - not
  // because the solver declined to, but because it was never shown the option. The cap is
  // now bounded by the caller's own budget (and by the range length), never a constant.
  const fullYearInput = (overrides: Partial<SolveInput> = {}): SolveInput => ({
    offDays: [
      '2026-01-01', '2026-01-19', '2026-02-16', '2026-05-25', '2026-07-03',
      '2026-09-07', '2026-10-12', '2026-11-11', '2026-11-26', '2026-12-25',
    ],
    rangeStart: '2026-01-01',
    rangeEnd: '2026-12-31',
    budget: 0,
    country: 'US',
    breakCount: 1,
    ...overrides,
  });

  it('15 PTO days at count=1: exactly one break, all 15 spent, at least 19 calendar days (15 workdays + the weekends inside)', () => {
    const { primary, breakCountActual, budgetSpent } = solve(fullYearInput({ budget: 15 }));
    expect(breakCountActual).toBe(1);
    expect(primary).toHaveLength(1);
    expect(budgetSpent).toBe(15);
    expect(primary[0].ptoCost).toBe(15);
    expect(primary[0].totalDaysOff).toBeGreaterThanOrEqual(19);
  });

  it('40 PTO days at count=1 over a full year: one break spending all 40 - more than 4x the old fixed cap', () => {
    const { primary, breakCountActual, budgetSpent } = solve(fullYearInput({ budget: 40 }));
    expect(breakCountActual).toBe(1);
    expect(primary).toHaveLength(1);
    expect(budgetSpent).toBe(40);
    expect(primary[0].ptoCost).toBe(40);
  });

  it('2 PTO days at count=1: one break spending 2 - the cap change must not break small budgets', () => {
    const { primary, breakCountActual, budgetSpent } = solve(fullYearInput({ budget: 2 }));
    expect(breakCountActual).toBe(1);
    expect(primary).toHaveLength(1);
    expect(budgetSpent).toBe(2);
  });

  it('no fixed numeric cap remains: 80 PTO days (8x the old constant) at count=1 still spends all 80 in one break', () => {
    const { primary, breakCountActual, budgetSpent } = solve(fullYearInput({ budget: 80 }));
    expect(breakCountActual).toBe(1);
    expect(primary).toHaveLength(1);
    expect(budgetSpent).toBe(80);
    expect(primary[0].ptoCost).toBe(80);
  });

  it('the unspent-budget condition is real, not inferred from the solver stopping: a plan that spends the full budget never shows it', () => {
    const result = solve(fullYearInput({ budget: 15 }));
    expect(result.budgetSpent).toBe(15); // nothing left unspent, so no "Using X of 15" message should ever be shown for this input
  });

  it('a full-year range at 60 PTO days, count=1, solves without perceptible lag', () => {
    const input = fullYearInput({ budget: 60 });
    solve(input); // warm up
    const start = performance.now();
    const result = solve(input);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(1000);
    expect(result.budgetSpent).toBe(60);
  });
});

describe('travel demand tagging', () => {
  // Real, honestly-smoothed TSA data: no day in the whole year crosses the 1.25
  // "Peak travel" threshold (the highest is ~1.22, a summer Sunday) - the
  // smoothing that correctly avoids distorting the weekly rhythm also damps
  // one-off holiday spikes. "Low travel demand" (<=0.85) is reachable though,
  // e.g. the back half of January.
  it('tags a real low-travel-demand US break, plus Overlaps when relevant', () => {
    const { primary } = solve(
      baseInput({
        offDays: ['2026-01-21'], // Wednesday
        rangeStart: '2026-01-17', // Saturday
        rangeEnd: '2026-01-25', // Sunday
        budget: 4,
        country: 'US',
        overlapDays: ['2026-01-19'],
      }),
    );
    expect(primary).toHaveLength(1);
    expect(primary[0].tags).toContain('Low travel demand');
    expect(primary[0].tags).not.toContain('Peak travel');
    expect(primary[0].tags).not.toContain('Estimated');
    expect(primary[0].tags).toContain('Overlaps');
  });

  it('leaves mid-range demand breaks untagged', () => {
    const { primary } = solve(
      baseInput({
        offDays: ['2026-01-07'],
        rangeStart: '2026-01-03',
        rangeEnd: '2026-01-11',
        budget: 4,
        country: 'US',
      }),
    );
    expect(primary).toHaveLength(1);
    const demandTags = primary[0].tags.filter(
      (t) => t === 'Peak travel' || t === 'Low travel demand' || t === 'Estimated',
    );
    expect(demandTags).toHaveLength(0);
  });

  it('falls back to a generic "Estimated" tag for non-US countries', () => {
    const { primary } = solve(
      baseInput({
        offDays: ['2025-12-24'],
        rangeStart: '2025-12-20',
        rangeEnd: '2025-12-28',
        budget: 4,
        country: 'FR',
      }),
    );
    expect(primary.length).toBeGreaterThan(0);
    expect(primary[0].tags).toContain('Estimated');
    expect(primary[0].tags).not.toContain('Peak travel');
  });
});

describe('standalone single-day candidates', () => {
  it('break count target of 7 (maximise) spends budget on isolated single days when that is best', () => {
    const { primary, breakCountActual } = solve({
      offDays: [], // no holidays at all - only standalone single days are available
      rangeStart: '2026-01-03',
      rangeEnd: '2026-02-08',
      budget: 5,
      breakCount: 7,
    });
    expect(breakCountActual).toBe(5);
    expect(primary.length).toBe(5);
    for (const b of primary) {
      expect(b.totalDaysOff).toBe(1);
      expect(b.ptoCost).toBe(1);
    }
  });
});

describe('score percentiles (travel & efficiency)', () => {
  // No natural off days anywhere (a 7-day work week, no holidays) within a "flat" generic-
  // heuristic month (not Mar/Apr, Jul/Aug, or Dec20-Jan2), so every day's demand is
  // exactly 1.0 (the generic heuristic's flat baseline) - a clean fixture for an exact,
  // hand-verifiable percentile.
  const flatInput = (overrides: Partial<SolveInput> = {}): SolveInput => ({
    offDays: [],
    rangeStart: '2026-09-01',
    rangeEnd: '2026-09-14',
    budget: 5,
    workWeek: [true, true, true, true, true, true, true],
    ...overrides,
  });

  it('a perfectly flat week distribution gives a travel percentile of 100, not a penalised tie', () => {
    // Every week in range has the same demand as the plan's own mean demand (all 1.0), so
    // the plan is tied with every week - it is, honestly, AT LEAST AS QUIET as all of
    // them. Percentile rank is inclusive of ties (standard convention: "you scored better
    // than or equal to X% of the field"), which is why this is 100, not a value that
    // excludes the ties it's tied with - see the percentile-rank bug writeup in NOTES.md.
    const input = flatInput();
    const scores = computeScores(input, solve(input));
    expect(scores!.travel.percentile).toBe(100);
  });

  it('a quiet plan shows the percentile of weeks it is at least as quiet as - verifies the travel inversion', () => {
    // Feb 15 - Apr 11 2026 is exactly 8 non-overlapping 7-day weeks. Feb (weeks 1-2) is
    // the generic heuristic's flat baseline (demand 1.0); Mar/Apr (weeks 3-8) sit in its
    // elevated window (demand 1.1). A 7-day work week with no holidays means every day is
    // a standalone candidate, so at budget=2 and w=30 the solver - which always prefers
    // lower demand once w > 0 - picks 2 Feb days: mean demand exactly 1.0, tied with the
    // 2 flat weeks and strictly quieter than the 6 elevated ones - the quietest achievable
    // outcome, so a correctly-inverted, inclusive-of-ties percentile is 100 (all 8 weeks
    // are "not quieter than" this plan). A naively un-inverted implementation (counting
    // weeks QUIETER than the plan, the same direction efficiency uses) would instead find
    // only the 2 tied weeks, giving 25% - a materially different, wrong number, which is
    // exactly the silently-plausible-but-backwards failure mode being guarded against.
    const input: SolveInput = {
      offDays: [],
      rangeStart: '2026-02-15',
      rangeEnd: '2026-04-11',
      budget: 2,
      workWeek: [true, true, true, true, true, true, true],
      w: 30,
    };
    const result = solve(input);
    const meanDemand = result.primary.reduce((s, b) => s + b.meanDemand, 0) / result.primary.length;
    expect(meanDemand).toBe(1); // confirms the solver actually picked the 2 Feb days, as reasoned above
    const scores = computeScores(input, result)!;
    expect(scores.travel.percentile).toBe(100);
  });

  it('a plan tied for the efficiency maximum scores at or near 100, never a low percentile for the best achievable outcome', () => {
    // This is the exact regression: 15 PTO days returning 32 days off (a 2.13x multiplier)
    // previously scored 14th percentile, because w=0 through w=80 all tie at the SAME
    // maximum efficiency (Phase 6/7 deliberately made spend and plan structure flat across
    // wide ranges of w), and the old strict "count how many I beat" formula only credited
    // beating the one w=100 point that was worse. At w=0 specifically, the plan IS the
    // efficiency maximum by construction - the unconstrained, pure-days-off-maximizing
    // solve - so its percentile against a distribution that necessarily includes that same
    // w=0 result must be 100, not a number that punishes it for tying with itself.
    const offDays = [
      '2026-01-01', '2026-01-19', '2026-02-16', '2026-05-25', '2026-07-03',
      '2026-09-07', '2026-10-12', '2026-11-11', '2026-11-26', '2026-12-25',
    ];
    const input: SolveInput = { offDays, rangeStart: '2026-01-01', rangeEnd: '2026-12-31', budget: 15, country: 'US', w: 0 };
    const scores = computeScores(input, solve(input))!;
    expect(scores.efficiency.percentile).toBeGreaterThanOrEqual(95);
  });

  it('efficiency percentile changes when the PTO budget changes - it is computed against a real distribution, not a stored constant', () => {
    // w=100 specifically: unlike w=30 (which ties the maximum at every budget below, and
    // so always reads 100), w=100 is measurably off the maximum, which is what actually
    // exercises budget-dependent movement rather than three repeats of the same ceiling.
    const offDays = [
      '2026-01-01', '2026-01-19', '2026-02-16', '2026-05-25', '2026-07-03',
      '2026-09-07', '2026-10-12', '2026-11-11', '2026-11-26', '2026-12-25',
    ];
    const baseScoreInput: Omit<SolveInput, 'budget'> = {
      offDays, rangeStart: '2026-01-01', rangeEnd: '2026-12-31', country: 'US', w: 100,
    };
    const scoresLowBudget = computeScores(
      { ...baseScoreInput, budget: 5 },
      solve({ ...baseScoreInput, budget: 5 }),
    )!;
    const scoresHighBudget = computeScores(
      { ...baseScoreInput, budget: 40 },
      solve({ ...baseScoreInput, budget: 40 }),
    )!;
    expect(scoresHighBudget.efficiency.percentile).not.toBe(scoresLowBudget.efficiency.percentile);
  });

  it('moving the weighting slider 0 to 100 raises the travel percentile, lowers the efficiency percentile, and leaves PTO days spent unchanged', () => {
    const offDays = [
      '2026-01-01', '2026-01-19', '2026-02-16', '2026-05-25', '2026-07-03',
      '2026-09-07', '2026-10-12', '2026-11-11', '2026-11-26', '2026-12-25',
    ];
    const inputLow: SolveInput = {
      offDays, rangeStart: '2026-01-01', rangeEnd: '2026-12-31', budget: 15, country: 'US', w: 0,
    };
    const inputHigh: SolveInput = { ...inputLow, w: 100 };
    const resultLow = solve(inputLow);
    const resultHigh = solve(inputHigh);
    const scoresLow = computeScores(inputLow, resultLow)!;
    const scoresHigh = computeScores(inputHigh, resultHigh)!;

    expect(scoresHigh.travel.percentile).toBeGreaterThan(scoresLow.travel.percentile);
    expect(scoresHigh.efficiency.percentile).toBeLessThan(scoresLow.efficiency.percentile);
    expect(resultHigh.budgetSpent).toBe(resultLow.budgetSpent);
  });

  it('removing the "Any" position does not change the default result: breakCount 0 ("let the solver decide") is unaffected', () => {
    const input: SolveInput = {
      offDays: ['2026-01-07', '2026-02-04'],
      rangeStart: '2026-01-03',
      rangeEnd: '2026-02-08',
      budget: 4,
      breakCount: 0,
    };
    const { breakCount: _omit, ...withoutBreakCount } = input;
    expect(solve(input)).toEqual(solve(withoutBreakCount));
  });

  it('returns null when there is no plan to score', () => {
    const input: SolveInput = { offDays: [], rangeStart: '2026-01-03', rangeEnd: '2026-01-04', budget: 0 };
    expect(computeScores(input, solve(input))).toBeNull();
  });
});

describe('alternatives', () => {
  const input = baseInput({
    offDays: ['2026-01-07', '2026-02-04'],
    rangeStart: '2026-01-03',
    rangeEnd: '2026-02-08',
    budget: 2,
  });

  it('never overlaps other primary breaks', () => {
    const { primary, alternatives } = solve(input);
    for (const alt of alternatives) {
      for (const p of primary) {
        if (p.start === alt.replaces.start && p.end === alt.replaces.end) continue; // the one it replaces
        const overlaps = alt.start <= p.end && p.start <= alt.end;
        expect(overlaps).toBe(false);
      }
    }
  });

  it('same PTO cost as the primary break it replaces', () => {
    const { primary, alternatives } = solve(input);
    for (const alt of alternatives) {
      const replaced = primary.find((p) => p.start === alt.replaces.start && p.end === alt.replaces.end);
      expect(replaced).toBeDefined();
      expect(alt.ptoCost).toBe(replaced!.ptoCost);
    }
  });

  it('returns the same alternatives every time (deterministic)', () => {
    const results = Array.from({ length: 20 }, () => solve(input));
    const first = JSON.stringify(results[0].alternatives);
    for (const r of results) {
      expect(JSON.stringify(r.alternatives)).toBe(first);
    }
  });

  it('finds alternative placements for the chosen bridge', () => {
    const { alternatives } = solve(input);
    expect(alternatives.length).toBeGreaterThan(0);
    expect(alternatives.length).toBeLessThanOrEqual(2);
  });

  it('never exceeds MAX_ALTERNATIVES_PER_BREAK (2) per break, even when far more than 2 candidates tie in value', () => {
    // A 7-day work week with no holidays over a wide range makes every day a standalone,
    // identically-valued candidate (length=1, cost=1) - dozens tie exactly, which is
    // exactly the scenario that would expose a broken cap (many qualify, but only 2 may
    // ever be kept per break).
    const { primary, alternatives } = solve({
      offDays: [],
      rangeStart: '2026-01-01',
      rangeEnd: '2026-03-31',
      budget: 5,
      workWeek: [true, true, true, true, true, true, true],
      breakCount: 7, // forces standalone single-day breaks, maximizing primary.length
    });
    expect(primary.length).toBeGreaterThan(0);
    const countsByReplaced = new Map<string, number>();
    for (const alt of alternatives) {
      const key = `${alt.replaces.start}|${alt.replaces.end}`;
      countsByReplaced.set(key, (countsByReplaced.get(key) ?? 0) + 1);
    }
    for (const count of countsByReplaced.values()) {
      expect(count).toBeLessThanOrEqual(2);
    }
    // And there genuinely were more than 2 tied candidates available per break, so this
    // test is actually exercising the cap, not just trivially satisfying it.
    expect(alternatives.length).toBeGreaterThan(0);
  });

  it('keeps the 2 candidates closest to the primary\'s own value, not simply the 2 highest-valued in the tolerance window', () => {
    // 5 same-cost, same-length (so tolerance-qualifying) candidates spread across a wide
    // value range via their overlap-day bonus (the only thing that can differ between
    // otherwise-identical length=1,cost=1 candidates at w=0): distances from primary's
    // value are 0, 1, 2, 3, 4. "Closest" must keep exactly the 0- and 1-distance ones,
    // never reaching past them for a higher-but-farther candidate.
    const primary = { length: 3, cost: 1, overlapDayCount: 0 } as Parameters<typeof findAlternatives>[0];
    const pool = [0, 1, 2, 3, 4].map((overlapDayCount, i) => ({
      length: 3,
      cost: 1,
      overlapDayCount,
      startIdx: 100 + i * 10,
      endIdx: 102 + i * 10,
      start: `2026-0${i + 2}-01`,
      end: `2026-0${i + 2}-03`,
      cost1: 1,
      cost2: 0,
      demandSum: 3,
      demandDeviationScaled: 0,
    })) as unknown as Parameters<typeof findAlternatives>[2];
    const kept = findAlternatives(primary, [], pool, 0);
    expect(kept).toHaveLength(2);
    const keptOverlaps = kept.map((c) => (c as unknown as { overlapDayCount: number }).overlapDayCount).sort();
    expect(keptOverlaps).toEqual([0, 1]); // the two closest to primary's own (0-distance) value
  });
});

describe('edge cases', () => {
  it('returns cleanly for an empty range', () => {
    const result = solve(baseInput({ rangeStart: '2026-02-01', rangeEnd: '2026-01-01' }));
    expect(result).toEqual({
      primary: [],
      alternatives: [],
      breakCountRequested: 0,
      breakCountActual: 0,
      budgetSpent: 0,
    });
  });

  it('returns cleanly for zero budget', () => {
    const result = solve(baseInput({ offDays: ['2026-01-07'], budget: 0 }));
    expect(result.primary).toEqual([]);
  });

  it('returns cleanly when budget exceeds available workdays', () => {
    const { primary } = solve(baseInput({ offDays: ['2026-01-07'], budget: 1000 }));
    expect(() => primary).not.toThrow();
    const totalCost = primary.reduce((sum, b) => sum + b.ptoCost, 0);
    expect(totalCost).toBeLessThanOrEqual(9); // can't exceed workdays actually present in the range
  });
});
