import { describe, it, expect } from 'vitest';
import { DEFAULT_WORK_WEEK } from '../solver/types';
import type { Break, WorkWeek } from '../solver/types';
import {
  nearestPrecedingWorkday,
  requestByDate,
  requestByText,
  isContested,
  isQuietWindow,
  mostContestedBreakId,
} from './requestDeadline';

function makeBreak(overrides: Partial<Break> = {}): Break {
  return {
    id: '2026-12-19|2026-12-27',
    start: '2026-12-19',
    end: '2026-12-27',
    days: [],
    totalDaysOff: 9,
    ptoCost: 4,
    multiplier: 2.25,
    tags: [],
    meanDemand: 1,
    ...overrides,
  };
}

describe('nearestPrecedingWorkday', () => {
  it('returns the same date when it is already a working day', () => {
    // 2026-12-14 is a Monday.
    expect(nearestPrecedingWorkday('2026-12-14', DEFAULT_WORK_WEEK)).toBe('2026-12-14');
  });

  it('shifts a Saturday back to the preceding Friday - "a deadline on a Saturday is useless"', () => {
    // 2026-12-19 is a Saturday.
    expect(nearestPrecedingWorkday('2026-12-19', DEFAULT_WORK_WEEK)).toBe('2026-12-18');
  });

  it('shifts a Sunday back two days to the preceding Friday', () => {
    expect(nearestPrecedingWorkday('2026-12-20', DEFAULT_WORK_WEEK)).toBe('2026-12-18');
  });

  it('respects a custom work week (e.g. Friday off)', () => {
    const fourDayWeek: WorkWeek = [true, true, true, true, false, false, false];
    // 2026-12-18 is a Friday, off in this work week - should shift to Thursday.
    expect(nearestPrecedingWorkday('2026-12-18', fourDayWeek)).toBe('2026-12-17');
  });

  it('returns no deadline when there is no working day or the date is invalid', () => {
    expect(nearestPrecedingWorkday('2026-12-18', [false, false, false, false, false, false, false])).toBeNull();
    expect(nearestPrecedingWorkday('2026-02-30', DEFAULT_WORK_WEEK)).toBeNull();
  });
});

describe('requestByDate', () => {
  it('subtracts the notice period and lands on the correct working day', () => {
    // Break starts Sat 2026-12-19; 14 days before = Sat 2026-12-05 (also a Saturday) ->
    // shifts back to Fri 2026-12-04.
    expect(requestByDate('2026-12-19', 14, DEFAULT_WORK_WEEK)).toBe('2026-12-04');
  });

  it('uses the exact same subtraction the .ics reminder uses (shared noticePeriodDays)', () => {
    // No weekend shift needed here: 2026-12-01 (Tue) - 14 = 2026-11-17 (Tue).
    expect(requestByDate('2026-12-01', 14, DEFAULT_WORK_WEEK)).toBe('2026-11-17');
  });

  it('shifts past employer holidays and alternate Fridays as well as weekends', () => {
    expect(requestByDate('2026-12-19', 14, DEFAULT_WORK_WEEK, ['2026-12-03', '2026-12-04'])).toBe('2026-12-02');
  });
});

describe('requestByText', () => {
  const workWeek = DEFAULT_WORK_WEEK;

  it('gives the plain countdown when the deadline is more than a week away', () => {
    // Break starts 2027-03-01 (Monday), notice=14 -> deadline 2027-02-15 (Monday).
    // today = 2026-10-25: far more than a week before the deadline.
    const text = requestByText('2027-03-01', 14, workWeek, '2026-10-25');
    expect(text).toContain('Request by');
    expect(text).toContain('days from now');
  });

  it('switches to urgency wording naming the closing weekday within the last week', () => {
    // Deadline 2026-12-04 (Friday). today = 2026-11-30 (Monday): 4 days before deadline.
    const text = requestByText('2026-12-19', 14, workWeek, '2026-11-30');
    expect(text).toBe('Request this week — the notice window closes Friday.');
  });

  it('says the window has already started once the deadline has passed', () => {
    const text = requestByText('2026-12-19', 14, workWeek, '2026-12-10');
    expect(text).toBe('Request now — the notice window has already started.');
  });

  it('also treats "deadline is today" as already started, not a countdown to zero', () => {
    const text = requestByText('2026-12-19', 14, workWeek, '2026-12-04');
    expect(text).toContain('already started');
  });
});

describe('isContested / isQuietWindow (Phase 4.2: calendar demand, independent of w)', () => {
  it('flags a break with high mean demand as contested regardless of its tags', () => {
    // No 'Peak travel' tag present (as would happen at w=0) - isContested must not depend on it.
    expect(isContested(makeBreak({ meanDemand: 1.35, tags: [] }))).toBe(true);
  });

  it('does not flag an average-demand break as contested', () => {
    expect(isContested(makeBreak({ meanDemand: 1.05 }))).toBe(false);
  });

  it('flags a genuinely quiet break as a quiet window', () => {
    expect(isQuietWindow(makeBreak({ meanDemand: 0.8 }))).toBe(true);
    expect(isQuietWindow(makeBreak({ meanDemand: 1.0 }))).toBe(false);
  });
});

describe('mostContestedBreakId', () => {
  it('picks the single highest-demand break', () => {
    const breaks = [
      makeBreak({ id: 'a', start: '2026-11-01', meanDemand: 1.0 }),
      makeBreak({ id: 'b', start: '2026-12-20', meanDemand: 1.35 }),
      makeBreak({ id: 'c', start: '2027-01-05', meanDemand: 1.1 }),
    ];
    expect(mostContestedBreakId(breaks)).toBe('b');
  });

  it('breaks a tie by earliest start', () => {
    const breaks = [
      makeBreak({ id: 'later', start: '2026-12-20', meanDemand: 1.2 }),
      makeBreak({ id: 'earlier', start: '2026-11-01', meanDemand: 1.2 }),
    ];
    expect(mostContestedBreakId(breaks)).toBe('earlier');
  });

  it('returns undefined for an empty plan', () => {
    expect(mostContestedBreakId([])).toBeUndefined();
  });

  it('still picks a "most contested" break even when none crosses the contested threshold', () => {
    const breaks = [makeBreak({ id: 'a', meanDemand: 1.0 }), makeBreak({ id: 'b', meanDemand: 1.05 })];
    expect(mostContestedBreakId(breaks)).toBe('b');
  });
});
