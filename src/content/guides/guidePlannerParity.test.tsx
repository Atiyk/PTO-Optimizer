import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import { rawHolidaysToHolidays } from '@daysoff/engine/data/holidays';
import { planFromSearch } from '../../autopilot/planFromSearch';
import { useAppState } from '../../ui/useAppState';
import { GUIDE_HOLIDAY_FILES, guideHolidaySource } from './guideHolidays';
import { computeGuidePlan } from './guidePlan';
import { GUIDES } from './guides2027';

/**
 * Every plan a guide page prints must be the plan /pto opens from that page's link: same
 * breaks, same PTO days charged, same total. Checked twice, through the planner hook a
 * visitor's browser runs and through planFromSearch (the pure /pto feed).
 */
function preloadFor(country: string, years: number[]) {
  const raw = years.flatMap((year) => (GUIDE_HOLIDAY_FILES[`${country}-${year}`] as unknown[]) ?? []);
  window.__PTO_PRELOADED_HOLIDAYS__ = { [country]: rawHolidaysToHolidays(raw as Parameters<typeof rawHolidaysToHolidays>[0]) };
  window.__PTO_PRELOADED_HOLIDAY_YEARS__ = { [country]: years };
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete window.__PTO_PRELOADED_HOLIDAYS__;
  delete window.__PTO_PRELOADED_HOLIDAY_YEARS__;
  window.history.replaceState(null, '', '/');
});

const cases = GUIDES.flatMap((guide) => guide.plans.map((spec) => ({ guide, spec })));

describe('guide plans reproduce on /pto', () => {
  it('covers every plan on every guide page', () => {
    expect(cases.length).toBeGreaterThanOrEqual(GUIDES.length);
  });

  it.each(cases.map(({ guide, spec }) => [`${guide.path} ${spec.id}`, guide, spec] as const))('%s', (_label, guide, spec) => {
    const plan = computeGuidePlan(guide, spec);
    expect(plan.breaks.length).toBeGreaterThan(0);
    preloadFor(guide.country, [guide.year, guide.year + 1]);
    window.history.replaceState(null, '', plan.href);
    const { result } = renderHook(() => useAppState());
    const state = result.current;
    expect(state.planningPending).toBe(false);
    expect(state.breaks.map((b) => [b.start, b.end, b.ptoCost, b.totalDaysOff]))
      .toEqual(plan.breaks.map((b) => [b.start, b.end, b.ptoCost, b.totalDaysOff]));
    expect(state.budgetSpent).toBe(plan.ptoUsed);
    expect(state.breaks.flatMap((b) => b.days.filter(state.isSuggestedPto))).toEqual(plan.breaks.flatMap((b) => b.ptoDays));
    expect(state.breaks.reduce((sum, b) => sum + b.totalDaysOff, 0)).toBe(plan.daysOff);
    expect([...state.effectiveOffDays].sort()).toEqual(expect.arrayContaining(plan.holidays.map((h) => h.date)));

    const feed = planFromSearch(new URL(plan.href, 'https://x.invalid').search, '2026-11-22', guideHolidaySource);
    expect(feed.ok).toBe(true);
    if (feed.ok) expect(feed.breaks.map((b) => [b.start, b.end, b.ptoCost])).toEqual(plan.breaks.map((b) => [b.start, b.end, b.ptoCost]));
  });
});

describe('computeLandingPlanWith', () => {
  it('with no options is the homepage preview plan', async () => {
    const { computeLandingPlan, computeLandingPlanWith } = await import('../../ui/landingState');
    const { guideHolidayList } = await import('./guidePlan');
    const state = { country: 'US', budget: 15, rangeStart: '2027-01-01', rangeEnd: '2027-12-31' };
    const holidays = guideHolidayList({ year: 2027, country: 'US' });
    expect(computeLandingPlanWith(state, holidays).result.primary).toEqual(computeLandingPlan(state, holidays).result.primary);
  });
});
