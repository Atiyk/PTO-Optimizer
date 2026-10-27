import { describe, it, expect } from 'vitest';
import { breakReason } from './breakReason';
import type { Break } from '../solver/types';

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

  it('flags estimated demand data explicitly rather than presenting it as measured', () => {
    const brk: Break = { ...BASE, tags: ['Estimated'] };
    expect(breakReason(brk, noHoliday)).toBe('1 PTO day for 4 days off — travel demand here is an estimate for this country.');
  });

  it('falls back to the plain multiplier swap when nothing else applies', () => {
    expect(breakReason(BASE, noHoliday)).toBe('Efficient swap — 1 PTO day for 4 days off (4.00x).');
  });

  it('never fabricates a reason for a low-value (1.0x or worse) break - matches the existing lowValueExplanation copy', () => {
    const lowValue: Break = { ...BASE, multiplier: 1, totalDaysOff: 1, ptoCost: 1, tags: ['Low travel demand'] };
    expect(breakReason(lowValue, noHoliday)).toBe('No extra days off — chosen for low travel demand.');

    const lowValueNoTag: Break = { ...BASE, multiplier: 1, totalDaysOff: 1, ptoCost: 1, tags: [] };
    expect(breakReason(lowValueNoTag, noHoliday)).toBe(
      'No extra days off — this uses the full available budget rather than leaving a PTO day unspent.',
    );
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
