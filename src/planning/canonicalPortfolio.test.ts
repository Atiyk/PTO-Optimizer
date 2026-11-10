import { describe, expect, it } from 'vitest';
import type { SolveInput } from '@daysoff/engine/solver/types';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import { isoToSerial, mondayIndexedDow, rangeISO } from '@daysoff/engine/solver/dateUtils';
import { comparePortfolioMetrics, normalizePortfolioBreaks, selectCanonicalPortfolios } from './canonicalPortfolio';
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
      for (let i = 1; i < portfolio.breaks.length; i++) {
        expect(isoToSerial(portfolio.breaks[i].start) - isoToSerial(portfolio.breaks[i - 1].end))
          .toBeGreaterThan(1);
      }
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

  it('keeps primary objectives lexicographic even across a 1,096-day horizon', () => {
    const moreGetaways = {
      getawayCount: 3, longestBreakDays: 4, totalCalendarDays: 12,
      ptoDays: 6, reviewDates: [] as string[],
    };
    const longerCalendar = {
      getawayCount: 2, longestBreakDays: 8, totalCalendarDays: 1080,
      ptoDays: 10, reviewDates: [] as string[],
    };
    expect(comparePortfolioMetrics(moreGetaways, longerCalendar, 'most-getaways'))
      .toBeLessThan(0);
    expect(comparePortfolioMetrics(longerCalendar, moreGetaways, 'longest-break'))
      .toBeLessThan(0);
    const longerSingle = { ...longerCalendar, getawayCount: 1, longestBreakDays: 5 };
    const hugeSecondary = { ...moreGetaways, longestBreakDays: 4, totalCalendarDays: 1090 };
    expect(comparePortfolioMetrics(longerSingle, hugeSecondary, 'longest-break'))
      .toBeLessThan(0);
    expect(comparePortfolioMetrics(moreGetaways, longerCalendar, 'most-getaways'))
      .toBe(-comparePortfolioMetrics(longerCalendar, moreGetaways, 'most-getaways'));
  });

  it('counts adjacent solver break segments as one getaway, but rejects overlap', () => {
    const pieces = [
      { start: '2027-04-01', end: '2027-04-03', calendarDays: 3, ptoDays: 2 },
      { start: '2027-04-04', end: '2027-04-05', calendarDays: 2, ptoDays: 1 },
      { start: '2027-04-08', end: '2027-04-10', calendarDays: 3, ptoDays: 1 },
    ];
    expect(normalizePortfolioBreaks(pieces)).toEqual([
      { start: '2027-04-01', end: '2027-04-05', calendarDays: 5, ptoDays: 3 }, pieces[2],
    ]);
    expect(normalizePortfolioBreaks([pieces[0], {
      ...pieces[1], start: '2027-04-03', calendarDays: 3,
    }])).toBeNull();
    expect(normalizePortfolioBreaks(pieces)).toEqual(normalizePortfolioBreaks([...pieces].reverse()));
  });

  it('uses neutral free calendar dates for rotating-shift nonwork dates and honors notice', () => {
    const shifts: SolveInput = {
      ...base, rangeStart: '2027-04-01', rangeEnd: '2027-05-31',
      budget: 7, workWeek: [true, true, true, true, true, true, true],
      offDays: ['2027-04-03', '2027-04-04', '2027-04-10', '2027-04-11'],
    };
    const portfolios = selectCanonicalPortfolios(shifts, empty, { earliestNoticeDate: '2027-04-15' })!;
    for (const portfolio of portfolios) {
      expect(portfolio).not.toHaveProperty('freeWorkingDates');
      for (const date of portfolio.freeCalendarDates) expect(shifts.offDays).toContain(date);
      for (const brk of portfolio.breaks) expect(brk.start >= '2027-04-15').toBe(true);
    }
    expect(selectCanonicalPortfolios(shifts, empty, { earliestNoticeDate: '2027-02-30' })).toBeNull();
    expect(selectCanonicalPortfolios({ ...shifts, mustIncludeDays: ['2027-04-08'] }, empty,
      { earliestNoticeDate: '2027-04-15' })).toEqual([]);
  });

  it('recovers a lower-ranked funded portfolio before objective selection', () => {
    const solo = selectCanonicalPortfolios(base, empty)!;
    expect(solo.length).toBeGreaterThan(0);
    expect(solo[0].ptoDays).toBeGreaterThan(3);
    const joint = selectCanonicalPortfolios(base, empty, {
      additionalSearchBudgets: [3],
      candidateEligible: candidate => candidate.ptoDays <= 3,
    })!;
    expect(joint).not.toBeNull();
    expect(joint.length).toBeGreaterThan(0);
    expect(joint.every(p => p.ptoDays <= 3 && p.budgetRemaining === base.budget - p.ptoDays)).toBe(true);
    expect(joint.every(p => p.travelSignal === 'not-used')).toBe(true);
    expect(new Set(joint.map(p => p.breaks.map(b => b.start + '/' + b.end).join('|'))).size).toBe(joint.length);
    expect(joint[0].breaks).not.toEqual(solo[0].breaks);
  });

  it('rejects invalid eligibility callbacks and unbounded solver probes', () => {
    expect(selectCanonicalPortfolios(base, empty, {
      additionalSearchBudgets: [1, 2, 3, 4],
    })).toBeNull();
    expect(selectCanonicalPortfolios(base, empty, {
      additionalSearchBudgets: [-1],
    })).toBeNull();
    expect(selectCanonicalPortfolios(base, empty, {
      candidateEligible: (() => 'true') as unknown as () => boolean,
    })).toBeNull();
    expect(selectCanonicalPortfolios(base, empty, {
      candidateEligible: () => { throw new Error('untrusted caller'); },
    })).toBeNull();
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
