import { describe, expect, it } from 'vitest';
import type { SolveInput } from '@daysoff/engine/solver/types';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import { rangeISO, mondayIndexedDow } from '@daysoff/engine/solver/dateUtils';
import { analyzeCanonicalPortfolios } from './canonicalPortfolio';
import type { ConstraintSet } from './constraintRecommendationAdapter';
import { applyPortfolioSuggestion, suggestPortfolioChanges } from './portfolioSuggestions';

const empty: ConstraintSet = { dates: [], partial: false, missingSources: [] };
const year: SolveInput = {
  rangeStart: '2027-01-01', rangeEnd: '2027-12-31', budget: 15,
  offDays: ['2027-01-01', '2027-05-31', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24'],
  workWeek: DEFAULT_WORK_WEEK, w: 0, breakCount: 3,
};
const kinds = (input: SolveInput) => analyzeCanonicalPortfolios(input, empty)!.shortfalls.map(s => s.kind);
const count = (input: SolveInput) => analyzeCanonicalPortfolios(input, empty)!.portfolios.length;

/** Every suggestion must be checked by re-running the same search, never guessed. */
function expectVerified(input: SolveInput) {
  const report = analyzeCanonicalPortfolios(input, empty)!;
  const suggestions = suggestPortfolioChanges(input, empty, report);
  for (const suggestion of suggestions) {
    const changed = applyPortfolioSuggestion(input, suggestion);
    expect(count(changed)).toBe(suggestion.portfolioCount);
    expect(suggestion.portfolioCount).toBeGreaterThan(report.portfolios.length);
  }
  return suggestions;
}

describe('why fewer than three plans (issue 8)', () => {
  it('names a zero PTO balance as the reason, separately from other infeasibility', () => {
    const shortfalls = analyzeCanonicalPortfolios({ ...year, budget: 0 }, empty)!.shortfalls;
    expect(shortfalls.map(s => s.kind)).toEqual(['no-pto-days']);
    expect(shortfalls[0].message).toBe('You have 0 PTO days to plan with, so there are no plans to compare.');
  });

  it('says when ruled-out dates leave no room, rather than a generic failure', () => {
    const march = { ...year, rangeStart: '2027-03-01', rangeEnd: '2027-03-31', offDays: [] };
    const blackouts = rangeISO('2027-03-01', '2027-03-31').filter(d => mondayIndexedDow(d) < 5);
    expect(kinds({ ...march, blackouts })).toEqual(['unavailable-dates']);
    expect(kinds({ ...march, budget: 0, blackouts: [] })).toEqual(['no-pto-days']);
  });

  it('distinguishes duplicate objective winners from a single feasible plan', () => {
    expect(kinds(year)).toEqual(['shared-objective-winners']);
    const tiny: SolveInput = { ...year, rangeStart: '2027-03-02', rangeEnd: '2027-03-02', budget: 1, offDays: [] };
    expect(kinds(tiny)).toEqual(['one-plan-found']);
  });

  it('keeps limited holiday data as its own reason alongside the outcome', () => {
    const report = analyzeCanonicalPortfolios(year, { ...empty, partial: true })!;
    expect(report.shortfalls.map(s => s.kind)).toEqual(['incomplete-calendar', 'shared-objective-winners']);
    expect(report.shortfalls[0].message).toBe('Holiday data for these dates is missing or incomplete, so these plans may change. Check the dates before booking.');
  });
});

describe('verified suggestions for more plans (issue 8)', () => {
  it('suggests the smallest PTO increase that actually adds plans when the balance is 0', () => {
    const suggestions = expectVerified({ ...year, budget: 0 });
    expect(suggestions[0]).toEqual({ kind: 'add-pto', extraDays: 1, portfolioCount: 1 });
  });

  it('suggests a later end date when the date range is too short', () => {
    const tiny: SolveInput = { ...year, rangeStart: '2027-03-02', rangeEnd: '2027-03-02', budget: 3, offDays: [] };
    const suggestions = expectVerified(tiny);
    expect(suggestions).toContainEqual(expect.objectContaining({ kind: 'extend-end', rangeEnd: '2027-04-30' }));
    expect(suggestions.some(s => s.kind === 'add-pto')).toBe(false);
  });

  it('suggests nothing when duplicates are structural and no tested change adds a plan', () => {
    const suggestions = expectVerified(year);
    for (const s of suggestions) expect(s.portfolioCount).toBeGreaterThan(count(year));
  });

  it('can leave PTO unchanged for unlimited plans and stays within the search limits', () => {
    const suggestions = suggestPortfolioChanges({ ...year, budget: 0 }, empty,
      analyzeCanonicalPortfolios({ ...year, budget: 0 }, empty)!, { allowBudgetChange: false });
    expect(suggestions.every(s => s.kind !== 'add-pto')).toBe(true);
    const long: SolveInput = { ...year, rangeStart: '2027-01-01', rangeEnd: '2029-12-30', budget: 0 };
    for (const s of suggestPortfolioChanges(long, empty, analyzeCanonicalPortfolios(long, empty)!)) {
      if (s.kind === 'extend-end') expect(s.rangeEnd <= '2029-12-31').toBe(true);
    }
  });
});
