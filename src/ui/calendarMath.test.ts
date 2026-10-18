import { describe, it, expect } from 'vitest';
import { buildMonths, computeBandSegments, computeQualifyingRuns } from './calendarMath';

describe('buildMonths week start', () => {
  it('defaults to Monday-first (column 0)', () => {
    // Jan 1, 2026 is a Thursday.
    const [jan] = buildMonths('2026-01-01', '2026-01-31');
    expect(jan.weeks[0]).toEqual([null, null, null, '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04']);
  });

  it('weekStart=0 puts Sunday first (US/CA/JP convention)', () => {
    const [jan] = buildMonths('2026-01-01', '2026-01-31', 0);
    // Jan 1 (Thu) is column 4 when the week starts Sunday; Jan 3 (Sat) is column 6.
    expect(jan.weeks[0]).toEqual([null, null, null, null, '2026-01-01', '2026-01-02', '2026-01-03']);
    expect(jan.weeks[1][0]).toBe('2026-01-04'); // Sunday starts the next row
  });
});

describe('buildMonths out-of-range days and fixed row count', () => {
  it('keeps real ISO dates for days outside [rangeStart, rangeEnd] within a partial first month, instead of erasing them to null', () => {
    // Range starts Oct 18 - Oct 1-17 are real calendar days, just not part of the solve.
    const [october] = buildMonths('2026-10-18', '2026-12-31');
    const allDays = october.weeks.flat().filter((d): d is string => d !== null);
    for (let day = 1; day <= 17; day++) {
      const iso = `2026-10-${String(day).padStart(2, '0')}`;
      expect(allDays).toContain(iso); // present as a real date, not nulled out
    }
    expect(allDays).toContain('2026-10-18'); // the in-range portion is still there too
  });

  it('every month is padded to exactly 6 rows (42 cells), regardless of how many weeks it actually needs', () => {
    // February 2026 needs only 4 rows; January 2026 needs 5. Both must render as 6.
    const months = buildMonths('2026-01-01', '2026-02-28');
    for (const month of months) {
      expect(month.weeks).toHaveLength(6);
      for (const week of month.weeks) {
        expect(week).toHaveLength(7);
      }
    }
  });

  it('only the leading/trailing grid-alignment cells are null - every real day of the month appears exactly once', () => {
    const [february] = buildMonths('2026-02-01', '2026-02-28');
    const realDays = february.weeks.flat().filter((d): d is string => d !== null);
    expect(realDays).toHaveLength(28); // Feb 2026 is not a leap year
    expect(new Set(realDays).size).toBe(28); // no duplicates
  });
});

describe('computeQualifyingRuns', () => {
  it('excludes a plain weekend with no PTO spent', () => {
    // Jan 3-4, 2026 is a Saturday-Sunday with nothing suggested.
    const isOff = (iso: string) => iso === '2026-01-03' || iso === '2026-01-04';
    const isSuggestedPto = () => false;
    const runs = computeQualifyingRuns('2026-01-01', '2026-01-31', isOff, isSuggestedPto);
    expect(runs).toEqual([]);
  });

  it('excludes a holiday adjoining a weekend with no PTO spent', () => {
    // Jan 2 (Fri, holiday) + Jan 3-4 (weekend): off, but the plan spent nothing here.
    const isOff = (iso: string) => ['2026-01-02', '2026-01-03', '2026-01-04'].includes(iso);
    const isSuggestedPto = () => false;
    const runs = computeQualifyingRuns('2026-01-01', '2026-01-31', isOff, isSuggestedPto);
    expect(runs).toEqual([]);
  });

  it('two separate weekends in one month with no PTO spent produce zero qualifying runs', () => {
    const offDates = new Set(['2026-01-03', '2026-01-04', '2026-01-10', '2026-01-11']);
    const runs = computeQualifyingRuns(
      '2026-01-01',
      '2026-01-31',
      (iso) => offDates.has(iso),
      () => false,
    );
    expect(runs).toEqual([]);
  });

  it('includes a run that contains at least one suggested-PTO day', () => {
    // Sat Jan3 - Sun Jan11 (9 days), PTO spent on the workdays Jan5,6,8,9.
    const offDates = new Set([
      '2026-01-03',
      '2026-01-04',
      '2026-01-05',
      '2026-01-06',
      '2026-01-07',
      '2026-01-08',
      '2026-01-09',
      '2026-01-10',
      '2026-01-11',
    ]);
    const ptoDates = new Set(['2026-01-05', '2026-01-06', '2026-01-08', '2026-01-09']);
    const runs = computeQualifyingRuns(
      '2026-01-01',
      '2026-01-31',
      (iso) => offDates.has(iso),
      (iso) => ptoDates.has(iso),
    );
    expect(runs).toEqual([{ start: '2026-01-03', end: '2026-01-11' }]);
  });
});

describe('computeBandSegments', () => {
  it('a Saturday-to-following-Sunday run (9 days) produces exactly 2 segments, never joined vertically', () => {
    const run = { start: '2026-01-03', end: '2026-01-11' };
    const months = buildMonths('2026-01-01', '2026-01-31');
    const january = months.find((m) => m.month === 1)!;

    let totalSegments = 0;
    for (const week of january.weeks) {
      const segments = computeBandSegments(week, [run]);
      totalSegments += segments.length;
    }
    expect(totalSegments).toBe(2);
  });

  it('splits at week boundaries: first row rounded-left only, second row rounded-right only', () => {
    const run = { start: '2026-01-03', end: '2026-01-11' };
    const months = buildMonths('2026-01-01', '2026-01-31');
    const january = months.find((m) => m.month === 1)!;

    const weekWithJan3 = january.weeks.find((w) => w.includes('2026-01-03'))!;
    const weekWithJan11 = january.weeks.find((w) => w.includes('2026-01-11'))!;
    expect(weekWithJan3).not.toBe(weekWithJan11);

    const seg1 = computeBandSegments(weekWithJan3, [run])[0];
    expect(seg1.roundedLeft).toBe(true);
    expect(seg1.roundedRight).toBe(false);

    const seg2 = computeBandSegments(weekWithJan11, [run])[0];
    expect(seg2.roundedLeft).toBe(false);
    expect(seg2.roundedRight).toBe(true);
  });

  it('two separate weekends with no PTO spent produce zero segments across the whole month', () => {
    const offDates = new Set(['2026-01-03', '2026-01-04', '2026-01-10', '2026-01-11']);
    const runs = computeQualifyingRuns(
      '2026-01-01',
      '2026-01-31',
      (iso) => offDates.has(iso),
      () => false,
    );
    const months = buildMonths('2026-01-01', '2026-01-31');
    const january = months.find((m) => m.month === 1)!;

    let totalSegments = 0;
    for (const week of january.weeks) {
      totalSegments += computeBandSegments(week, runs).length;
    }
    expect(totalSegments).toBe(0);
  });
});
