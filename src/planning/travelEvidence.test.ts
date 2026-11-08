import { describe, expect, it } from 'vitest';
import { US_DEMAND_INDEX } from '@daysoff/engine/data/demandIndex';
import { travelEvidenceFor } from './travelEvidence';

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
