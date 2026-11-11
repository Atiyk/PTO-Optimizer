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
  noticePhrase,
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

describe('requestByDate notice unit (Issue 14)', () => {
  // Rule: calendar-day notice subtracts N calendar days from the break start and, if that
  // lands on a non-working day, rolls back to the previous working day. Working-day notice
  // counts N working days strictly before the break start (skipping non-working weekdays and
  // employer days off), so it always lands on a working day.
  const MON_THU: WorkWeek = [true, true, true, true, false, false, false];

  it('defaults to calendar days, unchanged from before', () => {
    expect(requestByDate('2026-12-19', 14, DEFAULT_WORK_WEEK, [], 'calendar')).toBe(requestByDate('2026-12-19', 14, DEFAULT_WORK_WEEK));
    expect(requestByDate('2026-12-19', 14, DEFAULT_WORK_WEEK, [], 'calendar')).toBe('2026-12-04');
  });

  it('counts working days, skipping employer holidays and weekends', () => {
    // Break starts Mon 2026-12-28. Back from it: Sun 27, Sat 26, Fri 25 (holiday), Thu 24
    // (holiday), Wed 23 (1), Tue 22 (2), Mon 21 (3).
    expect(requestByDate('2026-12-28', 3, DEFAULT_WORK_WEEK, ['2026-12-24', '2026-12-25'], 'working')).toBe('2026-12-21');
  });

  it('counts working days, skipping a non-working weekday in the workweek', () => {
    // Mon-Thu schedule, break starts Mon 2027-01-11: Thu Jan 7 (1), Wed Jan 6 (2).
    expect(requestByDate('2027-01-11', 2, MON_THU, [], 'working')).toBe('2027-01-06');
    // Ten working days on a four-day week: Jan 7,6,5,4, Dec 31,30,29,28, 24, 23.
    expect(requestByDate('2027-01-11', 10, MON_THU, [], 'working')).toBe('2026-12-23');
  });

  it('zero working days is the start day itself when it is a working day, else the previous one', () => {
    expect(requestByDate('2027-01-11', 0, MON_THU, [], 'working')).toBe('2027-01-11');
    expect(requestByDate('2027-01-09', 0, MON_THU, [], 'working')).toBe('2027-01-07');
  });

  it('a calendar-day deadline on a non-working weekday rolls to the previous working day', () => {
    // Mon-Thu: 2027-01-11 - 3 = Fri 2027-01-08 (not worked) -> Thu 2027-01-07.
    expect(requestByDate('2027-01-11', 3, MON_THU, [], 'calendar')).toBe('2027-01-07');
  });

  it('rounds a fractional notice period up to whole days (never a later deadline)', () => {
    expect(requestByDate('2026-12-01', 13.5, DEFAULT_WORK_WEEK)).toBe('2026-11-17');
    expect(requestByDate('2026-12-28', 2.2, DEFAULT_WORK_WEEK, ['2026-12-24', '2026-12-25'], 'working')).toBe('2026-12-21');
  });

  it('is bounded: no deadline for a schedule with no working day, or a huge working-day notice', () => {
    const none: WorkWeek = [false, false, false, false, false, false, false];
    expect(requestByDate('2027-01-11', 5, none, [], 'working')).toBeNull();
    expect(requestByDate('2027-01-11', 1e9, DEFAULT_WORK_WEEK, [], 'working')).toBeNull();
  });

  it('requestByText and noticePhrase name the unit', () => {
    expect(requestByText('2027-03-01', 10, DEFAULT_WORK_WEEK, '2026-10-25', [], 'working')).toBe(`Request by ${'Feb 15'} — 113 days from now.`);
    expect(noticePhrase(14, 'calendar')).toBe('14-day');
    expect(noticePhrase(5, 'working')).toBe('5-working-day');
    expect(noticePhrase(1, 'working')).toBe('1-working-day');
  });
});
