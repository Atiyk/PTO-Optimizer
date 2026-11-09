import { describe, expect, it } from 'vitest';
import type { SolveInput } from '@daysoff/engine/solver/types';
import { rangeISO } from '@daysoff/engine/solver/dateUtils';
import type { TimeOffPolicy } from '../policy/model';
import { legacyVacationBank, projectLeaveWallet } from '../personal/leaveWallet';
import { buildIntegratedCalendarEvidence } from './calendarEvidence';
import { jointWindowFeasibility } from '../personal/recurringAvailability';
import { schoolCoverage } from '../personal/schoolCoverage';
import { calendarEvidenceToSolveInput } from './calendarToSolver';
import { selectCanonicalRecommendationAlternatives } from '../planning/canonicalRecommendation';
import { travelEvidenceFor } from '../planning/travelEvidence';

const policy: TimeOffPolicy = {
  unit: 'days', hoursPerDay: 8, currentBalance: 5,
  balanceAsOf: '2027-01-01',
  accrual: { kind: 'per-pay-period', amount: 1, frequency: 'monthly', payDateAnchor: '2028-01-15' }, planYear: { kind: 'calendar' },
  carryover: { mode: 'all' }, negativeBalanceAllowance: 0,
  payoutOnLeaving: 'not-sure', plannedDays: [],
};

describe('integration: actual wallet -> rotating family calendar -> canonical portfolios', () => {
  it('funds each adult independently, excludes blackouts before solving and preserves travel provenance', () => {
    const first = projectLeaveWallet([legacyVacationBank(policy)], '2027-01-20')!;
    const second = projectLeaveWallet([
      { ...legacyVacationBank({ ...policy, currentBalance: 4 }), id: 'partner' },
    ], '2027-01-20')!;
    const firstBalance = first.banks[0].confirmedBalance!;
    const secondBalance = second.banks[0].confirmedBalance!;
    expect(firstBalance).toBe(5);
    expect(secondBalance).toBe(4);

    const start = '2027-01-20', end = '2027-01-26';
    const a = buildIntegratedCalendarEvidence({
      start, end, schedule: {
        kind: 'cycle', cycleAnchor: start, cycleWorking: [true, true, false, true],
      },
      approvedOffDays: ['2027-01-20'], employerOffDays: ['2027-01-21'],
      schoolOffDays: ['2027-01-21'], hardBlockDays: ['2027-01-23'],
      advisoryBusyDays: ['2027-01-22'], calendarPartial: false,
    }, [])!;
    const b = buildIntegratedCalendarEvidence({
      start, end, schedule: { kind: 'weekly', weekly: [true, true, true, true, true, false, false] },
      employerOffDays: ['2027-01-20'], calendarPartial: false,
    }, [])!;
    expect(a.constraints.dates).toEqual(expect.arrayContaining([
      expect.objectContaining({ date: '2027-01-21', provenance: 'school-closure', severity: 'context' }),
      expect.objectContaining({ date: '2027-01-23', severity: 'hard-block' }),
      expect.objectContaining({ date: '2027-01-22', severity: 'review-needed' }),
    ]));
    const joint = jointWindowFeasibility(a.availability, b.availability, firstBalance, secondBalance)!;
    expect(joint).not.toBeNull();
    expect(joint.hardBlockDates).toContain('2027-01-23');
    expect(joint.possible).toBe(false);

    const original: SolveInput = {
      rangeStart: start, rangeEnd: end, offDays: [], budget: Math.floor(firstBalance),
      blackouts: [], w: 0, breakCount: 1,
    };
    const mapped = calendarEvidenceToSolveInput(original, a)!;
    expect(mapped).not.toBeNull();
    expect(mapped.blackouts).toContain('2027-01-23');
    expect(mapped.offDays).toContain('2027-01-20');
    expect(mapped.offDays).toContain('2027-01-21');
    expect(mapped.blackouts).not.toContain('2027-01-22');
    const portfolios = selectCanonicalRecommendationAlternatives(mapped, a.constraints)!;
    expect(portfolios).not.toBeNull();
    expect(portfolios.length).toBeGreaterThan(0);
    const unique = new Set(portfolios.map(p => p.start + '/' + p.end));
    expect(unique.size).toBe(portfolios.length);
    for (const p of portfolios) {
      const dates = rangeISO(p.start, p.end);
      expect(dates).not.toContain('2027-01-23');
      expect(p.ptoDays).toBeLessThanOrEqual(Math.floor(firstBalance));
      expect(p.ptoDays).toBeGreaterThanOrEqual(0);
      expect(p.getawayCount).toBe(1);
      // A solo recommendation is not automatically a feasible couple recommendation.
      // Independently validate every proposed interval against BOTH actual calendars.
      const daysA = a.availability.days.filter(d => d.date >= p.start && d.date <= p.end);
      const daysB = b.availability.days.filter(d => d.date >= p.start && d.date <= p.end);
      expect(daysA.length).toBe(dates.length);
      expect(daysB.length).toBe(dates.length);
      const candidateA = { ...a.availability, days: daysA };
      const candidateB = { ...b.availability, days: daysB };
      const couple = jointWindowFeasibility(candidateA, candidateB, firstBalance, secondBalance)!;
      expect(couple).not.toBeNull();
      expect(couple.ptoDaysA).toBeLessThanOrEqual(firstBalance);
      expect(couple.ptoDaysB).toBeGreaterThanOrEqual(0);
      const coverage = schoolCoverage(candidateA, candidateB)!;
      expect(coverage).not.toBeNull();
      expect(coverage.days.length).toBe(dates.length);
      expect(coverage.potentialGapDays).toBe(coverage.days.filter(d => d.potentialCoverageGap).length);
      // A partner-only hard conflict must veto joint feasibility, without altering
      // the adult-A-only solver's recommendation or leaking calendar event titles.
      const blockedB = { ...candidateB, days: candidateB.days.map((d, i) =>
        i === 0 ? { ...d, hardBlocked: true } : d) };
      const blocked = jointWindowFeasibility(candidateA, blockedB, firstBalance, secondBalance)!;
      expect(blocked.possible).toBe(false);
      expect(blocked.hardBlockDates).toContain(p.start);
      // A separate partner PTO bank can be exhausted even when A is fully funded.
      if (couple.ptoDaysB > 0) {
        const unfunded = jointWindowFeasibility(candidateA, candidateB, firstBalance, 0)!;
        expect(unfunded.possible).toBe(false);
        expect(unfunded.ptoDaysB).toBe(couple.ptoDaysB);
      }
    }
    expect(calendarEvidenceToSolveInput({ ...original, budget: firstBalance - 0.5 }, a)).toBeNull();
    const travel = travelEvidenceFor(portfolios[0].start, 'US')!;
    expect(travel.sourceYear).toBe(2025);
    expect(travel.confidence).toBe('low');
    expect(travel.caveat).toMatch(/Not live demand/);
    const privateString = JSON.stringify({ first, second, a, b, joint, portfolios, travel });
    expect(privateString).not.toMatch(/PRIVATE CALENDAR TITLE|PRIVATE PLAN|PRIVATE APPOINTMENT/);
    expect(original.blackouts).toEqual([]);
  });
});
