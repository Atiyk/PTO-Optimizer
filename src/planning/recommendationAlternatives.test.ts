import { describe, expect, it } from 'vitest';
import { addDays } from '@daysoff/engine/solver/dateUtils';
import { selectRecommendationAlternatives, type RecommendationCandidate } from './recommendationAlternatives';
const candidate = (start: string, breakDays: number, getawayCount: number, ptoDays = 2): RecommendationCandidate =>
  ({ start, end: addDays(start, breakDays - 1), breakDays, getawayCount, ptoDays, hardExcludedDates: [], reviewDates: [] });
describe('deterministic consumer recommendation alternatives', () => {
  it('never selects a hard-blocked or over-budget candidate', () => {
    const blocked = { ...candidate('2027-01-05', 50, 10), hardExcludedDates: ['2027-01-05'] };
    const results = selectRecommendationAlternatives([blocked, candidate('2027-02-02', 5, 1)], 2);
    expect(results).toHaveLength(1);
    expect(results[0].start).toBe('2027-02-02');
    expect(selectRecommendationAlternatives([candidate('2027-02-02', 5, 1, 3)], 2)).toEqual([]);
  });
  it('rejects impossible dates and fabricated span lengths', () => {
    expect(selectRecommendationAlternatives([candidate('2027-02-30', 4, 1)], 5)).toEqual([]);
    expect(selectRecommendationAlternatives([{ ...candidate('2027-04-01', 5, 1), breakDays: 50 }], 5)).toEqual([]);
    expect(selectRecommendationAlternatives([{ ...candidate('2027-04-01', 5, 1), ptoDays: 6 }], 6)).toEqual([]);
  });
  it('prevents overlapping alternatives and ignores advisory events outside the selected interval', () => {
    const items = [
      candidate('2027-04-01', 12, 1, 2),
      candidate('2027-04-04', 5, 4, 2),
      { ...candidate('2027-05-01', 6, 2, 2), reviewDates: ['2027-03-01', '2027-05-03'] },
    ];
    const results = selectRecommendationAlternatives(items, 4);
    expect(results.length).toBe(2);
    for (let i = 0; i < results.length; i++) {
      for (let j = i + 1; j < results.length; j++) {
        expect(results[i].end < results[j].start || results[j].end < results[i].start).toBe(true);
      }
    }
    expect(results.find(r => r.start === '2027-05-01')?.reviewDates).toEqual(['2027-05-03']);
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
