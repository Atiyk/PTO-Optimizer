import { describe, expect, it } from 'vitest';
import { addDays } from '@daysoff/engine/solver/dateUtils';
import type { SolveInput } from '@daysoff/engine/solver/types';
import { solveConsumer } from './optimizer';
import { selectCanonicalPortfolios } from './canonicalPortfolio';
import type { ConstraintSet } from './constraintRecommendationAdapter';

const constraints: ConstraintSet = { dates: [], partial: false, missingSources: [] };
const scenarios = [
  { days: 60, start: '2027-01-01' },
  { days: 365, start: '2027-01-01' },
  { days: 730, start: '2027-01-01' },
] as const;

/**
 * Reproducible, CI-executed performance matrix. Reports actual runner milliseconds
 * for the unchanged one-shot consumer solve versus the portfolio adapter's multiple
 * bounded solves. Does not pretend a noisy CI wall clock is a stable latency SLA.
 */
describe('recommendation portfolio performance / unchanged solver baseline', () => {
  it('runs 60/365/730-day windows with 0/15/60/80 day budgets', () => {
    const results: Array<{ days: number; budget: number; baselineMs: number; portfolioMs: number; count: number }> = [];
    for (const scenario of scenarios) {
      for (const budget of [0, 15, 60, 80]) {
        const input: SolveInput = {
          rangeStart: scenario.start,
          rangeEnd: addDays(scenario.start, scenario.days - 1),
          budget, offDays: [], w: 0, breakCount: 3,
        };
        const startBaseline = performance.now();
        const baseline = solveConsumer(input);
        const baselineMs = Math.round(performance.now() - startBaseline);
        const startPortfolio = performance.now();
        const portfolios = selectCanonicalPortfolios(input, constraints);
        const portfolioMs = Math.round(performance.now() - startPortfolio);
        expect(baseline.result.breakCountRequested).toBe(3);
        expect(portfolios).not.toBeNull();
        expect(portfolios!.length).toBeLessThanOrEqual(4);
        for (const portfolio of portfolios!) {
          expect(portfolio.ptoDays).toBeLessThanOrEqual(budget);
          expect(portfolio.budgetRemaining).toBe(budget - portfolio.ptoDays);
          expect(portfolio.getawayCount).toBe(portfolio.breaks.length);
        }
        results.push({ days: scenario.days, budget, baselineMs, portfolioMs, count: portfolios!.length });
      }
    }
    console.info('canonical-portfolio-benchmark ' + JSON.stringify(results));
    expect(results).toHaveLength(12);
  }, 240_000);
});
