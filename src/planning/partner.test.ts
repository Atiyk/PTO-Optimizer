import { describe, expect, it } from 'vitest';
import { rangeISO } from '@daysoff/engine/solver/dateUtils';
import type { SolveInput } from '@daysoff/engine/solver/types';
import { buildOverlapShareURL } from '../ui/urlState';
import { buildPartnerShareURL, decodePartnerAvailability, encodePartnerAvailability, findJointOpportunities, readPartnerAvailability, type PartnerAvailability } from './partner';

const available: PartnerAvailability = {
  days: rangeISO('2027-07-03', '2027-07-18'),
  freeDays: ['2027-07-03', '2027-07-04', '2027-07-05', '2027-07-10', '2027-07-11', '2027-07-17', '2027-07-18'],
  status: 'proposed',
};
const input: SolveInput = { rangeStart: '2027-01-01', rangeEnd: '2027-12-31', offDays: ['2027-07-05'], budget: 5 };

describe('partner availability links', () => {
  it('uses the neutral consumer route instead of inheriting the sender country route', () => {
    const link = new URL(buildPartnerShareURL('https://gapless.example', '/uk', available));
    expect(link.pathname).toBe('/pto');
    expect(link.searchParams.has('c')).toBe(false);
  });

  it('round-trips bounded date ranges with intentionally selected status', () => {
    expect(decodePartnerAvailability(encodePartnerAvailability(available))).toEqual(available);
    expect(decodePartnerAvailability(encodePartnerAvailability({ ...available, status: 'confirmed' }))?.status).toBe('confirmed');
  });

  it('includes only dates, free-day classification and status, with neutral date bounds', () => {
    const link = buildPartnerShareURL('https://gapless.example', '/pto', { ...available, budget: 49281, note: 'private personal note', employer: 'My Company' } as PartnerAvailability);
    const url = new URL(link);
    expect([...url.searchParams.keys()].sort()).toEqual(['e', 'pp', 's']);
    expect(url.searchParams.get('s')).toBe('2027-07-03');
    expect(url.searchParams.get('e')).toBe('2027-07-18');
    expect(decodeURIComponent(link)).not.toMatch(/49281|private personal note|My Company|budget|employer/);
  });

  it('does not infer free days or approval from legacy ov links', () => {
    const link = new URL(buildOverlapShareURL('https://gapless.example', '/pto', available.days));
    expect(readPartnerAvailability(link.search)).toEqual({ availability: { days: available.days, freeDays: null, status: 'proposed' }, invalid: false });
  });

  it.each([
    '2:p:20270701:', '1:x:20270701:', '1:p:20270230:', '1:p:20270701:20270702',
    '1:p:20270701~20310701:', '1:p::', `1:p:${'1'.repeat(12001)}:`,
  ])('rejects malformed or oversized payload %s', payload => {
    expect(decodePartnerAvailability(payload)).toBeNull();
  });

  it('bounds expansion and handles duplicate dates and leap-year dates deterministically', () => {
    const leap: PartnerAvailability = { days: ['2028-02-29', '2028-02-28', '2028-02-29'], freeDays: ['2028-02-29'], status: 'proposed' };
    expect(decodePartnerAvailability(encodePartnerAvailability(leap))?.days).toEqual(['2028-02-28', '2028-02-29']);
    expect(readPartnerAvailability('?pp=invalid')).toEqual({ availability: null, invalid: true });
    expect(readPartnerAvailability('')).toEqual({ availability: null, invalid: false });
    expect(readPartnerAvailability(`?pp=${'a'.repeat(50001)}`).invalid).toBe(true);
  });
});

describe('two-person opportunities', () => {
  it('respects both disclosed availability and recipient holidays/budget', () => {
    const opportunities = findJointOpportunities(input, available);
    expect(opportunities.length).toBeGreaterThan(0);
    const known = new Set(available.days);
    for (const opportunity of opportunities) {
      expect(opportunity.yourPtoDays.length).toBeLessThanOrEqual(5);
      expect(opportunity.break.days.every(day => known.has(day))).toBe(true);
      expect(opportunity.yourPtoDays).not.toContain('2027-07-05');
      expect(opportunity.bothFree + (opportunity.onlyYouNeedPto ?? 0) + (opportunity.onlyPartnerNeedsPto ?? 0) + (opportunity.bothNeedPto ?? 0)).toBe(opportunity.break.totalDaysOff);
      expect(opportunity.partnerPtoCost).toBe(opportunity.break.days.filter(day => !available.freeDays!.includes(day)).length);
    }
    expect(findJointOpportunities(input, available)).toEqual(opportunities);
  });

  it('handles different workweeks and never treats undisclosed dates as free', () => {
    const result = findJointOpportunities({ ...input, workWeek: [true, true, true, true, false, false, true], budget: 2 }, { ...available, days: rangeISO('2027-07-02', '2027-07-04') });
    expect(result[0]?.yourPtoDays).toEqual(['2027-07-04']);
    expect(result[0]?.break.days).not.toContain('2027-07-05');
  });

  it('does not cross blackouts or exceed the minimum break preference', () => {
    const results = findJointOpportunities({ ...input, blackouts: ['2027-07-08'] }, available, 5);
    expect(results.every(result => !result.break.days.includes('2027-07-08') && result.break.totalDaysOff >= 5)).toBe(true);
    expect(findJointOpportunities({ ...input, budget: 0 }, { ...available, days: rangeISO('2027-07-06', '2027-07-08') })).toEqual([]);
  });

  it('does not spend unearned accrual or forfeited carryover', () => {
    const early = { ...available, days: rangeISO('2027-01-01', '2027-01-08'), freeDays: [] };
    expect(findJointOpportunities({ ...input, accrualPerMonth: 1 }, early)).toEqual([]);
    const result = findJointOpportunities({ ...input, expiryDate: '2027-06-30', carryoverCap: 1 }, available);
    expect(result.every(opportunity => opportunity.yourPtoDays.length <= 1)).toBe(true);
  });

  it('accounts for required PTO elsewhere and busy-season caps', () => {
    const results = findJointOpportunities({ ...input, mustIncludeDays: ['2027-03-01', '2027-03-02', '2027-03-03'], peakCap: { enabled: true, startDate: '2027-07-01', endDate: '2027-07-31', maxDays: 1 } }, available);
    expect(results.every(opportunity => opportunity.yourPtoDays.length <= 1)).toBe(true);
  });

  it('keeps the source PTO classification unknown for old links', () => {
    const result = findJointOpportunities(input, { ...available, freeDays: null });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every(opportunity => opportunity.partnerPtoCost === null && opportunity.bothNeedPto === null)).toBe(true);
  });

  it('returns explicit empty results for impossible or malformed ranges', () => {
    expect(findJointOpportunities({ ...input, rangeEnd: '2026-01-01' }, available)).toEqual([]);
    expect(findJointOpportunities(input, { ...available, days: ['2027-02-30'] })).toEqual([]);
  });
});
