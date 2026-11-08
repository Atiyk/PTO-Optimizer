import { describe, expect, it } from 'vitest';
import type { SolveInput } from '@daysoff/engine/solver/types';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import { mondayIndexedDow, rangeISO } from '@daysoff/engine/solver/dateUtils';
import { selectCanonicalPortfolios } from './canonicalPortfolio';
import type { ConstraintSet } from './constraintRecommendationAdapter';

const base: SolveInput = {
  rangeStart: '2027-04-01', rangeEnd: '2027-08-31',
  budget: 12, offDays: ['2027-05-31', '2027-07-05'],
  workWeek: DEFAULT_WORK_WEEK, w: 0, breakCount: 3,
};
const empty: ConstraintSet = { dates: [], partial: false, missingSources: [] };

describe('whole-plan consumer recommendations', () => {
  it('produces real multi-getaway portfolios with exact aggregate funded cost and distinct plans', () => {
    const portfolios = selectCanonicalPortfolios(base, empty);
    expect(portfolios).not.toBeNull();
    expect(portfolios!.length).toBeGreaterThan(0);
    expect(new Set(portfolios!.map(p => p.breaks.map(b => b.start + '/' + b.end).join('|'))).size)
      .toBe(portfolios!.length);
    const several = portfolios!.find(p => p.objective === 'most-getaways');
    expect(several).toBeDefined();
    expect(several!.getawayCount).toBeGreaterThanOrEqual(2);
    for (const portfolio of portfolios!) {
      expect(portfolio.getawayCount).toBe(portfolio.breaks.length);
      expect(portfolio.travelSignal).toBe('not-used');
      expect(portfolio.ptoDays + portfolio.budgetRemaining).toBe(base.budget);
      const seen = new Set<string>();
      let cost = 0;
      let length = 0;
      for (const brk of portfolio.breaks) {
        const days = rangeISO(brk.start, brk.end);
        expect(brk.calendarDays).toBe(days.length);
        const actualCost = days.filter(d => DEFAULT_WORK_WEEK[mondayIndexedDow(d)] && !base.offDays.includes(d)).length;
        expect(brk.ptoDays).toBe(actualCost);
        cost += actualCost;
        length += days.length;
        days.forEach(d => { expect(seen.has(d)).toBe(false); seen.add(d); });
      }
      expect(portfolio.ptoDays).toBe(cost);
      expect(portfolio.totalCalendarDays).toBe(length);
      expect(portfolio.longestBreakDays).toBe(Math.max(...portfolio.breaks.map(b => b.calendarDays)));
    }
  });

  it('never downgrades the most-getaways label to a runner-up after objective collisions', () => {
    const portfolios = selectCanonicalPortfolios(base, empty)!;
    const getaway = portfolios.find(p => p.objective === 'most-getaways');
    expect(getaway).toBeDefined();
    expect(getaway!.getawayCount).toBeGreaterThanOrEqual(2);
    expect(getaway!.getawayCount).toBe(Math.max(...portfolios.map(p => p.getawayCount)));
    const longest = portfolios.find(p => p.objective === 'longest-break');
    if (longest) {
      expect(longest.longestBreakDays).toBe(Math.max(...portfolios.map(p => p.longestBreakDays)));
    }
    expect(new Set(portfolios.map(p => p.breaks.map(b => b.start + '/' + b.end).join('|'))).size)
      .toBe(portfolios.length);
  });

  it('passes hard blackouts to every solve, but only warns for soft events', () => {
    const constraint: ConstraintSet = { dates: [
      { date: '2027-04-02', severity: 'hard-block', provenance: 'user-blackout', confidence: 'explicit' },
      { date: '2027-04-09', severity: 'review-needed', provenance: 'calendar-busy', confidence: 'partial' },
    ], partial: true, missingSources: ['Private event text must never be copied'] };
    const portfolios = selectCanonicalPortfolios(base, constraint);
    expect(portfolios).not.toBeNull();
    for (const portfolio of portfolios!) {
      expect(portfolio.partialCalendarEvidence).toBe(true);
      expect(JSON.stringify(portfolio)).not.toContain('Private event text');
      for (const brk of portfolio.breaks) {
        const dates = rangeISO(brk.start, brk.end);
        expect(dates).not.toContain('2027-04-02');
      }
      expect(portfolio.reviewDates.every(date => portfolio.breaks.some(b => date >= b.start && date <= b.end))).toBe(true);
    }
  });

  it('never presents a whole plan that omits required PTO dates or overspends monthly accrual', () => {
    const accrual: SolveInput = {
      ...base, rangeStart: '2027-01-01', rangeEnd: '2027-12-31',
      offDays: [], budget: 8, accrualPerMonth: 1,
      mustIncludeDays: ['2027-06-10', '2027-09-09'],
    };
    const portfolios = selectCanonicalPortfolios(accrual, empty);
    expect(portfolios).not.toBeNull();
    for (const portfolio of portfolios!) {
      const all = portfolio.breaks.flatMap(b => rangeISO(b.start, b.end));
      for (const required of accrual.mustIncludeDays!) expect(all).toContain(required);
      const used = all.filter(d => DEFAULT_WORK_WEEK[mondayIndexedDow(d)]);
      used.forEach((date, index) => {
        const elapsedMonths = (Number(date.slice(0, 4)) - 2027) * 12 + Number(date.slice(5, 7)) - 1;
        expect(index + 1).toBeLessThanOrEqual(elapsedMonths);
      });
    }
  });

  it('fails closed on fractional wallet units, invalid dates and malformed constraints', () => {
    expect(selectCanonicalPortfolios({ ...base, budget: 1.5 }, empty)).toBeNull();
    expect(selectCanonicalPortfolios({ ...base, rangeEnd: '2027-02-30' }, empty)).toBeNull();
    expect(selectCanonicalPortfolios({ ...base, workWeek: [true] as unknown as typeof DEFAULT_WORK_WEEK }, empty)).toBeNull();
    expect(selectCanonicalPortfolios(base, { ...empty, dates: [
      { date: '2027-02-30', severity: 'hard-block', provenance: 'user-blackout', confidence: 'explicit' },
    ] })).toBeNull();
  });
});
