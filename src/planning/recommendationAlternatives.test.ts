import { describe, expect, it } from 'vitest';
import { selectRecommendationAlternatives, type RecommendationCandidate } from './recommendationAlternatives';
const candidate = (start: string, breakDays: number, getawayCount: number, ptoDays = 2): RecommendationCandidate =>
  ({ start, end: start, breakDays, getawayCount, ptoDays, hardExcludedDates: [], reviewDates: [] });
describe('deterministic consumer recommendation alternatives', () => {
  it('never selects a hard-blocked or over-budget candidate', () => {
    const blocked = { ...candidate('2027-01-05', 50, 10), hardExcludedDates: ['2027-01-05'] };
    const results = selectRecommendationAlternatives([blocked, candidate('2027-02-02', 5, 1)], 2);
    expect(results).toHaveLength(1);
    expect(results[0].start).toBe('2027-02-02');
    expect(selectRecommendationAlternatives([candidate('2027-02-02', 5, 1, 3)], 2)).toEqual([]);
  });
  it('returns distinct deterministic alternatives with factual explanation metadata', () => {
    const items = [candidate('2027-04-01', 12, 1), candidate('2027-05-01', 5, 4), candidate('2027-06-01', 9, 2), candidate('2027-07-01', 4, 1, 0)];
    const a = selectRecommendationAlternatives(items, 3);
    expect(a).toHaveLength(4);
    expect(new Set(a.map(x => x.start)).size).toBe(4);
    expect(selectRecommendationAlternatives(items, 3)).toEqual(a);
    expect(a[0].explanation).toContain('PTO days');
  });
});
