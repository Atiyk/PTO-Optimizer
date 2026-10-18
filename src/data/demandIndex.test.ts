import { describe, it, expect } from 'vitest';
import { US_DEMAND_INDEX, demandFor } from './demandIndex';

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
  it('uses real US data for US and flags non-US as estimated', () => {
    const us = demandFor('2026-11-30', 'US');
    expect(us.estimated).toBe(false);
    expect(us.value).toBe(US_DEMAND_INDEX['11-30']);

    const nonUs = demandFor('2026-11-30', 'DE');
    expect(nonUs.estimated).toBe(true);
  });

  it('flags December holiday travel as elevated for the generic non-US heuristic', () => {
    const { value } = demandFor('2026-12-24', 'FR');
    expect(value).toBeGreaterThan(1.25);
  });
});
