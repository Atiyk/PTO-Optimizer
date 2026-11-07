import { describe, expect, it } from 'vitest';
import { applyDateConstraints } from './constraintRecommendationAdapter';
import { selectRecommendationAlternatives } from './recommendationAlternatives';
const candidate = { start: '2028-03-01', end: '2028-03-05', ptoDays: 3, breakDays: 5, getawayCount: 1, hardExcludedDates: [], reviewDates: [] };
describe('applyDateConstraints', () => {
  it('excludes hard conflicts even when candidate claims no exclusions', () => {
    const set = { dates: [{ date: '2028-03-03', severity: 'hard-block' as const, provenance: 'user-blackout' as const, confidence: 'explicit' as const }], partial: false, missingSources: [] };
    expect(applyDateConstraints([candidate], set)).toEqual([]);
  });
  it('scores soft events without excluding feasible candidates', () => {
    const set = { dates: [{ date: '2028-03-03', severity: 'review-needed' as const, provenance: 'calendar-busy' as const, confidence: 'partial' as const }], partial: true, missingSources: ['Calendar incomplete'] };
    const output = applyDateConstraints([candidate], set)!;
    expect(output[0].reviewDates).toEqual(['2028-03-03']);
    expect(selectRecommendationAlternatives(output, 3)).toHaveLength(1);
  });
  it('preserves preexisting hard blocks and rejects invalid dates', () => {
    expect(applyDateConstraints([{ ...candidate, hardExcludedDates: ['2028-03-02'] }], { dates: [], partial: false, missingSources: [] })).toEqual([]);
    expect(applyDateConstraints([candidate], { dates: [{ date: '2028-02-30', severity: 'hard-block', provenance: 'user-blackout', confidence: 'explicit' }], partial: false, missingSources: [] })).toBeNull();
  });
});
