// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useAppState } from '../ui/useAppState';
import { encodeEmployerCalendar } from '../personal/employerCalendar';
import { rangeISO } from '@daysoff/engine/solver/dateUtils';
import { defaultRangeEnd, planFromSearch, planStateFromSearch, type HolidaySource } from './planFromSearch';

const HOLIDAY_DIR = resolve(__dirname, '../../public/holidays');
const TODAY = '2026-11-04';

function readHolidayFile(country: string, year: number): unknown {
  const file = resolve(HOLIDAY_DIR, `${country}-${year}.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}
export const diskHolidays: HolidaySource = readHolidayFile;

/** The browser path: the engine fetches /holidays/<CC>-<YEAR>.json, then Nager. */
function stubFetchFromDisk() {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const match = /\/holidays\/([A-Z]{2})-(\d{4})\.json$/.exec(url);
    const data = match ? readHolidayFile(match[1], Number(match[2])) : null;
    return data ? new Response(JSON.stringify(data), { status: 200 }) : new Response('not found', { status: 404 });
  }));
}

const companyCalendar = encodeEmployerCalendar({
  version: 1, country: 'US', excluded: ['2027-07-05|Independence Day'], custom: [{ date: '2027-08-13', name: 'Summer, Friday; "office" closed' }],
});

const CASES: [string, string][] = [
  ['default link (no params)', ''],
  ['custom budget', '?c=US&s=2027-01-01&e=2027-12-31&b=25'],
  ['different country (GB, England)', '?c=GB&sd=GB-ENG&s=2027-01-01&e=2027-12-31&b=20'],
  ['GB without a region', '?c=GB&s=2027-01-01&e=2027-12-31&b=20'],
  ['German state holidays', '?c=DE&sd=DE-BY&s=2027-03-01&e=2027-10-31&b=12'],
  ['US state fallback table', '?c=US&sd=US-CA&s=2027-01-01&e=2027-12-31&b=15'],
  ['explicit start and end across a year', '?c=AU&s=2026-11-10&e=2027-06-30&b=14'],
  ['pinned and ruled-out days', '?c=US&s=2027-01-01&e=2027-06-30&b=10&p=2027-03-15,2027-03-16&r=2027-05-28&w=50&count=3'],
  ['reserve days, planning style v2', '?pv=2&ps=long-breaks&mb=5&c=US&s=2027-01-01&e=2027-12-31&b=20&rv=5'],
  ['accrual, expiry and carryover', '?c=CA&s=2027-01-01&e=2027-12-31&b=10&ac=1&am=1.5&ex=1&xd=2027-12-31&cc=5'],
  ['employer calendar in the link, blackouts, 4-day week', `?c=US&s=2027-01-01&e=2027-12-31&b=12&eh=${encodeURIComponent(companyCalendar)}&bo=2027-11-22,2027-11-23&ww=1111000`],
  ['9/80 Fridays and a peak cap', '?c=US&s=2027-01-01&e=2027-09-30&b=15&af=1&afs=2027-01-08&pc=1&pcs=2027-06-01&pce=2027-08-31&pcm=2'],
];

beforeEach(() => {
  localStorage.clear();
  delete (window as { __PTO_COUNTRY_PRESET__?: unknown }).__PTO_COUNTRY_PRESET__;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${TODAY}T12:00:00`));
  stubFetchFromDisk();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('planFromSearch matches the planner hook for the same link', () => {
  it.each(CASES)('%s', async (_label, search) => {
    window.history.replaceState(null, '', `/pto${search}`);
    const { result } = renderHook(() => useAppState());
    await waitFor(() => expect(result.current.holidaysReady).toBe(true), { timeout: 10_000 });

    const plan = planFromSearch(search, TODAY, diskHolidays);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const hook = result.current;
    expect(plan.solveInput).toEqual(hook.solveInput);
    expect(plan.holidayEntries).toEqual(hook.holidayEntries);
    expect(plan.breaks).toEqual(hook.breaks);
    expect(plan.breaks.length).toBeGreaterThan(0);
    const days = rangeISO(hook.rangeStart, hook.rangeEnd);
    expect(days.filter(plan.isPtoDay)).toEqual(days.filter(hook.isSuggestedPto));
    expect(plan.state.noticePeriodDays).toBe(hook.noticePeriodDays);

    // The hook's own plan query string reproduces the same plan through the feed path.
    const again = planFromSearch(hook.planSearch, TODAY, diskHolidays);
    expect(again.ok && again.breaks).toEqual(hook.breaks);
  }, 20_000);
});

describe('planStateFromSearch', () => {
  it('defaults the range from today the same way the planner does', () => {
    const state = planStateFromSearch('', TODAY);
    expect(state.rangeStart).toBe(TODAY);
    expect(state.rangeEnd).toBe(defaultRangeEnd(TODAY));
    expect(state.country).toBe('US');
    expect(state.noticePeriodDays).toBe(14);
    expect(state.reserveDays).toBe(3);
  });

  it('reads the notice period from the link', () => {
    expect(planStateFromSearch('?np=30', TODAY).noticePeriodDays).toBe(30);
  });
});

describe('planFromSearch rejects what the planner rejects', () => {
  it('a range over ten years', () => {
    const plan = planFromSearch('?s=2027-01-01&e=2040-01-01&b=10', TODAY, diskHolidays);
    expect(plan.ok).toBe(false);
  });

  it('an expiry outside the range', () => {
    const plan = planFromSearch('?s=2027-01-01&e=2027-06-30&b=10&ex=1&xd=2027-12-31', TODAY, diskHolidays);
    expect(plan.ok).toBe(false);
  });

  it('an invalid today', () => {
    expect(planFromSearch('', '2026-02-30', diskHolidays).ok).toBe(false);
  });

  it('treats a missing or malformed holiday file as no holidays, like a failed fetch', () => {
    const plan = planFromSearch('?c=US&s=2027-01-01&e=2027-12-31&b=10', TODAY, () => [{ nonsense: true }]);
    expect(plan.ok && plan.holidayEntries).toEqual([]);
  });
});
