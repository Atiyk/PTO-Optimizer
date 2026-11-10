import { describe, expect, it } from 'vitest';
import { calendarAvailability } from './recurringAvailability';
import { schoolCoverage } from './schoolCoverage';

const weekly = { kind: 'weekly' as const, weekly: [true, true, true, true, true, false, false] as [boolean, boolean, boolean, boolean, boolean, boolean, boolean] };
describe('schoolCoverage', () => {
  it('distinguishes closure, already-off adults, and an uncovered working day', () => {
    const base = { start: '2028-01-03', end: '2028-01-07', schedule: weekly, schoolOffDays: ['2028-01-03', '2028-01-04', '2028-01-05'], calendarPartial: false };
    const a = calendarAvailability({ ...base, approvedOffDays: ['2028-01-04'] })!;
    const b = calendarAvailability(base)!;
    const result = schoolCoverage(a, b)!;
    expect(result.closureDays).toBe(3);
    expect(result.potentialGapDays).toBe(2);
    expect(result.days[0].potentialPtoDays).toBe(1);
    expect(result.days[1].potentialPtoDays).toBe(0);
    expect(result.days[2].potentialPtoDays).toBe(1);
    expect(result.days[1].adultAOff).toBe(true);
    expect(result.days[1].potentialCoverageGap).toBe(false);
    expect(result.partial).toBe(false);
  });
  it('does not assume an incomplete calendar is complete', () => {
    const a = calendarAvailability({ start: '2028-02-29', end: '2028-02-29', schedule: weekly, schoolOffDays: ['2028-02-29'] })!;
    expect(schoolCoverage(a, a)?.partial).toBe(true);
  });
  it('fails closed on forged, gapped, or malformed external coverage windows', () => {
    const a = calendarAvailability({ start: '2028-01-03', end: '2028-01-05', schedule: weekly, schoolOffDays: ['2028-01-04'] })!;
    const b = calendarAvailability({ start: '2028-01-03', end: '2028-01-05', schedule: weekly })!;
    expect(schoolCoverage({ ...a, days: [a.days[0], a.days[2]] }, { ...b, days: [b.days[0], b.days[2]] })).toBeNull();
    expect(schoolCoverage({ ...a, days: [{ ...a.days[0], workday: 'false' as unknown as boolean }, ...a.days.slice(1)] }, b)).toBeNull();
    expect(schoolCoverage({ ...a, partial: 'false' as unknown as boolean }, b)).toBeNull();
    expect(schoolCoverage({ ...a, days: [] }, { ...b, days: [] })).toBeNull();
  });
  it('rejects mismatched date windows', () => {
    const a = calendarAvailability({ start: '2028-01-03', end: '2028-01-04', schedule: weekly })!;
    const b = calendarAvailability({ start: '2028-01-04', end: '2028-01-05', schedule: weekly })!;
    expect(schoolCoverage(a, b)).toBeNull();
  });
});
