import { describe, expect, it } from 'vitest';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import {
  calendarAvailability, isScheduledWorkday, jointWindowFeasibility,
  type RepeatingWorkSchedule,
} from './recurringAvailability';

const standard: RepeatingWorkSchedule = { kind: 'weekly', weekly: DEFAULT_WORK_WEEK };
const fourTen: RepeatingWorkSchedule = { kind: 'weekly', weekly: [true, true, true, true, false, false, false] };

describe('recurring consumer work schedules', () => {
  it('anchors a 9/80 two-week cycle, keeping the second Friday off', () => {
    const nineEighty: RepeatingWorkSchedule = {
      kind: 'cycle',
      cycleAnchor: '2027-01-04',
      cycleWorking: [true, true, true, true, true, false, false, true, true, true, true, false, false, false],
    };
    expect(isScheduledWorkday(nineEighty, '2027-01-08')).toBe(true);
    expect(isScheduledWorkday(nineEighty, '2027-01-15')).toBe(false);
    expect(isScheduledWorkday(nineEighty, '2027-01-22')).toBe(true);
    expect(isScheduledWorkday(nineEighty, '2026-12-25')).toBe(true);
  });

  it('keeps a rotating work pattern aligned across DST and year boundaries', () => {
    const alternating: RepeatingWorkSchedule = {
      kind: 'cycle', cycleAnchor: '2027-03-13',
      cycleWorking: [true, false],
    };
    expect(isScheduledWorkday(alternating, '2027-03-13')).toBe(true);
    expect(isScheduledWorkday(alternating, '2027-03-14')).toBe(false);
    expect(isScheduledWorkday(alternating, '2027-03-15')).toBe(true);
    expect(isScheduledWorkday(alternating, '2027-03-12')).toBe(false);
  });

  it('counts independent PTO budgets and employer holidays without sharing an employer profile', () => {
    const a = calendarAvailability({
      start: '2027-01-04', end: '2027-01-10', schedule: standard,
      employerOffDays: ['2027-01-04'],
      calendarPartial: false,
    })!;
    const b = calendarAvailability({
      start: '2027-01-04', end: '2027-01-10', schedule: fourTen,
      employerOffDays: ['2027-01-05'],
      calendarPartial: false,
    })!;
    const result = jointWindowFeasibility(a, b, 4, 3)!;
    expect(result).toMatchObject({
      possible: true, ptoDaysA: 4, ptoDaysB: 3,
      hardBlockDates: [], reviewDates: [], partial: false,
    });
    expect(jointWindowFeasibility(a, b, 3, 3)?.possible).toBe(false);
  });

  it('hard blocks a joint break, but an advisory busy day only asks for review', () => {
    const a = calendarAvailability({
      start: '2027-01-04', end: '2027-01-06', schedule: standard,
      hardBlockDays: ['2027-01-05'],
    })!;
    const b = calendarAvailability({
      start: '2027-01-04', end: '2027-01-06', schedule: standard,
      advisoryBusyDays: ['2027-01-06'], schoolOffDays: ['2027-01-04'],
    })!;
    const result = jointWindowFeasibility(a, b, 10, 10)!;
    expect(result.possible).toBe(false);
    expect(result.hardBlockDates).toEqual(['2027-01-05']);
    expect(result.reviewDates).toEqual(['2027-01-06']);
    expect(result.partial).toBe(true);
    expect(b.days[0].schoolClosed).toBe(true);
    expect(b.days[0].hardBlocked).toBe(false);
  });

  it('does not charge PTO for observed holidays or already-approved leave', () => {
    const a = calendarAvailability({
      start: '2027-01-04', end: '2027-01-05', schedule: standard,
      employerOffDays: ['2027-01-04'], approvedOffDays: ['2027-01-05'],
    })!;
    const b = calendarAvailability({
      start: '2027-01-04', end: '2027-01-05', schedule: standard,
      approvedOffDays: ['2027-01-04'], employerOffDays: ['2027-01-05'],
    })!;
    expect(jointWindowFeasibility(a, b, 0, 0)?.possible).toBe(true);
    expect(jointWindowFeasibility(a, b, 0, 0)?.ptoDaysA).toBe(0);
    expect(jointWindowFeasibility(a, b, 0, 0)?.ptoDaysB).toBe(0);
  });

  it('rejects forged external windows, gaps, duplicate days and invalid boolean flags', () => {
    const a = calendarAvailability({ start: '2027-01-04', end: '2027-01-06', schedule: standard, calendarPartial: false })!;
    const b = calendarAvailability({ start: '2027-01-04', end: '2027-01-06', schedule: standard, calendarPartial: false })!;
    expect(jointWindowFeasibility(a, b, 3, 3)?.possible).toBe(true);
    const malformed = { ...a, days: a.days.map(d => ({ ...d })) };
    malformed.days[1].date = '2027-02-30';
    expect(jointWindowFeasibility(malformed, b, 3, 3)).toBeNull();
    malformed.days[1].date = '2027-01-04';
    expect(jointWindowFeasibility(malformed, b, 3, 3)).toBeNull();
    malformed.days[1].date = '2027-01-07';
    expect(jointWindowFeasibility(malformed, b, 3, 3)).toBeNull();
    malformed.days[1].date = '2027-01-05';
    malformed.days[1].reviewNeeded = 'false' as unknown as boolean;
    expect(jointWindowFeasibility(malformed, b, 3, 3)).toBeNull();
    expect(jointWindowFeasibility(a, b, 1.5, 3)).toBeNull();
    expect(jointWindowFeasibility({ ...a, partial: 'false' as unknown as boolean }, b, 3, 3)).toBeNull();
  });

  it('rejects invalid dates and cycle definitions rather than inventing a default', () => {
    expect(isScheduledWorkday({ kind: 'cycle', cycleAnchor: '2027-01-04', cycleWorking: [] }, '2027-01-05')).toBeNull();
    expect(calendarAvailability({ start: '2027-02-30', end: '2027-03-05', schedule: standard })).toBeNull();
    expect(jointWindowFeasibility(
      calendarAvailability({ start: '2027-01-04', end: '2027-01-05', schedule: standard })!,
      calendarAvailability({ start: '2027-01-04', end: '2027-01-06', schedule: standard })!,
      2, 2,
    )).toBeNull();
  });
});
