import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import type { TimeOffPolicy } from '../policy/model';
import { createPtoRequest, type PtoRequest, type RequestStatus } from '../personal/requestLedger';
import { expirationRisks } from '../personal/expiration';
import { forecastWithRequests } from '../personal/forecast';
import { useAppState } from '../ui/useAppState';
import { publishBalanceBasis, readBrowserBalanceBasis } from '../ui/usePersonalWorkspace';
import { savePolicyPreferences } from '../personal/policyPreferences';

/**
 * Issue 1 / Issue 11 regressions: one request ledger change must move the planner,
 * the forecast and the expiry hand-off consistently, deducting each day once.
 */
const calendar = { workWeek: DEFAULT_WORK_WEEK, offDays: [] };
const today = '2027-11-01';
const request = (status: RequestStatus, start = '2027-11-15', end = '2027-11-17'): PtoRequest =>
  createPtoRequest({ start, end, status }, calendar, `r-${status}`, '2027-10-01T00:00:00.000Z')!;
const policy: TimeOffPolicy = {
  unit: 'days', hoursPerDay: 8, accrual: { kind: 'front-loaded', amount: 0, grantDate: '2027-01-01' },
  planYear: { kind: 'calendar' }, carryover: { mode: 'none' }, negativeBalanceAllowance: 0,
  payoutOnLeaving: 'not-sure', currentBalance: 10, balanceAsOf: today, plannedDays: [],
};

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
  window.history.replaceState(null, '', `/pto?c=US&s=${today}&e=2027-12-31&b=10&rv=0`);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('planner consumes tracked requests from the shared workspace rule', () => {
  it('approving a request reduces the planner budget once and blocks its dates', () => {
    const { result, rerender } = renderHook(({ requests }) => useAppState(requests, today), { initialProps: { requests: [] as PtoRequest[] } });
    expect(result.current.effectiveBudget).toBe(10);
    rerender({ requests: [request('approved')] });
    expect(result.current.solveInput.blackouts).toEqual(expect.arrayContaining(['2027-11-15', '2027-11-16', '2027-11-17']));
    expect(result.current.effectiveBudget).toBe(7);
    rerender({ requests: [request('canceled')] });
    expect(result.current.effectiveBudget).toBe(10);
    expect(result.current.solveInput.blackouts).not.toContain('2027-11-15');
  });

  it('does not recommend tentative request days again and labels their reserved cost', () => {
    const { result } = renderHook(() => useAppState([request('requested')], today));
    expect(result.current.solveInput.blackouts).toEqual(expect.arrayContaining(['2027-11-15', '2027-11-16', '2027-11-17']));
    expect(result.current.tentativePtoDays).toBe(3);
    expect(result.current.effectiveBudget).toBe(7);
  });

  it('does not subtract approved leave again when the balance already includes it', () => {
    const { result } = renderHook(() => useAppState([request('approved')], today, { includesApprovedLeave: true }));
    expect(result.current.effectiveBudget).toBe(10);
    expect(result.current.reserveApprovedPto).toBe(false);
    act(() => result.current.setReserveApprovedPto(true));
    expect(result.current.effectiveBudget).toBe(7);
  });
});

describe('expiry hand-off never deducts a request twice', () => {
  it('a balance that already includes approved leave is not reduced again', () => {
    const included = { ...policy, balanceIncludesApprovedLeave: true, currentBalance: 7 };
    const forecast = forecastWithRequests(included, '2027-12-31', [request('approved')])!;
    expect(forecast.confirmed.balance).toBe(7);
    const risk = expirationRisks(included, 'US', [request('approved')], today)[0];
    expect(risk).toMatchObject({ daysAtStake: 7, planningBudget: 7 });
    // The 7 days are available from today; reserving the approved days again delayed the window.
    expect(new URLSearchParams(risk.ptoHref.split('?')[1]).get('s')).toBe(today);
  });

  it('the planner opened from an expiry link spends exactly the at-risk budget', () => {
    for (const [requests, includes] of [[[request('approved')], false], [[request('approved')], true], [[request('requested')], false]] as const) {
      const scenario = includes ? { ...policy, balanceIncludesApprovedLeave: true, currentBalance: 7 } : policy;
      const risk = expirationRisks(scenario, 'US', requests, today)[0];
      expect(risk.planningBudget).toBe(7 + (requests[0].status === 'requested' ? 3 : 0));
      window.history.replaceState(null, '', risk.ptoHref);
      const { result, unmount } = renderHook(() => useAppState(requests, today, { includesApprovedLeave: includes }));
      expect(result.current.effectiveBudget).toBe(risk.planningBudget);
      unmount();
    }
  });
});

describe('one balance basis shared by My PTO and the planner', () => {
  it('reads My PTO\'s published setting, falling back to a legacy saved policy', () => {
    expect(readBrowserBalanceBasis()).toBe(false);
    savePolicyPreferences('c=US&cb=10&bao=2027-11-01&bap=1');
    expect(readBrowserBalanceBasis()).toBe(true);
    publishBalanceBasis(false);
    expect(readBrowserBalanceBasis()).toBe(false);
    expect(window.location.search).not.toContain('bap');
  });
});
