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
  it('rejects adjacent fragments masquerading as two getaways', () => {
    const a = calendarAvailability(base)!;
    const b = calendarAvailability(base)!;
    const adjacent: CanonicalPortfolio = {
      ...portfolio,
      breaks: [
        { start: '2027-01-04', end: '2027-01-04', calendarDays: 1, ptoDays: 1 },
        { start: '2027-01-05', end: '2027-01-05', calendarDays: 1, ptoDays: 1 },
      ],
    };
    expect(filterJointPortfolios([adjacent], a, b, 2, 2)).toBeNull();
  });
  it('rejects forged aggregate counts, cost and explanation metadata', () => {
    const a = calendarAvailability(base)!;
    const b = calendarAvailability(base)!;
    expect(filterJointPortfolios([{ ...portfolio, getawayCount: 3 }], a, b, 2, 2)).toBeNull();
    expect(filterJointPortfolios([{ ...portfolio, ptoDays: 1 }], a, b, 2, 2)).toBeNull();
    expect(filterJointPortfolios([{ ...portfolio, totalCalendarDays: 4 }], a, b, 2, 2)).toBeNull();
    expect(filterJointPortfolios([{ ...portfolio, longestBreakDays: 3 }], a, b, 2, 2)).toBeNull();
    expect(filterJointPortfolios([{ ...portfolio, travelSignal: 'live' as CanonicalPortfolio['travelSignal'] }], a, b, 2, 2)).toBeNull();
  });
  it('recomputes public metadata rather than leaking caller-controlled text or fabricated balances', () => {
    const a = calendarAvailability({ ...base, advisoryBusyDays: ['2027-01-04'], employerOffDays: ['2027-01-06'] })!;
    const b = calendarAvailability(base)!;
    const forged = { ...portfolio, ptoDays: 1, budgetRemaining: 999, explanation: 'PRIVATE CALENDAR TITLE', reviewDates: ['2027-01-08'], freeCalendarDates: ['2027-01-08'] };
    const corrected = filterJointPortfolios([forged], a, b, 2, 2)!;
    // Mismatched PTO is rejected, rather than displaying forged totals.
    expect(corrected).toBeNull();
    const valid = { ...portfolio, budgetRemaining: 999, explanation: 'PRIVATE CALENDAR TITLE', reviewDates: ['2027-01-08'], freeCalendarDates: ['2027-01-08'] };
    const output = filterJointPortfolios([valid], calendarAvailability(base)!, b, 2, 2)!;
    expect(output.feasible).toHaveLength(1);
    expect(output.feasible[0].portfolio.budgetRemaining).toBe(0);
    expect(output.feasible[0].portfolio.reviewDates).toEqual([]);
    expect(output.feasible[0].portfolio.freeCalendarDates).toEqual([]);
    expect(JSON.stringify(output)).not.toContain('PRIVATE CALENDAR TITLE');
    expect(JSON.stringify(output)).not.toContain('2027-01-08');
    expect(filterJointPortfolios([{ ...valid, reviewDates: ['invalid-date'] }], calendarAvailability(base)!, b, 2, 2)).toBeNull();
  });
  it('does not leak unknown imported break properties into public recommendations', () => {
    const a = calendarAvailability(base)!;
    const b = calendarAvailability(base)!;
    const injected = {
      ...portfolio,
      breaks: portfolio.breaks.map((brk, i) => ({
        ...brk,
        privateCalendarTitle: i === 0 ? 'SECRET_MEDICAL_EVENT' : 'SECRET_PARTNER_NAME',
        nested: { contact: 'SECRET_CONTACT' },
      })),
    };
    const result = filterJointPortfolios([injected], a, b, 2, 2)!;
    expect(result.feasible).toHaveLength(1);
    expect(result.feasible[0].portfolio.breaks).toEqual(portfolio.breaks);
    expect(JSON.stringify(result)).not.toContain('SECRET_');
    expect(JSON.stringify(result)).not.toContain('nested');
  });
  it('fails closed when a portfolio break exceeds the known calendar window', () => {
    const a = calendarAvailability(base)!;
    const b = calendarAvailability(base)!;
    expect(filterJointPortfolios([{ ...portfolio, breaks: [{ start: '2027-01-09', end: '2027-01-09', calendarDays: 1, ptoDays: 1 }] }], a, b, 2, 2)).toBeNull();
  });
});
