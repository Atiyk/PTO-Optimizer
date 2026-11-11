import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { rawHolidaysToHolidays } from '@daysoff/engine/data/holidays';
import { requestByText } from '@daysoff/engine/calendar/requestDeadline';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import { createPtoRequest } from '../personal/requestLedger';
import { readEmployerCalendar } from '../personal/employerCalendar';
import { landingObservedHolidays, useLandingHolidays } from './landingCalendar';
import { computeLandingPlan, landingHolidayHref, landingPlanHref } from './landingState';
import { buildPublicPlanLink } from './publicSharePrivacy';
import { useAppState } from './useAppState';
import { formatManagerEmailDetailed, formatWorkingDaysList } from './requestText';
import { generateICS } from './icsExport';
import us2026 from '../../public/holidays/US-2026.json';
import us2027 from '../../public/holidays/US-2027.json';

const scenario = { country: 'US', budget: 15, rangeStart: '2026-11-02', rangeEnd: '2027-11-01' };
const years = [2026, 2027];
const records = [us2026, us2027];
const preload = rawHolidaysToHolidays(records.flat());
const totalDays = (breaks: { totalDaysOff: number }[]) => breaks.reduce((total, brk) => total + brk.totalDaysOff, 0);
const viewPreview = () => renderHook(() => {
  const { country, rangeStart, rangeEnd } = scenario;
  const { holidays, loading } = useLandingHolidays(country, rangeStart, rangeEnd, true);
  const observed = landingObservedHolidays(holidays, readEmployerCalendar(country), rangeStart, rangeEnd);
  return loading ? undefined : computeLandingPlan(scenario, observed).result;
});

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
  window.__PTO_PRELOADED_HOLIDAYS__ = { US: preload };
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete window.__PTO_PRELOADED_HOLIDAYS__;
  delete window.__PTO_PRELOADED_HOLIDAY_YEARS__;
  window.history.replaceState(null, '', '/');
});

