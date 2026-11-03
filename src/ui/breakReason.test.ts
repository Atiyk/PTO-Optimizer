import { describe, it, expect } from 'vitest';
import { breakReason } from './breakReason';
import type { Break } from '@daysoff/engine/solver/types';

const BASE: Break = {
  id: '2026-11-26|2026-11-29',
  start: '2026-11-26',
  end: '2026-11-29',
  days: ['2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'],
  totalDaysOff: 4,
  ptoCost: 1,
  multiplier: 4,
  tags: [],
  meanDemand: 1.0,
};

const noHoliday = () => undefined;

describe('breakReason', () => {
  it('names the holiday when the break bridges one, over any other branch', () => {
    const holidayNameFor = (iso: string) => (iso === '2026-11-26' ? 'Thanksgiving' : undefined);
    expect(breakReason(BASE, holidayNameFor)).toBe('Bridges Thanksgiving — 1 PTO day for 4 days off.');
  });

  it('pluralizes PTO day(s) and day(s) off correctly', () => {
    const brk: Break = { ...BASE, ptoCost: 2, totalDaysOff: 1 };
    const holidayNameFor = () => 'New Year’s Day';
    expect(breakReason(brk, holidayNameFor)).toBe('Bridges New Year’s Day — 2 PTO days for 1 day off.');
  });

  it('reports quiet-week demand as a real, derived percentage, never a fabricated percentile', () => {
    const brk: Break = { ...BASE, tags: ['Low travel demand'], meanDemand: 0.7 };
    expect(breakReason(brk, noHoliday)).toBe('Quiet travel week — about 30% less demand than an average day.');
  });

  it('reports peak-week demand as a real, derived percentage, and still states the swap', () => {
    const brk: Break = { ...BASE, tags: ['Peak travel'], meanDemand: 1.4 };
    expect(breakReason(brk, noHoliday)).toBe('Busier travel week (about 40% above average) — 1 PTO day for 4 days off regardless.');
  });

  it('does not invent percentages when demand metadata is invalid or contradicts its tag', () => {
    const cases: Array<{ tag: string; meanDemand: number }> = [
      { tag: 'Low travel demand', meanDemand: Number.NaN },
      { tag: 'Low travel demand', meanDemand: -0.2 },
      { tag: 'Low travel demand', meanDemand: 1.2 },
      { tag: 'Peak travel', meanDemand: Number.POSITIVE_INFINITY },
      { tag: 'Peak travel', meanDemand: 0.8 },
    ];
    for (const { tag, meanDemand } of cases) {
      const explanation = breakReason({ ...BASE, tags: [tag], meanDemand }, noHoliday);
      expect(explanation).toBe('Efficient swap — 1 PTO day for 4 days off (4.00x).');
      expect(explanation).not.toMatch(/NaN|Infinity|%/);
    }
  });

  it('flags estimated demand data explicitly rather than presenting it as measured', () => {
    const brk: Break = { ...BASE, tags: ['Estimated'] };
    expect(breakReason(brk, noHoliday)).toBe('1 PTO day for 4 days off — travel demand here is an estimate for this country.');
  });

  it('does not present estimated low-demand or peak-demand data as observed', () => {
    for (const demandTag of ['Low travel demand', 'Peak travel']) {
      const brk: Break = { ...BASE, tags: [demandTag, 'Estimated'], meanDemand: demandTag === 'Low travel demand' ? 0.7 : 1.4 };
      const explanation = breakReason(brk, noHoliday);
      expect(explanation).toBe('1 PTO day for 4 days off — travel demand here is an estimate for this country.');
      expect(explanation).not.toMatch(/quiet travel week|busier travel week|% less|% above/i);
    }
  });

  it('falls back to the plain multiplier swap when nothing else applies', () => {
    expect(breakReason(BASE, noHoliday)).toBe('Efficient swap — 1 PTO day for 4 days off (4.00x).');
  });

  it('never fabricates a reason for a low-value (1.0x or worse) break - matches the existing lowValueExplanation copy', () => {
    const lowValue: Break = { ...BASE, multiplier: 1, totalDaysOff: 1, ptoCost: 1, tags: ['Low travel demand'] };
    expect(breakReason(lowValue, noHoliday)).toBe('No extra days off — 1 PTO day for 1 day off; lower travel demand is tagged for these dates.');

    expect(breakReason(lowValue, noHoliday)).not.toMatch(/chosen|optimized|budget|unspent/i);

    const lowValueNoTag: Break = { ...BASE, multiplier: 1, totalDaysOff: 1, ptoCost: 1, tags: [] };
    expect(breakReason(lowValueNoTag, noHoliday)).toBe(
      'No extra days off — 1 PTO day for 1 day off.',
    );
  });

  it('does not repeat a low-demand tag when the numeric value contradicts it', () => {
    for (const meanDemand of [Number.NaN, -1, 1, 1.3, Number.POSITIVE_INFINITY]) {
      const lowValue: Break = {
        ...BASE,
        multiplier: 1,
        totalDaysOff: 1,
        tags: ['Low travel demand'],
        meanDemand,
      };
      expect(breakReason(lowValue, noHoliday)).toBe('No extra days off — 1 PTO day for 1 day off.');
    }
  });

  it('qualifies estimated demand even for low-value recommendations', () => {
    for (const demandTag of ['Low travel demand', 'Peak travel']) {
      const lowValue: Break = {
        ...BASE,
        multiplier: 1,
        ptoCost: 1,
        totalDaysOff: 1,
        tags: [demandTag, 'Estimated'],
      };
      const explanation = breakReason(lowValue, noHoliday);
      expect(explanation).toBe('No extra days off — 1 PTO day for 1 day off; travel demand here is an estimate for this country.');
      expect(explanation).not.toMatch(/lower travel demand is tagged|quiet travel week|busier travel week/i);
    }
  });

  it('does not invent an optimization motive when a low-value break has no travel tag', () => {
    const lowValue: Break = { ...BASE, multiplier: 0.5, ptoCost: 2, totalDaysOff: 1, tags: [] };
    const explanation = breakReason(lowValue, noHoliday);
    expect(explanation).toBe('No extra days off — 2 PTO days for 1 day off.');
    expect(explanation).not.toMatch(/budget|unspent|optimized/i);
  });

  it('a low-value break never gets a holiday/demand reason even if it technically bridges one or is tagged', () => {
    // multiplier <= 1 is checked first and short-circuits every other branch - a reason
    // must never claim "efficient" or "bridges X" for a swap that gained nothing extra.
    const lowValue: Break = { ...BASE, multiplier: 1, tags: ['Peak travel'] };
    const holidayNameFor = () => 'Thanksgiving';
    expect(breakReason(lowValue, holidayNameFor)).not.toContain('Bridges');
    expect(breakReason(lowValue, holidayNameFor)).not.toContain('Busier');
  });
});
