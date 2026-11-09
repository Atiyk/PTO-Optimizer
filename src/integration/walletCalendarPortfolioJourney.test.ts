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
import { filterJointPortfolios, selectJointFundedPortfolios } from './jointPortfolioHandoff';
import { selectCanonicalPortfolios } from '../planning/canonicalPortfolio';

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

    // The couple-facing route must FILTER canonical output, not merely
    // calculate partner feasibility alongside adult A's solo suggestions.
    const jointlyFunded = selectJointFundedPortfolios(original, a, b, firstBalance, secondBalance)!;
    expect(jointlyFunded).not.toBeNull();
    for (const option of [...jointlyFunded.feasible, ...jointlyFunded.needsReview]) {
      expect(option.ptoDaysA).toBeLessThanOrEqual(firstBalance);
      expect(option.ptoDaysB).toBeLessThanOrEqual(secondBalance);
      expect(option.portfolio.ptoDays).toBe(option.ptoDaysA);
      expect(option.portfolio.budgetRemaining).toBe(firstBalance - option.ptoDaysA);
      expect(option.portfolio.breaks.flatMap(brk => rangeISO(brk.start, brk.end))).not.toContain('2027-01-23');
    }
    expect(original.blackouts).toEqual([]);
  });

  it('recovers a jointly funded lower-ranked plan after the adult-A-only optimum exceeds B budget', () => {
    const start = '2027-04-01', end = '2027-08-31';
    const input: SolveInput = { rangeStart: start, rangeEnd: end, budget: 12,
      offDays: [], blackouts: [], w: 0, breakCount: 3 };
    const a = buildIntegratedCalendarEvidence({
      start, end,
      schedule: { kind: 'weekly', weekly: [true, true, true, true, true, false, false] },
      calendarPartial: false,
    }, [])!;
    const b = buildIntegratedCalendarEvidence({
      start, end,
      schedule: { kind: 'weekly', weekly: [true, true, true, true, false, false, false] },
      employerOffDays: ['2027-05-31'], hardBlockDays: ['2027-06-11'],
      calendarPartial: false,
    }, [])!;
    const mapped = calendarEvidenceToSolveInput(input, a)!;
    const solo = selectCanonicalPortfolios(mapped, a.constraints)!;
    expect(solo.length).toBeGreaterThan(0);
    const soloChecked = filterJointPortfolios(solo, a.availability, b.availability, 12, 3)!;
    expect(soloChecked.rejected).toBeGreaterThan(0);
    const joint = selectJointFundedPortfolios(input, a, b, 12, 3)!;
    expect(joint).not.toBeNull();
    const offered = [...joint.feasible, ...joint.needsReview];
    expect(offered.length).toBeGreaterThan(0);
    // The funded replacement was absent from the four adult-A-only winners.
    const soloKeys = new Set(solo.map(p => p.breaks.map(brk => brk.start + '/' + brk.end).join('|')));
    expect(offered.some(item =>
      !soloKeys.has(item.portfolio.breaks.map(brk => brk.start + '/' + brk.end).join('|')))).toBe(true);
    for (const item of offered) {
      expect(item.ptoDaysA).toBeLessThanOrEqual(12);
      expect(item.ptoDaysB).toBeLessThanOrEqual(3);
      expect(item.portfolio.budgetRemaining).toBe(12 - item.ptoDaysA);
      expect(item.portfolio.travelSignal).toBe('not-used');
      expect(item.portfolio.breaks.flatMap(brk => rangeISO(brk.start, brk.end)))
        .not.toContain('2027-06-11');
    }
    expect(input.blackouts).toEqual([]);
  });

  it('includes partner-only advisory dates before ranking constraint-fit portfolios', () => {
    const start = '2027-04-01', end = '2027-05-31';
    const schedule = { kind: 'weekly' as const, weekly: [
      true, true, true, true, true, false, false,
    ] as [boolean, boolean, boolean, boolean, boolean, boolean, boolean] };
    const input: SolveInput = { rangeStart: start, rangeEnd: end, budget: 7,
      offDays: [], blackouts: [], w: 0, breakCount: 3 };
    const a = buildIntegratedCalendarEvidence({ start, end, schedule, calendarPartial: false }, [])!;
    const b = buildIntegratedCalendarEvidence({
      start, end, schedule, calendarPartial: false,
      advisoryBusyDays: rangeISO(start, end),
    }, [])!;
    let sawPreRankingAdvisories = false;
    let called = 0;
    const joint = selectJointFundedPortfolios(input, a, b, 7, 7, {
      candidateEligible: candidate => {
        called++;
        if (candidate.reviewDates.length > 0) sawPreRankingAdvisories = true;
        return true;
      },
    })!;
    expect(called).toBeGreaterThan(0);
    expect(sawPreRankingAdvisories).toBe(true);
    // Ignore neither forged partner completeness nor missing advisory metadata.
    expect(selectJointFundedPortfolios(input, a, { ...b, partial: true }, 7, 7)).toBeNull();
    expect(selectJointFundedPortfolios(input, a, {
      ...b, constraints: { ...b.constraints, dates: [] },
    }, 7, 7)).toBeNull();
    expect(joint.feasible).toEqual([]);
    expect(joint.needsReview.length).toBeGreaterThan(0);
    for (const item of joint.needsReview) {
      expect(item.portfolio.reviewDates.length).toBeGreaterThan(0);
      expect(item.ptoDaysA).toBeLessThanOrEqual(7);
      expect(item.ptoDaysB).toBeLessThanOrEqual(7);
      expect(item.portfolio.travelSignal).toBe('not-used');
    }
  });

  it('excludes partner-only blocks pre-solver and never exposes an unfunded joint portfolio', () => {
    const start = '2027-04-01', end = '2027-08-31';
    const input: SolveInput = {
      rangeStart: start, rangeEnd: end, budget: 12,
      offDays: [], blackouts: [], w: 0, breakCount: 3,
    };
    const shared = {
      start, end,
      schedule: { kind: 'weekly' as const, weekly: [
        true, true, true, true, true, false, false,
      ] as [boolean, boolean, boolean, boolean, boolean, boolean, boolean] },
      employerOffDays: ['2027-05-31', '2027-07-05'],
      calendarPartial: false,
    };
    const a = buildIntegratedCalendarEvidence(shared, [])!;
    const b = buildIntegratedCalendarEvidence(shared, [])!;
    const available = selectJointFundedPortfolios(input, a, b, 12, 12)!;
    expect(available).not.toBeNull();
    expect(available.feasible.length + available.needsReview.length).toBeGreaterThan(0);
    for (const item of [...available.feasible, ...available.needsReview]) {
      expect(item.ptoDaysA).toBeLessThanOrEqual(12);
      expect(item.ptoDaysB).toBeLessThanOrEqual(12);
      expect(item.portfolio.travelSignal).toBe('not-used');
    }
    const allHard = buildIntegratedCalendarEvidence({
      ...shared, hardBlockDays: rangeISO(start, end),
    }, [])!;
    const blocked = selectJointFundedPortfolios(input, a, allHard, 12, 12)!;
    expect(blocked).not.toBeNull();
    expect(blocked.feasible).toEqual([]);
    expect(blocked.needsReview).toEqual([]);
    const unfundedPartner = selectJointFundedPortfolios(input, a, b, 12, 0)!;
    for (const item of [...unfundedPartner.feasible, ...unfundedPartner.needsReview])
      expect(item.ptoDaysB).toBe(0);
    expect(selectJointFundedPortfolios(input, a, b, 11, 12)).toBeNull();
    expect(selectJointFundedPortfolios({ ...input, budget: 12.5 }, a, b, 12.5, 12)).toBeNull();
  });
});
