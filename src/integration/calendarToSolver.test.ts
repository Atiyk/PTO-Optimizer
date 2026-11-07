import { describe, expect, it } from 'vitest';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import type { SolveInput } from '@daysoff/engine/solver/types';
import { solveConsumer, validatePtoDates } from '../planning/optimizer';
import { buildIntegratedCalendarEvidence } from './calendarEvidence';
import { calendarEvidenceToSolveInput } from './calendarToSolver';

describe('integration calendar-to-solver whole-day handoff', () => {
  it('prices rotating weekend shifts, leap date, observed holidays and approved PTO', () => {
    const evidence = buildIntegratedCalendarEvidence({
      start: '2028-02-28', end: '2028-03-06',
      schedule: { kind: 'cycle', cycleAnchor: '2028-02-28', cycleWorking: [true, false, true, true] },
      employerOffDays: ['2028-03-02'], approvedOffDays: ['2028-03-03'],
      hardBlockDays: ['2028-03-04'], advisoryBusyDays: ['2028-03-05'],
      schoolOffDays: ['2028-03-06'], calendarPartial: false,
    }, [])!;
    const original: SolveInput = {
      rangeStart: '2028-02-28', rangeEnd: '2028-03-06', budget: 2,
      offDays: [], blackouts: [], w: 0, breakCount: 1,
    };
    const mapped = calendarEvidenceToSolveInput(original, evidence)!;
    expect(mapped).not.toBeNull();
    expect(mapped.workWeek).toEqual([true, true, true, true, true, true, true]);
    expect(mapped.offDays).toEqual(expect.arrayContaining(['2028-02-29', '2028-03-02', '2028-03-03']));
    expect(mapped.blackouts).toEqual(['2028-03-04']);
    expect(validatePtoDates(mapped, ['2028-02-29', '2028-03-02', '2028-03-03']).ptoDays).toEqual([]);
    expect(validatePtoDates(mapped, ['2028-03-05']).ptoDays).toEqual(['2028-03-05']);
    expect(validatePtoDates(mapped, ['2028-03-06']).ptoDays).toEqual(['2028-03-06']);
    expect(validatePtoDates(mapped, ['2028-03-04']).valid).toBe(false);
    const result = solveConsumer(mapped).result;
    expect(result.budgetSpent).toBeLessThanOrEqual(2);
    expect(result.primary.flatMap(brk => brk.days)).not.toContain('2028-03-04');
    expect(validatePtoDates(mapped, result.primary.flatMap(brk => brk.days)).valid).toBe(true);
    expect(original.offDays).toEqual([]);
  });

  it('preserves legacy weekly PTO cost, and does not mark review or school context as blocked', () => {
    const original: SolveInput = {
      rangeStart: '2028-01-03', rangeEnd: '2028-01-09', budget: 5,
      offDays: ['2028-01-04'], workWeek: DEFAULT_WORK_WEEK,
      blackouts: ['2028-01-07'], w: 20, breakCount: 1,
    };
    const evidence = buildIntegratedCalendarEvidence({
      start: original.rangeStart, end: original.rangeEnd,
      schedule: { kind: 'weekly', weekly: DEFAULT_WORK_WEEK },
      employerOffDays: ['2028-01-04'], schoolOffDays: ['2028-01-06'],
      advisoryBusyDays: ['2028-01-05'], calendarPartial: false,
    }, [])!;
    const mapped = calendarEvidenceToSolveInput(original, evidence)!;
    expect(mapped.offDays).toEqual(['2028-01-04', '2028-01-08', '2028-01-09']);
    expect(mapped.blackouts).toEqual(['2028-01-07']);
    const days = ['2028-01-03', '2028-01-04', '2028-01-05', '2028-01-06', '2028-01-08', '2028-01-09'];
    expect(validatePtoDates(mapped, days).ptoDays).toEqual(validatePtoDates(original, days).ptoDays);
    expect(mapped.blackouts).not.toContain('2028-01-05');
    expect(mapped.blackouts).not.toContain('2028-01-06');
  });

  it('fails closed on fractional budgets or manipulated source and date contracts', () => {
    const evidence = buildIntegratedCalendarEvidence({
      start: '2028-01-03', end: '2028-01-04',
      schedule: { kind: 'weekly', weekly: DEFAULT_WORK_WEEK }, calendarPartial: false,
    }, [])!;
    const original: SolveInput = { rangeStart: '2028-01-03', rangeEnd: '2028-01-04', budget: 1, offDays: [] };
    expect(calendarEvidenceToSolveInput({ ...original, budget: 1.5 }, evidence)).toBeNull();
    expect(calendarEvidenceToSolveInput({ ...original, offDays: ['2028-02-30'] }, evidence)).toBeNull();
    expect(calendarEvidenceToSolveInput(original, { ...evidence, partial: true })).toBeNull();
    expect(calendarEvidenceToSolveInput(original, {
      ...evidence, constraints: { ...evidence.constraints, dates: [
        { date: '2028-01-03', severity: 'hard-block', provenance: 'user-blackout', confidence: 'explicit' },
      ] },
    })).toBeNull();
    expect(calendarEvidenceToSolveInput(original, {
      ...evidence, availability: { ...evidence.availability, days: [...evidence.availability.days].reverse() },
    })).toBeNull();
  });
});
