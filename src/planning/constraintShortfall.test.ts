import { describe, expect, it } from 'vitest';
import { explainConstraintShortfall } from './constraintShortfall';
describe('constraint shortfall explanations', () => {
  const req = { start: '2028-03-01', end: '2028-03-05', ptoNeeded: 5, availablePto: 3, earliestNoticeDate: '2028-03-02' };
  it('never silently relaxes hard exclusions and produces deterministic shortfalls', () => {
    const set = { dates: [{ date: '2028-03-03', severity: 'hard-block' as const, provenance: 'user-blackout' as const, confidence: 'explicit' as const }], partial: true, missingSources: ['incomplete'] };
    const issues = explainConstraintShortfall(req, set)!;
    expect(issues.map(i => i.kind)).toEqual(['blackout','budget','notice','missing-calendar']);
    expect(issues[0].dates).toEqual(['2028-03-03']);
    expect(issues[1].message).toContain('2 more PTO');
    expect(explainConstraintShortfall(req, set)).toEqual(issues);
  });
  it('keeps advisory events soft', () => {
    const set = { dates: [{ date: '2028-03-03', severity: 'review-needed' as const, provenance: 'calendar-busy' as const, confidence: 'partial' as const }], partial: false, missingSources: [] };
    expect(explainConstraintShortfall({ ...req, ptoNeeded: 2, earliestNoticeDate: undefined }, set)).toEqual([]);
  });
  it('rejects malformed dates rather than claiming feasibility', () => {
    expect(explainConstraintShortfall({ ...req, start: '2028-02-30' }, { dates: [], partial: false, missingSources: [] })).toBeNull();
  });
});
