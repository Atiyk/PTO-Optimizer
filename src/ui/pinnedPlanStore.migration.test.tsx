import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import type { PlanSnapshot } from './useAppState';
import { PINNED_PLANS_STORAGE_KEY, usePinnedPlans } from './pinnedPlanStore';
import { readRetentionStatus, RETENTION_STORAGE_KEY } from '../personal/retentionStatus';
import { REQUEST_STORAGE_KEY, saveRequestLedger, createPtoRequest } from '../personal/requestLedger';
import { BACKUP_SUFFIX } from '../personal/storageRecord';

/**
 * P3: adding saved breaks and retention facts must never overwrite saved data. Older plans
 * (no breaks) keep every field; a store or ledger this version can't read is left byte for
 * byte; the request ledger keeps its one-time pre-revision backup.
 */
const OLD_PLAN = {
  country: 'US', planningVersion: 2, planningStyle: 'balanced', minimumBreakDays: 3,
  employerCalendar: { version: 1, country: 'US', excluded: [], custom: [] },
  rangeStart: '2027-01-01', rangeEnd: '2027-12-31', budget: 10, w: 30,
  letSolverDecide: false, manualBreakCount: 3, weekStartOverride: 'auto', accrualEnabled: false,
  accrualPerMonth: 1.25, expiryEnabled: false, expiryDate: '', carryoverCap: 0,
  overlapDays: [], blackouts: [], workWeek: DEFAULT_WORK_WEEK, forced: {}, altFridayEnabled: false, altFridayStart: '',
  reserveDays: 0, applyTrackedRequests: false, reserveApprovedPto: false, unlimitedPto: false, noticePeriodDays: 14,
  peakCapEnabled: false, peakCapStart: '', peakCapEnd: '', peakCapMaxDays: 5,
  summary: { budgetSpent: 10, totalDaysOff: 26, breakCountActual: 3, travelPercentile: null },
};
const NEW_PLAN: PlanSnapshot = {
  ...(OLD_PLAN as unknown as PlanSnapshot), subdivision: undefined, budget: 12,
  breaks: [{ start: '2027-05-29', end: '2027-06-06', totalDaysOff: 9, ptoCost: 4, ptoDates: ['2027-06-01', '2027-06-02', '2027-06-03', '2027-06-04'] }],
};

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });

describe('saved data migrations never overwrite (P3)', () => {
  it('keeps an older saved plan exactly when a new plan with breaks is added', () => {
    localStorage.setItem(PINNED_PLANS_STORAGE_KEY, JSON.stringify({ version: 1, plans: [{ id: 'old', snapshot: OLD_PLAN }] }));
    const hook = renderHook(() => usePinnedPlans());
    act(() => hook.result.current.addPinnedPlan(NEW_PLAN));
    const stored = JSON.parse(localStorage.getItem(PINNED_PLANS_STORAGE_KEY)!);
    expect(stored.version).toBe(1);
    expect(stored.plans).toHaveLength(2);
    expect(stored.plans[0]).toEqual({ id: 'old', snapshot: OLD_PLAN });
    expect(stored.plans[1].snapshot.breaks).toEqual(NEW_PLAN.breaks);
    expect(hook.result.current.pinnedPlans[1].breaks).toEqual(NEW_PLAN.breaks);
  });

  it('opens a plan whose saved breaks are malformed, without the breaks', () => {
    const odd = { ...NEW_PLAN, breaks: [{ start: '2027-06-06', end: '2027-05-29', totalDaysOff: 'x' }] };
    localStorage.setItem(PINNED_PLANS_STORAGE_KEY, JSON.stringify({ version: 1, plans: [{ id: 'odd', snapshot: odd }] }));
    const hook = renderHook(() => usePinnedPlans());
    expect(hook.result.current.pinnedPlans).toHaveLength(1);
    expect(hook.result.current.pinnedPlans[0].breaks).toBeUndefined();
    expect(hook.result.current.pinnedPlans[0].budget).toBe(12);
  });

  it('leaves a newer-version plan store byte for byte, even when a plan is saved this visit', () => {
    const future = JSON.stringify({ version: 2, plans: [{ id: 'f', snapshot: { anything: true } }] });
    localStorage.setItem(PINNED_PLANS_STORAGE_KEY, future);
    const hook = renderHook(() => usePinnedPlans());
    act(() => hook.result.current.addPinnedPlan(NEW_PLAN));
    expect(localStorage.getItem(PINNED_PLANS_STORAGE_KEY)).toBe(future);
    expect(hook.result.current.pinMessage).toMatch(/for this visit/);
    // A save that wasn't stored doesn't count as the first save either.
    expect(readRetentionStatus().firstSavedAt).toBeUndefined();
  });

  it('dates the first save and asks for persistent storage once, after a stored save', async () => {
    const persist = vi.fn(async () => true);
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { storage: { persist, persisted: async () => false } }));
    const hook = renderHook(() => usePinnedPlans());
    await act(async () => { hook.result.current.addPinnedPlan(NEW_PLAN); });
    await act(async () => { hook.result.current.addPinnedPlan({ ...NEW_PLAN, budget: 14 }); });
    expect(readRetentionStatus().firstSavedAt).toBeTruthy();
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('does not touch an unreadable retention record when saving', () => {
    localStorage.setItem(RETENTION_STORAGE_KEY, '{"version":9}');
    const hook = renderHook(() => usePinnedPlans());
    act(() => hook.result.current.addPinnedPlan(NEW_PLAN));
    expect(localStorage.getItem(RETENTION_STORAGE_KEY)).toBe('{"version":9}');
    expect(JSON.parse(localStorage.getItem(PINNED_PLANS_STORAGE_KEY)!).plans).toHaveLength(1);
  });

  it('keeps a pre-revision request ledger as a backup before the first versioned write', () => {
    const request = createPtoRequest({ start: '2027-03-22', end: '2027-03-26', status: 'planned' }, { workWeek: DEFAULT_WORK_WEEK, offDays: [] }, 'r1')!;
    const legacy = JSON.stringify({ version: 1, requests: [request] });
    localStorage.setItem(REQUEST_STORAGE_KEY, legacy);
    expect(saveRequestLedger([{ ...request, status: 'requested' }], localStorage).status).toBe('saved');
    expect(JSON.parse(localStorage.getItem(REQUEST_STORAGE_KEY + BACKUP_SUFFIX)!).raw).toBe(legacy);
  });
});
