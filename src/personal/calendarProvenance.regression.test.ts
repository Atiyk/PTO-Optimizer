import { describe, expect, it } from 'vitest';
import { calendarAvailability, jointWindowFeasibility, type RepeatingWorkSchedule } from './recurringAvailability';
import { schoolCoverage } from './schoolCoverage';

const weekly: RepeatingWorkSchedule = { kind: 'weekly', weekly: [true, true, true, true, true, false, false] };
const windowFor = (options: { employerOffDays?: string[]; approvedOffDays?: string[]; schoolOffDays?: string[] } = {}) =>
  calendarAvailability({ start: '2027-01-04', end: '2027-01-04', schedule: weekly, ...options })!;

describe('untrusted calendar provenance', () => {
  it('rejects a forged already-off workday instead of granting a zero-budget joint break', () => {
    const a = windowFor();
    const b = windowFor();
    const forged = { ...a, days: [{ ...a.days[0], alreadyOff: true }] };
    expect(jointWindowFeasibility(a, b, 0, 0)?.possible).toBe(false);
    expect(jointWindowFeasibility(forged, b, 0, 0)).toBeNull();
  });

  it('does not let forged already-off days conceal school coverage gaps', () => {
    const a = windowFor({ schoolOffDays: ['2027-01-04'] });
    const b = windowFor();
    expect(schoolCoverage(a, b)?.days[0]).toMatchObject({
      potentialCoverageGap: true, potentialPtoDays: 1,
    });
    const forged = { ...a, days: [{ ...a.days[0], alreadyOff: true }] };
    expect(schoolCoverage(forged, b)).toBeNull();
  });

  it('accepts genuine employer holidays and approved leave independently', () => {
    const a = windowFor({ employerOffDays: ['2027-01-04'], schoolOffDays: ['2027-01-04'] });
    const b = windowFor({ approvedOffDays: ['2027-01-04'] });
    expect(jointWindowFeasibility(a, b, 0, 0)?.possible).toBe(true);
    expect(schoolCoverage(a, b)?.days[0].potentialCoverageGap).toBe(false);
  });

  it('accepts genuine rotating non-work days without fabricated leave', () => {
    const a = calendarAvailability({
      start: '2027-01-04', end: '2027-01-04',
      schedule: { kind: 'cycle', cycleAnchor: '2027-01-04', cycleWorking: [false, true] },
      schoolOffDays: ['2027-01-04'],
    })!;
    const b = windowFor();
    expect(jointWindowFeasibility(a, b, 0, 1)?.possible).toBe(true);
    expect(schoolCoverage(a, b)?.days[0].potentialCoverageGap).toBe(false);
  });

  it('rejects unsupported legacy off flags with no holiday or approved provenance', () => {
    const a = windowFor();
    const b = windowFor();
    const legacy = { ...a, days: [{ ...a.days[0], alreadyOff: true, employerHoliday: undefined, approvedLeave: undefined }] };
    expect(jointWindowFeasibility(legacy, b, 0, 1)).toBeNull();
    expect(schoolCoverage(legacy, b)).toBeNull();
  });
});
