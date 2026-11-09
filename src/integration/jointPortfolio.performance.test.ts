import { describe, expect, it } from 'vitest';
import type { SolveInput } from '@daysoff/engine/solver/types';
import { addDays, rangeISO } from '@daysoff/engine/solver/dateUtils';
import { buildIntegratedCalendarEvidence } from './calendarEvidence';
import { calendarEvidenceToSolveInput } from './calendarToSolver';
import { selectJointFundedPortfolios } from './jointPortfolioHandoff';
import { selectCanonicalPortfolios } from '../planning/canonicalPortfolio';

/** CI evidence for the optional additional-budget probes and partner eligibility
 * that are NOT exercised by the legacy S portfolio benchmark. Timings are
 * observational, not a hard latency SLA on a shared runner.
 */
describe('joint portfolio recommendation benchmark / actual independent funding', () => {
  it('compares single-adult and partner-funded 60/365/730-day windows for 0/15/60/80 PTO', () => {
    const observations: Array<{
      days: number; budgetA: number; budgetB: number;
      soloMs: number; jointMs: number; soloCount: number; jointCount: number;
    }> = [];
    for (const days of [60, 365, 730]) {
      const start = '2027-01-01';
      const end = addDays(start, days - 1);
      const a = buildIntegratedCalendarEvidence({
        start, end,
        schedule: { kind: 'weekly', weekly: [true, true, true, true, true, false, false] },
        calendarPartial: false,
      }, [])!;
      const b = buildIntegratedCalendarEvidence({
        start, end,
        schedule: { kind: 'weekly', weekly: [true, true, true, true, false, false, false] },
        employerOffDays: ['2027-05-31'],
        hardBlockDays: ['2027-02-15'],
        calendarPartial: false,
      }, [])!;
      for (const budgetA of [0, 15, 60, 80]) {
        const budgetB = Math.min(budgetA, 15);
        const input: SolveInput = {
          rangeStart: start, rangeEnd: end, budget: budgetA,
          offDays: [], blackouts: [], breakCount: 3, w: 0,
        };
        const mapped = calendarEvidenceToSolveInput(input, a)!;
        const beforeSolo = performance.now();
        const solo = selectCanonicalPortfolios(mapped, a.constraints)!;
        const soloMs = Math.round(performance.now() - beforeSolo);
        const beforeJoint = performance.now();
        const joint = selectJointFundedPortfolios(input, a, b, budgetA, budgetB)!;
        const jointMs = Math.round(performance.now() - beforeJoint);
        expect(joint).not.toBeNull();
        const offered = [...joint.feasible, ...joint.needsReview];
        expect(offered.length).toBeLessThanOrEqual(4);
        for (const item of offered) {
          expect(item.ptoDaysA).toBeLessThanOrEqual(budgetA);
          expect(item.ptoDaysB).toBeLessThanOrEqual(budgetB);
          expect(item.portfolio.budgetRemaining).toBe(budgetA - item.ptoDaysA);
          expect(item.portfolio.travelSignal).toBe('not-used');
          const selected = item.portfolio.breaks.flatMap(brk => rangeISO(brk.start, brk.end));
          expect(selected).not.toContain('2027-02-15');
        }
        observations.push({
          days, budgetA, budgetB, soloMs, jointMs,
          soloCount: solo.length, jointCount: offered.length,
        });
      }
    }
    console.info('joint-portfolio-benchmark ' + JSON.stringify(observations));
    expect(observations).toHaveLength(12);
  }, 240_000);
});