describe('landing preview and planner result', () => {
  it('keeps the 31-day national result through first render, refresh and public share', async () => {
    window.__PTO_PRELOADED_HOLIDAY_YEARS__ = { US: years };
    const preview = viewPreview();
    const expected = preview.result.current!;
    expect(totalDays(expected.primary)).toBe(31);
    const leakedRegionalHolidays = preload.filter(({ date }) => date >= scenario.rangeStart && date <= scenario.rangeEnd);
    expect(totalDays(computeLandingPlan(scenario, leakedRegionalHolidays).result.primary)).toBe(32);
    preview.unmount();

    const start = landingPlanHref(scenario);
    window.history.replaceState(null, '', start);
    const planner = renderHook(() => useAppState());
    expect(planner.result.current.planningPending).toBe(false);
    expect(planner.result.current.breaks).toEqual(expected.primary);
    expect(planner.result.current.budgetSpent).toBe(15);
    expect(planner.result.current.effectiveOffDays).not.toContain('2027-02-12');
    const copied = buildPublicPlanLink(window.location.href, planner.result.current.planSearch).url;
    planner.unmount();

    const refreshed = renderHook(() => useAppState());
    expect(refreshed.result.current.breaks).toEqual(expected.primary);
    refreshed.unmount();

    const share = new URL(copied);
    expect(share.searchParams.has('lp')).toBe(false);
    window.history.replaceState(null, '', share.pathname + share.search);
    const recipient = renderHook(() => useAppState());
    expect(recipient.result.current.breaks).toEqual(expected.primary);
  });

  it('holds both views until slow holiday data covers the complete selected range', async () => {
    window.__PTO_PRELOADED_HOLIDAY_YEARS__ = { US: [2026] };
    let releaseLoads!: () => void;
    const loads = new Promise<void>(resolve => { releaseLoads = resolve; });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      await loads;
      const index = years.indexOf(Number(/US-(\d+)\.json$/.exec(url)?.[1]));
      return new Response(JSON.stringify(records[index]), { status: index < 0 ? 404 : 200 });
    }));
    const preview = viewPreview();
    expect(preview.result.current).toBeUndefined();
    window.history.replaceState(null, '', landingPlanHref(scenario));
    const planner = renderHook(() => useAppState());
    expect(planner.result.current.planningPending).toBe(true);
    expect(planner.result.current.breaks).toEqual([]);

    await act(async () => { releaseLoads(); });
    await waitFor(() => expect(planner.result.current.planningPending).toBe(false));
    expect(totalDays(planner.result.current.breaks)).toBe(31);
    expect(planner.result.current.breaks).toEqual(preview.result.current?.primary);
    expect(planner.result.current.holidaysReady).toBe(true);
  });

  it('restores a holiday focus locally while allowing the visitor to opt in to tracked requests', () => {
    window.__PTO_PRELOADED_HOLIDAY_YEARS__ = { US: years };
    const focus = '2026-11-26';
    const bridge = '2026-11-27';
    const tracked = createPtoRequest({ start: '2027-01-15', end: '2027-01-15', status: 'approved' }, { workWeek: DEFAULT_WORK_WEEK, offDays: [] }, 'tracked')!;
    window.history.replaceState(null, '', landingHolidayHref(scenario, focus, bridge));
    const first = renderHook(() => useAppState([tracked], scenario.rangeStart));
    expect(first.result.current.holidayFocusDate).toBe(focus);
    expect(first.result.current.holidayFocusRun).toEqual({ start: '2026-11-26', end: '2026-11-29', length: 4 });
    expect(first.result.current.forced[bridge]).toBe('include');
    expect(first.result.current.solveInput.blackouts).not.toContain(tracked.start);
    expect(new URLSearchParams(window.location.search).has('hd')).toBe(false);
    act(() => first.result.current.setApplyTrackedRequests(true));
    expect(first.result.current.solveInput.blackouts).toContain(tracked.start);
    first.unmount();

    const refreshed = renderHook(() => useAppState([tracked], scenario.rangeStart));
    expect(refreshed.result.current.holidayFocusDate).toBe(focus);
    expect(refreshed.result.current.solveInput.blackouts).toContain(tracked.start);
    expect(new URL(buildPublicPlanLink(window.location.href, refreshed.result.current.planSearch).url).searchParams.has('hd')).toBe(false);
  });

  it('restores a locally pinned plan with its request notice after reload', async () => {
    window.__PTO_PRELOADED_HOLIDAY_YEARS__ = { US: years };
    window.history.replaceState(null, '', `${landingPlanHref(scenario)}&np=11`);
    const first = renderHook(() => useAppState());
    const breaks = first.result.current.breaks;
    act(() => first.result.current.pinPlan());
    await waitFor(() => expect(first.result.current.pinnedPlans).toHaveLength(1));
    expect(first.result.current.pinMessage).toBe('Plan saved in this browser.');
    first.unmount();

    const refreshed = renderHook(() => useAppState());
    expect(refreshed.result.current.pinnedPlans).toHaveLength(1);
    act(() => refreshed.result.current.setNoticePeriodDays(5));
    act(() => refreshed.result.current.restorePlan(0));
    expect(refreshed.result.current.noticePeriodDays).toBe(11);
    expect(refreshed.result.current.breaks).toEqual(breaks);
    act(() => refreshed.result.current.removePinnedPlan(0));
    await waitFor(() => expect(refreshed.result.current.pinnedPlans).toHaveLength(0));
  });

  it('uses the same chargeable PTO dates and shifted request deadline across a card, draft and calendar export', () => {
    window.history.replaceState(null, '', '/pto?c=US&s=2026-11-12&e=2026-11-18&b=1&rv=0&pv=2&ps=custom&count=1&np=5&sv=1&ho=2026-11-13&p=2026-11-13');
    const { result } = renderHook(() => useAppState());
    const state = result.current;
    const brk = state.breaks[0];
    expect(brk.start).toBe('2026-11-12');
    expect(brk.days).toContain('2026-11-13');
    expect(brk.days.filter(state.isSuggestedPto)).toHaveLength(brk.ptoCost);
    expect(state.isSuggestedPto('2026-11-13')).toBe(false);
    expect(formatWorkingDaysList(brk, state.isSuggestedPto)).not.toContain('Fri Nov 13');

    const today = '2026-11-01';
    expect(requestByText(brk.start, state.noticePeriodDays, state.workWeek, today, state.effectiveOffDays)).toContain('Friday');
    const draft = formatManagerEmailDetailed(brk, state.isSuggestedPto, state.noticePeriodDays, state.workWeek, state.effectiveOffDays);
    expect(draft).toContain('confirm this by Nov 6');
    const ics = generateICS([brk], state.isSuggestedPto, new Date(2026, 10, 1, 12), {
      enabled: true, leadDays: state.noticePeriodDays, workWeek: state.workWeek, offDays: state.effectiveOffDays,
    });
    expect(ics).toContain('DTSTART;VALUE=DATE:20261106');
    expect(ics).not.toContain('DTSTART;VALUE=DATE:20261113');
  });
});
