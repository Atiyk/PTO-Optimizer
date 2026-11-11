import { describe, expect, it, vi, beforeEach } from 'vitest';

/*
 * Issue 10 (P0): a work schedule with no working day (every weekday unchecked, or every
 * working day also a day off for a long span) must never start an unbounded day-by-day
 * search. A synchronous infinite loop cannot be stopped by a test timeout, so every day
 * step goes through a counting addDays that throws once a search has clearly run away.
 * Before the fix, planShape below spun forever and the guard is what failed the test.
 */
const guard = vi.hoisted(() => ({ calls: 0, limit: 50_000 }));
vi.mock('../solver/dateUtils', async (original) => {
  const actual = await original<typeof import('../solver/dateUtils')>();
  return {
    ...actual,
    addDays: (iso: string, n: number) => {
      guard.calls += 1;
      if (guard.calls > guard.limit) throw new Error(`runaway day search: more than ${guard.limit} addDays calls`);
      return actual.addDays(iso, n);
    },
  };
});

import { planShape, type PlannerMember } from '../leave/teamPlan';
import { nearestPrecedingWorkday, requestByDate } from './requestDeadline';
import { MAX_WORKDAY_SEARCH_DAYS, searchWorkday } from './workdaySearch';
import { rangeISO, mondayIndexedDow } from '../solver/dateUtils';
import type { WorkWeek } from '../solver/types';

const NO_WORKDAYS = [false, false, false, false, false, false, false] as unknown as WorkWeek;
const MONDAY_ONLY: WorkWeek = [true, false, false, false, false, false, false];

beforeEach(() => { guard.calls = 0; });

describe('searchWorkday: the one bounded working-day search', () => {
  it('finds the first working day in either direction, starting from the given day', () => {
    const weekday = (d: string) => mondayIndexedDow(d) < 5;
    expect(searchWorkday('2026-12-19', 1, weekday)).toBe('2026-12-21'); // Sat -> Mon
    expect(searchWorkday('2026-12-19', -1, weekday)).toBe('2026-12-18'); // Sat -> Fri
    expect(searchWorkday('2026-12-16', 1, weekday)).toBe('2026-12-16');
  });

  it('returns null after a documented two-year horizon instead of looping', () => {
    expect(MAX_WORKDAY_SEARCH_DAYS).toBe(366 * 2);
    let checks = 0;
    expect(searchWorkday('2026-12-19', 1, () => { checks += 1; return false; })).toBeNull();
    expect(checks).toBe(MAX_WORKDAY_SEARCH_DAYS);
  });
});

describe('no user-controlled schedule starts an unbounded search', () => {
  it('planShape terminates for a member with no working days', () => {
    const member: PlannerMember = { id: 'a', teamId: 't', tags: [], workWeek: NO_WORKDAYS, out: new Set(), need: 1, deadline: '2026-12-31' };
    const shape = planShape(member, ['2026-11-12']);
    expect(shape.blocks).toHaveLength(1);
    expect(shape.blocks[0]!.leaveDays).toBe(1);
    expect(shape.blocks[0]!.daysOff).toBeLessThanOrEqual(2 * MAX_WORKDAY_SEARCH_DAYS + 1);
    expect(guard.calls).toBeLessThan(10 * MAX_WORKDAY_SEARCH_DAYS);
  });

  it('a request deadline is a bounded search even when every working day for decades is a day off', () => {
    // Monday-only week, and every Monday for 30 years is a holiday.
    const offDays = rangeISO('2000-01-03', '2030-12-30').filter((d) => mondayIndexedDow(d) === 0);
    expect(nearestPrecedingWorkday('2030-12-31', MONDAY_ONLY, offDays)).toBeNull();
    expect(requestByDate('2030-12-31', 14, MONDAY_ONLY, offDays)).toBeNull();
    // rangeISO above does not go through addDays; only the searches count: one forward
    // search for the first day away, then the backward deadline search.
    expect(guard.calls).toBeLessThanOrEqual(3 * (MAX_WORKDAY_SEARCH_DAYS + 1));
  });

  it('keeps the existing answers for ordinary schedules', () => {
    expect(nearestPrecedingWorkday('2026-12-20', [true, true, true, true, true, false, false])).toBe('2026-12-18');
    expect(nearestPrecedingWorkday('2026-12-18', NO_WORKDAYS)).toBeNull();
  });
});
