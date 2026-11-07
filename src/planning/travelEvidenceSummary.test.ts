import { describe, expect, it } from 'vitest';
import { travelWindowEvidence } from './travelEvidenceSummary';
describe('bounded source-honest travel window evidence', () => {
  it('uses a seasonal US average without pretending to know fares or weekday-specific 2027 demand', () => {
    const x = travelWindowEvidence('2027-07-02', '2027-07-05', 'US')!;
    expect(x.sampledDays).toBe(4);
    expect(x.sourceYear).toBe(2025);
    expect(x.kind).toBe('historical-seasonal-estimate');
    expect(x.meanIndex).toBeGreaterThan(0);
    expect(x.caveat).toContain('Not live demand');
  });
  it('labels unsupported country inputs as generic rather than measured travel', () => {
    const x = travelWindowEvidence('2028-02-28', '2028-03-01', 'GB')!;
    expect(x.kind).toBe('generic-seasonal-heuristic');
    expect(x.sourceYear).toBeNull();
    expect(x.caveat).toContain('not based on observed trips');
  });
  it('rejects invalid, reversed and oversized windows', () => {
    expect(travelWindowEvidence('2027-02-30', '2027-03-01', 'US')).toBeNull();
    expect(travelWindowEvidence('2027-03-02', '2027-03-01', 'US')).toBeNull();
    expect(travelWindowEvidence('2027-01-01', '2027-03-01', 'US')).toBeNull();
  });
});
