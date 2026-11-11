import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import type { PlanSnapshot } from './useAppState';
import { PINNED_PLANS_STORAGE_KEY, usePinnedPlans } from './pinnedPlanStore';

const snapshot = {
  country: 'US', subdivision: undefined, planningVersion: 2, planningStyle: 'custom', minimumBreakDays: 3,
  employerCalendar: { version: 1, country: 'US', excluded: [], custom: [{ date: '2027-05-17', name: 'Private closure' }] },
  rangeStart: '2027-01-01', rangeEnd: '2027-12-31', budget: 10, w: 25,
  letSolverDecide: false, manualBreakCount: 3, weekStartOverride: 'auto', accrualEnabled: false,
  accrualPerMonth: 1.25, expiryEnabled: false, expiryDate: '', carryoverCap: 0,
  overlapDays: ['2027-06-08'], blackouts: ['2027-06-09'], workWeek: DEFAULT_WORK_WEEK,
  forced: { '2027-06-10': 'include' }, altFridayEnabled: false, altFridayStart: '',
  reserveDays: 3, applyTrackedRequests: true, reserveApprovedPto: false, unlimitedPto: false, noticePeriodDays: 21,
  peakCapEnabled: false, peakCapStart: '', peakCapEnd: '', peakCapMaxDays: 5,
  summary: { budgetSpent: 7, totalDaysOff: 23, breakCountActual: 3, travelPercentile: null },
} satisfies PlanSnapshot & { noticePeriodDays: number };

beforeEach(() => window.localStorage.clear());
afterEach(() => { cleanup(); window.localStorage.clear(); });

describe('browser pinned plans', () => {
  it('resumes all inputs after remount, shares changes with mounted readers, and retains the two-pin cap', () => {
    const first = renderHook(() => usePinnedPlans());
    const reader = renderHook(() => usePinnedPlans());
    act(() => first.result.current.addPinnedPlan(snapshot));
    expect(first.result.current.pinMessage).toBe('Plan saved in this browser.');
    expect(reader.result.current.pinnedPlans).toEqual([snapshot]);
    expect(window.location.href).not.toContain('Private closure');
    first.unmount();

    const resumed = renderHook(() => usePinnedPlans());
    expect(resumed.result.current.pinnedPlans).toEqual([snapshot]);
    act(() => resumed.result.current.addPinnedPlan({ ...snapshot, budget: 15 }));
    act(() => resumed.result.current.addPinnedPlan({ ...snapshot, budget: 25 }));
    expect(resumed.result.current.pinnedPlans.map(plan => plan.budget)).toEqual([10, 15]);
    act(() => reader.result.current.removePinnedPlan(0));
    expect(resumed.result.current.pinnedPlans.map(plan => plan.budget)).toEqual([15]);
  });

  it('defaults a stored plan without a notice period and leaves an unrecognized store intact', () => {
    const { noticePeriodDays: _noticePeriodDays, ...oldSnapshot } = snapshot;
    window.localStorage.setItem(PINNED_PLANS_STORAGE_KEY, JSON.stringify({ version: 1, plans: [{ id: 'legacy', snapshot: oldSnapshot }] }));
    const first = renderHook(() => usePinnedPlans());
    expect(first.result.current.pinnedPlans[0]).toMatchObject({ noticePeriodDays: 14, budget: 10 });
    first.unmount();

    const unknown = JSON.stringify({ version: 2, plans: [] });
    window.localStorage.setItem(PINNED_PLANS_STORAGE_KEY, unknown);
    const fallback = renderHook(() => usePinnedPlans());
    act(() => fallback.result.current.addPinnedPlan(snapshot));
    expect(fallback.result.current.pinnedPlans).toEqual([snapshot]);
    expect(fallback.result.current.pinMessage).toMatch(/for this visit/);
    expect(window.localStorage.getItem(PINNED_PLANS_STORAGE_KEY)).toBe(unknown);
  });
});
