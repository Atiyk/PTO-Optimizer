import { describe, expect, it } from 'vitest';
import { addDays, mondayIndexedDow, rangeISO } from './dateUtils';
import { solve } from './solve';
import { DEFAULT_WORK_WEEK, type SolveInput } from './types';

/**
 * Issue 5: recommendation completeness. Every recommended break must be a real,
 * separate absence: it includes the free days touching it (you get them anyway),
 * it never touches another recommended break (that would be one absence counted
 * twice), and it can end on a workday when the next day is a required work day
 * or lies past the end of the planning range.
 */

const HOLIDAYS = [
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-05-25', '2026-07-03', '2026-09-07',
  '2026-10-12', '2026-11-11', '2026-11-26', '2026-12-25', '2027-01-01', '2027-05-31',
  '2027-07-05', '2027-11-25', '2027-12-24',
];

function isFree(input: SolveInput, iso: string): boolean {
  if ((input.blackouts ?? []).includes(iso)) return false;
  const workWeek = input.workWeek ?? DEFAULT_WORK_WEEK;
  return !workWeek[mondayIndexedDow(iso)] || input.offDays.includes(iso);
}

/** Problems with the plan's shape, as readable strings (empty = valid). */
function shapeProblems(input: SolveInput): string[] {
  const { primary } = solve(input);
  const problems: string[] = [];
  primary.forEach((brk, i) => {
    const before = addDays(brk.start, -1);
    const after = addDays(brk.end, 1);
    if (before >= input.rangeStart && isFree(input, before)) problems.push(`${brk.id} leaves out free day ${before}`);
    if (after <= input.rangeEnd && isFree(input, after)) problems.push(`${brk.id} leaves out free day ${after}`);
    const next = primary[i + 1];
    if (next && after >= next.start) problems.push(`${brk.id} touches ${next.id}`);
  });
  return problems;
}

function rng(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

function sweepInputs(count: number, seed: number): SolveInput[] {
  const r = rng(seed);
  return Array.from({ length: count }, () => {
    const start = addDays('2026-01-01', Math.floor(r() * 400));
    const len = [7, 14, 30, 60, 120, 365][Math.floor(r() * 6)];
    const blackouts = r() < 0.3 ? Array.from({ length: 1 + Math.floor(r() * 4) }, () => addDays(start, Math.floor(r() * len))) : [];
    return {
      offDays: HOLIDAYS, rangeStart: start, rangeEnd: addDays(start, len - 1),
      budget: 1 + Math.floor(r() * 25), breakCount: Math.floor(r() * 8),
      w: [0, 30, 70, 100][Math.floor(r() * 4)], country: r() < 0.5 ? 'US' : 'DE', blackouts,
    };
  });
}

describe('a break can end right before a required work day', () => {
  it('uses Mon-Thu before a ruled-out Friday instead of one isolated day', () => {
    const result = solve({
      offDays: [], rangeStart: '2026-06-06', rangeEnd: '2026-06-14', budget: 4,
      blackouts: ['2026-06-12'], breakCount: 1, w: 0,
    });
    expect(result.primary.map((b) => b.id)).toEqual(['2026-06-06|2026-06-11']);
    expect(result.budgetSpent).toBe(4);
    expect(result.primary[0].totalDaysOff).toBe(6);
  });
});

describe('a break can run to the last day of the planning range', () => {
  it('uses the final Mon-Thu when the range ends on a Thursday', () => {
    const result = solve({ offDays: [], rangeStart: '2026-06-06', rangeEnd: '2026-06-11', budget: 4, breakCount: 1, w: 0 });
    expect(result.primary.map((b) => b.id)).toEqual(['2026-06-06|2026-06-11']);
    expect(result.budgetSpent).toBe(4);
  });
});

describe('recommended breaks are separate absences', () => {
  it('does not split one absence into two "breaks" to meet a break-count target', () => {
    // Before the fix this returned Jan 28 and Jan 29-Feb 1 2026 as two of the five
    // requested breaks, though they are one continuous absence.
    const input: SolveInput = {
      offDays: HOLIDAYS, rangeStart: '2026-01-23', rangeEnd: '2027-01-22', budget: 19,
      breakCount: 5, w: 100, country: 'US', blackouts: ['2026-09-05', '2027-01-17'],
    };
    expect(shapeProblems(input)).toEqual([]);
  });

  it('counts the weekend next to a single PTO Friday as part of that break', () => {
    const { primary } = solve({ offDays: [], rangeStart: '2026-06-01', rangeEnd: '2026-06-28', budget: 10, breakCount: 7, w: 0 });
    for (const brk of primary) {
      if (mondayIndexedDow(brk.end) === 4) throw new Error(`${brk.id} ends on a Friday before a free weekend`);
    }
    expect(shapeProblems({ offDays: [], rangeStart: '2026-06-01', rangeEnd: '2026-06-28', budget: 10, breakCount: 7, w: 0 })).toEqual([]);
  });

  it('holds across a deterministic sweep of 150 varied inputs', () => {
    const failures = sweepInputs(150, 7)
      .map((input) => ({ input, problems: shapeProblems(input) }))
      .filter((entry) => entry.problems.length > 0);
    expect(failures.map((f) => `${f.input.rangeStart} b${f.input.budget} bc${f.input.breakCount}: ${f.problems[0]}`)).toEqual([]);
  });

  it('a pinned workday next to a weekend joins that weekend', () => {
    const { primary } = solve({
      offDays: [], rangeStart: '2026-06-01', rangeEnd: '2026-06-30', budget: 1,
      mustIncludeDays: ['2026-06-12'], breakCount: 1, w: 0,
    });
    expect(primary.map((b) => b.id)).toEqual(['2026-06-12|2026-06-14']);
    expect(primary[0].totalDaysOff).toBe(3);
    expect(primary[0].ptoCost).toBe(1);
  });
});

describe('determinism', () => {
  it('returns byte-identical results for the same input', () => {
    for (const input of sweepInputs(20, 11)) {
      expect(JSON.stringify(solve(input))).toBe(JSON.stringify(solve({ ...input })));
    }
  });

  it('every recommended day is inside the range and off a blackout', () => {
    for (const input of sweepInputs(60, 3)) {
      const days = new Set(rangeISO(input.rangeStart, input.rangeEnd));
      for (const brk of solve(input).primary) {
        for (const d of brk.days) {
          expect(days.has(d)).toBe(true);
          expect(input.blackouts?.includes(d)).toBe(false);
        }
      }
    }
  });
});

describe('issue 6: travel weighting does not chase a copied 2025 weekday', () => {
  it('keeps free-weekend bridges instead of isolated midweek days in a quiet season', () => {
    // Jan-Feb 2026 with no holidays. Before the fix, w=70 picked lone Wednesdays (Jan 14,
    // Jan 21, Jan 28, Feb 4), each 1 day off for 1 PTO day and tagged "Low travel demand",
    // over 3-day weekend bridges in the same weeks - only because those month-days were
    // Tuesdays in 2025, the source year.
    for (const w of [70, 100]) {
      const { primary } = solve({ offDays: [], rangeStart: '2026-01-01', rangeEnd: '2026-02-28', budget: 6, w, country: 'US' });
      expect(primary.filter((b) => b.totalDaysOff < 3).map((b) => b.id), `w=${w}`).toEqual([]);
    }
  });
});
