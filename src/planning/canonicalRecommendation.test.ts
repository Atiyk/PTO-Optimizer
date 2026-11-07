import { describe, expect, it } from 'vitest';
import type { SolveInput } from '@daysoff/engine/solver/types';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import { mondayIndexedDow, rangeISO } from '@daysoff/engine/solver/dateUtils';
import { selectCanonicalRecommendationAlternatives } from './canonicalRecommendation';
import type { ConstraintSet } from './constraintRecommendationAdapter';

const input: SolveInput = {
  rangeStart: '2027-04-01', rangeEnd: '2027-05-31',
  offDays: [], budget: 4, workWeek: DEFAULT_WORK_WEEK, w: 0, breakCount: 2,
};
const empty: ConstraintSet = { dates: [], partial: false, missingSources: [] };

describe('canonical recommendation source', () => {
  it('reprices actual solver output with calendar facts, never accepts caller cost claims', () => {
    const result = selectCanonicalRecommendationAlternatives(input, empty);
    expect(result).not.toBeNull();
    expect(result!.length).toBeGreaterThan(0);
    for (const c of result!) {
      const days = rangeISO(c.start, c.end);
      expect(c.breakDays).toBe(days.length);
      expect(c.ptoDays).toBe(days.filter(d => DEFAULT_WORK_WEEK[mondayIndexedDow(d)]).length);
      expect(c.ptoDays).toBeLessThanOrEqual(input.budget);
      expect(c.getawayCount).toBe(1);
    }
  });

  it('applies hard blocks before solving, with soft events only as advice', () => {
    const set: ConstraintSet = { dates: [
      { date: '2027-04-02', severity: 'hard-block', provenance: 'user-blackout', confidence: 'explicit' },
      { date: '2027-04-09', severity: 'review-needed', provenance: 'calendar-busy', confidence: 'partial' },
    ], partial: true, missingSources: ['Calendar incomplete'] };
    const result = selectCanonicalRecommendationAlternatives(input, set)!;
    for (const c of result) {
      expect(rangeISO(c.start, c.end)).not.toContain('2027-04-02');
      expect(c.reviewDates.every(d => d >= c.start && d <= c.end)).toBe(true);
    }
  });

  it('never promotes a multi-break fragment into a standalone plan that omits pinned PTO', () => {
    const required = ['2027-04-06', '2027-05-18'];
    const result = selectCanonicalRecommendationAlternatives({
      ...input, budget: 8, mustIncludeDays: required, breakCount: 2,
    }, empty);
    expect(result).not.toBeNull();
    for (const candidate of result!) {
      const days = rangeISO(candidate.start, candidate.end);
      for (const date of required) expect(days).toContain(date);
    }
  });

  it('validates accrual funding at actual spending dates for every standalone recommendation', () => {
    const fundedInput: SolveInput = {
      ...input, rangeStart: '2027-01-01', rangeEnd: '2027-08-31',
      budget: 6, accrualPerMonth: 1, breakCount: 3,
    };
    const result = selectCanonicalRecommendationAlternatives(fundedInput, empty);
    expect(result).not.toBeNull();
    for (const candidate of result!) {
      const pto = rangeISO(candidate.start, candidate.end)
        .filter(d => DEFAULT_WORK_WEEK[mondayIndexedDow(d)]);
      for (let i = 0; i < pto.length; i++) {
        const date = pto[i];
        const monthOffset = (Number(date.slice(0, 4)) - 2027) * 12
          + Number(date.slice(5, 7)) - 1;
        expect(i + 1).toBeLessThanOrEqual(monthOffset);
      }
    }
  });

  it('fails closed on malformed ranges and non-day budget units', () => {
    expect(selectCanonicalRecommendationAlternatives({ ...input, rangeStart: '2027-02-30' }, empty)).toBeNull();
    expect(selectCanonicalRecommendationAlternatives({ ...input, budget: 1.5 }, empty)).toBeNull();
    expect(selectCanonicalRecommendationAlternatives(input, { ...empty, dates: [
      { date: '2027-02-30', severity: 'hard-block', provenance: 'user-blackout', confidence: 'explicit' },
    ] })).toBeNull();
  });
});
