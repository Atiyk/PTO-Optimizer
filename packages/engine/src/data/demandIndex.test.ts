import { describe, it, expect } from 'vitest';
import { US_DEMAND_INDEX, demandFor, usSeasonalDemand } from './demandIndex';

describe('US_DEMAND_INDEX', () => {
  it('loads and covers all 365 days', () => {
    expect(Object.keys(US_DEMAND_INDEX)).toHaveLength(365);
  });

  it('has no leap day key', () => {
    expect(US_DEMAND_INDEX['02-29']).toBeUndefined();
  });

  it('is centered near 1.0 (normalized to the annual mean)', () => {
    const values = Object.values(US_DEMAND_INDEX);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    expect(mean).toBeGreaterThan(0.97);
    expect(mean).toBeLessThan(1.03);
  });

  // Real TSA throughput shows Thanksgiving Day itself is quiet (travelers have
  // already arrived); the Sunday after is the single busiest day of the year.
  // Weekday-aligned smoothing (comparing each day only against the same
  // weekday in neighboring weeks) partially damps that one-day spike, so the
  // week's honestly-smoothed peak lands near 1.12, not the 1.4+ a naive
  // calendar-day average might suggest. This asserts what the real,
  // unmassaged data actually supports.
  it('scores Thanksgiving week above the annual average', () => {
    const thanksgivingWeek = ['11-24', '11-25', '11-26', '11-27', '11-28', '11-29', '11-30'];
    const peak = Math.max(...thanksgivingWeek.map((d) => US_DEMAND_INDEX[d]));
    expect(peak).toBeGreaterThan(1.1);
  });
});

describe('demandFor', () => {
  it('uses the seasonal US TSA figure for US and flags non-US as estimated', () => {
    const us = demandFor('2026-11-30', 'US');
    expect(us.estimated).toBe(false);
    expect(us.value).toBe(usSeasonalDemand('2026-11-30'));

    const nonUs = demandFor('2026-11-30', 'DE');
    expect(nonUs.estimated).toBe(true);
  });

  it('flags December holiday travel as elevated for the generic non-US heuristic', () => {
    const { value } = demandFor('2026-12-24', 'FR');
    expect(value).toBeGreaterThan(1.25);
  });
});

// Issue 6: the raw index is one source year (2025) keyed by month-day, so each value
// carries 2025's weekday pattern (low Tuesdays, busy Fridays/Sundays). Copying it onto
// another year's date (2027-01-21 is a Thursday; 2025-01-21 was a Tuesday) invents a
// day-level signal the data cannot support. The solver must use a seasonal figure.
describe('demandFor US is seasonal, not a copied 2025 weekday', () => {
  it('moves smoothly from one date to the next in another year', () => {
    let worst = 0;
    let iso = '2027-01-01';
    while (iso < '2027-12-31') {
      const next = new Date(Date.parse(iso) + 86400000).toISOString().slice(0, 10);
      worst = Math.max(worst, Math.abs(demandFor(next, 'US').value - demandFor(iso, 'US').value));
      iso = next;
    }
    expect(worst).toBeLessThan(0.05);
  });

  it('is the centred 7-day mean of the 2025 index around the same month-day', () => {
    const keys = ['01-18', '01-19', '01-20', '01-21', '01-22', '01-23', '01-24'];
    const mean = keys.reduce((s, k) => s + US_DEMAND_INDEX[k], 0) / keys.length;
    expect(demandFor('2027-01-21', 'US').value).toBeCloseTo(mean, 10);
  });

  it('wraps across the new year and treats Feb 29 like Feb 28', () => {
    const keys = ['12-29', '12-30', '12-31', '01-01', '01-02', '01-03', '01-04'];
    const mean = keys.reduce((s, k) => s + US_DEMAND_INDEX[k], 0) / keys.length;
    expect(demandFor('2028-01-01', 'US').value).toBeCloseTo(mean, 10);
    expect(demandFor('2028-02-29', 'US').value).toBe(demandFor('2027-02-28', 'US').value);
  });
});
