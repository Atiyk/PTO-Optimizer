import { describe, expect, it } from 'vitest';
import { US_DEMAND_INDEX } from '@daysoff/engine/data/demandIndex';
import { FEWER_FLYERS_LABEL, FEWER_FLYERS_THRESHOLD, fewerFlyersThanUsual, travelEvidenceFor, usSeasonalYearlyMean } from './travelEvidence';
import { usSeasonalDemand } from '@daysoff/engine/data/demandIndex';

describe('consumer travel evidence provenance', () => {
  it('never advertises the historical US travel signal as a live forecast or price', () => {
    const evidence = travelEvidenceFor('2027-03-14', 'US')!;
    expect(evidence).toMatchObject({
      date: '2027-03-14',
      country: 'US',
      kind: 'historical-seasonal-estimate',
      sourceYear: 2025,
      confidence: 'low',
      units: 'relative-demand-index',
    });
    expect(evidence.value).toBeGreaterThan(0);
    expect(evidence.method).toContain('7-day');
    expect(evidence.caveat).toContain('Not live demand');
    expect(evidence.caveat).toContain('airfare');
  });

  it('removes day-specific 2025 weekday mapping rather than copying the raw MM-DD number', () => {
    const all = Object.keys(US_DEMAND_INDEX).filter((date) => date !== '02-29');
    const changed = all.filter((md) => {
      const modeled = travelEvidenceFor('2027-' + md, 'US');
      return modeled?.value != null && Math.abs(modeled.value - US_DEMAND_INDEX[md]) > 0.001;
    });
    expect(changed.length).toBeGreaterThan(100);
    const from2026 = travelEvidenceFor('2026-07-11', 'US');
    const from2027 = travelEvidenceFor('2027-07-11', 'US');
    expect(from2026?.value).toBeCloseTo(from2027!.value!, 12);
  });

  it('supports leap-day seasonality through neighboring historical days', () => {
    const leap = travelEvidenceFor('2028-02-29', 'US');
    expect(leap?.kind).toBe('historical-seasonal-estimate');
    expect(leap?.value).toBeGreaterThan(0);
  });

  it('clearly labels non-US values as a rough heuristic, never measured local travel', () => {
    const uk = travelEvidenceFor('2027-07-14', 'GB')!;
    expect(uk).toMatchObject({
      kind: 'generic-seasonal-heuristic',
      sourceYear: null,
      confidence: 'low',
      value: 1.15,
    });
    expect(uk.source).toContain('no country-specific travel observations');
    expect(uk.caveat).toMatch(/not based on observed trips/i);
  });

  it('rejects malformed dates and countries', () => {
    expect(travelEvidenceFor('2027-02-30', 'US')).toBeNull();
    expect(travelEvidenceFor('2027-07-01', 'United Kingdom')).toBeNull();
    expect(travelEvidenceFor('2027-07-01', '')).toBeNull();
  });
});

describe('one US travel figure everywhere', () => {
  it('the planner (solver) and the travel evidence report the same value', async () => {
    const { demandFor } = await import('@daysoff/engine/data/demandIndex');
    for (const date of ['2026-01-21', '2027-07-11', '2028-02-29', '2027-12-31']) {
      expect(travelEvidenceFor(date, 'US')!.value).toBeCloseTo(demandFor(date, 'US').value, 12);
    }
  });
});

describe('"Fewer flyers than usual" (issue 8)', () => {
  const mean = (start: string, end: string) => {
    const values: number[] = [];
    for (let t = Date.parse(`${start}T00:00:00Z`); t <= Date.parse(`${end}T00:00:00Z`); t += 86_400_000) values.push(usSeasonalDemand(new Date(t).toISOString().slice(0, 10)));
    return values.reduce((a, b) => a + b, 0) / values.length;
  };

  it('is worded as 2025 TSA history, never as a price or forecast', () => {
    expect(FEWER_FLYERS_LABEL).toBe('Fewer flyers than usual (2025 TSA data)');
    expect(FEWER_FLYERS_LABEL).not.toMatch(/cheap|price|fare|deal|quieter/i);
  });

  it('holds only when a window is at least 15% below the yearly mean', () => {
    const yearly = usSeasonalYearlyMean();
    expect(yearly).toBeGreaterThan(0.8);
    expect(FEWER_FLYERS_THRESHOLD).toBe(0.85);
    const windows: [string, string][] = [];
    for (let m = 1; m <= 12; m++) for (const d of [1, 8, 15, 22]) {
      const start = `2027-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const end = new Date(Date.parse(`${start}T00:00:00Z`) + 4 * 86_400_000).toISOString().slice(0, 10);
      windows.push([start, end]);
    }
    let shown = 0;
    for (const [start, end] of windows) {
      const expected = mean(start, end) <= 0.85 * yearly;
      expect(fewerFlyersThanUsual(start, end), `${start}`).toBe(expected);
      if (expected) shown += 1;
    }
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(windows.length / 2);
    expect(fewerFlyersThanUsual('2027-07-01', '2027-07-05')).toBe(false);
    expect(fewerFlyersThanUsual('2027-12-20', '2027-12-31')).toBe(false);
    expect(fewerFlyersThanUsual('bad', '2027-01-05')).toBe(false);
  });
});
