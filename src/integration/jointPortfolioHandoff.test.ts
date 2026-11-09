import { describe, expect, it } from 'vitest';
import { calendarAvailability } from '../personal/recurringAvailability';
import type { CanonicalPortfolio } from '../planning/canonicalPortfolio';
import { filterJointPortfolios } from './jointPortfolioHandoff';

const base = {
  start: '2027-01-04', end: '2027-01-08',
  schedule: { kind: 'weekly' as const, weekly: [true, true, true, true, true, false, false] as [boolean,boolean,boolean,boolean,boolean,boolean,boolean] },
  calendarPartial: false,
};
const portfolio: CanonicalPortfolio = {
  objective: 'most-getaways',
  breaks: [
    { start: '2027-01-04', end: '2027-01-04', calendarDays: 1, ptoDays: 1 },
    { start: '2027-01-06', end: '2027-01-06', calendarDays: 1, ptoDays: 1 },
  ],
  getawayCount: 2, longestBreakDays: 1, totalCalendarDays: 2,
  ptoDays: 2, budgetRemaining: 0, freeCalendarDates: [], reviewDates: [],
  partialCalendarEvidence: false, travelSignal: 'not-used', explanation: 'Two breaks',
};
describe('joint whole-portfolio funding handoff', () => {
  it('rejects two individually affordable breaks when the partner cannot fund both together', () => {
    const a = calendarAvailability(base)!;
    const b = calendarAvailability(base)!;
    const result = filterJointPortfolios([portfolio], a, b, 2, 1)!;
    expect(result.feasible).toEqual([]);
    expect(result.needsReview).toEqual([]);
    expect(result.rejected).toBe(1);
    const funded = filterJointPortfolios([portfolio], a, b, 2, 2)!;
    expect(funded.feasible).toHaveLength(1);
    expect(funded.feasible[0].ptoDaysA).toBe(2);
    expect(funded.feasible[0].ptoDaysB).toBe(2);
  });
  it('rejects a partner-only hard block and prices employer-off days independently', () => {
    const a = calendarAvailability(base)!;
    const blocked = calendarAvailability({ ...base, hardBlockDays: ['2027-01-06'] })!;
    expect(filterJointPortfolios([portfolio], a, blocked, 2, 2)!.rejected).toBe(1);
    const off = calendarAvailability({ ...base, employerOffDays: ['2027-01-06'] })!;
    const result = filterJointPortfolios([portfolio], a, off, 2, 1)!;
    expect(result.feasible).toHaveLength(1);
    expect(result.feasible[0].ptoDaysB).toBe(1);
  });
  it('discloses school coverage and incomplete partner calendars rather than asserting unconditional feasibility', () => {
    const a = calendarAvailability({ ...base, schoolOffDays: ['2027-01-04'] })!;
    const b = calendarAvailability({ ...base, calendarPartial: true })!;
    const result = filterJointPortfolios([portfolio], a, b, 2, 2)!;
    expect(result.feasible).toEqual([]);
    expect(result.needsReview).toHaveLength(1);
    expect(result.needsReview[0].potentialSchoolCoverageGapDays).toBe(1);
  });
  it('fails closed when a portfolio break exceeds the known calendar window', () => {
    const a = calendarAvailability(base)!;
    const b = calendarAvailability(base)!;
    expect(filterJointPortfolios([{ ...portfolio, breaks: [{ start: '2027-01-09', end: '2027-01-09', calendarDays: 1, ptoDays: 1 }] }], a, b, 2, 2)).toBeNull();
  });
});
