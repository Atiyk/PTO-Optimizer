import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { Holiday, HolidayFetchResult } from '@daysoff/engine/data/holidays';
import { DEFAULT_WORK_WEEK, type WorkWeek } from '@daysoff/engine/solver/types';
import { defaultEmployerCalendar, saveEmployerCalendar } from '../personal/employerCalendar';
import { requestPtoDates } from '../personal/requestLedger';
import { useRequestCalendar, type RequestCalendarOptions } from './useRequestCalendar';

const source = vi.hoisted(() => ({ holidays: vi.fn(), subdivisions: vi.fn() }));
vi.mock('@daysoff/engine/data/holidays', async (original) => ({
  ...await original<typeof import('@daysoff/engine/data/holidays')>(),
  getHolidaysWithStatus: source.holidays,
  getSubdivisionCandidates: source.subdivisions,
}));

const newYear: Holiday = { date: '2027-01-01', nominalDate: '2027-01-01', name: 'New Year', countryCode: 'US', counties: null };
const goodFriday: Holiday = { date: '2027-03-26', nominalDate: '2027-03-26', name: 'Good Friday', countryCode: 'US', counties: ['US-CA'] };
const options: RequestCalendarOptions = { country: 'US', rangeStart: '2027-01-01', rangeEnd: '2027-04-30', workWeek: DEFAULT_WORK_WEEK };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  localStorage.clear();
  source.holidays.mockReset().mockResolvedValue({ holidays: [newYear, goodFriday], degraded: false });
  source.subdivisions.mockReset().mockResolvedValue([goodFriday]);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('personal request calendar', () => {
  it('waits for its own scope and applies national holidays without regional defaults leaking in', async () => {
    const { result } = renderHook(() => useRequestCalendar(options));
    expect(result.current.loading).toBe(true);
    expect(result.current.calendar.offDays).toEqual([]);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.degraded).toBe(false);
    expect(result.current.calendar.offDays).toEqual(['2027-01-01']);
    expect(result.current.calendar.rangeStart).toBe(options.rangeStart);
    expect(result.current.calendar.rangeEnd).toBe(options.rangeEnd);
    expect(result.current.subdivisions).toContain('US-CA');
    expect(result.current.subdivisions).toContain('US-MA');
    expect(source.holidays).toHaveBeenCalledWith('US', options.rangeStart, options.rangeEnd, undefined);
  });

  it('applies country-and-region preferences, custom days and US regional fallback without writing storage', async () => {
    saveEmployerCalendar({ ...defaultEmployerCalendar('US'), excluded: ['2027-01-01|New Year'], custom: [{ date: '2027-01-07', name: 'Country company day' }] });
    saveEmployerCalendar({ ...defaultEmployerCalendar('US', 'US-CA'), excluded: ['2027-01-01|New Year'], custom: [{ date: '2027-01-08', name: 'Regional company day' }] });
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const { result, rerender } = renderHook((props: RequestCalendarOptions) => useRequestCalendar(props), { initialProps: { ...options, subdivision: 'US-CA' } as RequestCalendarOptions });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.calendar.offDays).toEqual(['2027-01-08', '2027-03-26', '2027-03-31']);
    rerender(options);
    expect(result.current.loading).toBe(true);
    expect(result.current.calendar.offDays).toEqual([]);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.calendar.offDays).toEqual(['2027-01-07']);
    expect(write).not.toHaveBeenCalled();
  });

  it('respects date-and-name exclusions, custom exclusions and duplicate observed dates', async () => {
    source.holidays.mockResolvedValue({ holidays: [newYear, { ...newYear, name: 'Another holiday' }], degraded: false });
    saveEmployerCalendar({ ...defaultEmployerCalendar('US'), excluded: ['2027-01-01|New Year', '2027-01-02|Unobserved company day'], custom: [{ date: '2027-01-01', name: 'Company holiday' }, { date: '2027-01-02', name: 'Unobserved company day' }] });
    const { result } = renderHook(() => useRequestCalendar(options));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.calendar.offDays).toEqual(['2027-01-01']);
  });

  it('prices requests using a custom workweek and alternating Fridays, including anchors outside the range', async () => {
    const workWeek: WorkWeek = [false, true, true, true, true, false, true];
    const { result } = renderHook(() => useRequestCalendar({ ...options, rangeEnd: '2027-01-31', workWeek, altFridayStart: '2026-12-18' }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.calendar.workWeek).toEqual(workWeek);
    expect(result.current.calendar.offDays).toEqual(['2027-01-01', '2027-01-15', '2027-01-29']);
    expect(requestPtoDates('2027-01-01', '2027-01-03', result.current.calendar)).toEqual(['2027-01-03']);
  });

  it('ignores late asynchronous results from a previous country and region', async () => {
    const first = deferred<HolidayFetchResult>();
    const second = deferred<HolidayFetchResult>();
    source.holidays.mockImplementation((country: string) => country === 'US' ? first.promise : second.promise);
    source.subdivisions.mockImplementation(async (country: string) => country === 'US' ? [goodFriday] : [{ ...newYear, countryCode: 'GB', counties: ['GB-ENG'] }]);
    const { result, rerender } = renderHook((props: RequestCalendarOptions) => useRequestCalendar(props), { initialProps: { ...options, subdivision: 'US-CA' } });
    rerender({ ...options, country: 'GB', subdivision: 'GB-ENG' });
    expect(result.current.loading).toBe(true);
    expect(result.current.calendar.offDays).toEqual([]);
    await act(async () => { second.resolve({ holidays: [{ ...newYear, date: '2027-01-04', countryCode: 'GB' }], degraded: false }); });
    expect(result.current.calendar.offDays).toEqual(['2027-01-04']);
    expect(result.current.subdivisions).toEqual(['GB-ENG']);
    await act(async () => { first.resolve({ holidays: [newYear, goodFriday], degraded: true }); });
    expect(result.current.loading).toBe(false);
    expect(result.current.degraded).toBe(false);
    expect(result.current.calendar.offDays).toEqual(['2027-01-04']);
    expect(result.current.subdivisions).toEqual(['GB-ENG']);
  });

  it('clears a loaded scope immediately when dates change until the new scope finishes', async () => {
    const { result, rerender } = renderHook((props: RequestCalendarOptions) => useRequestCalendar(props), { initialProps: options });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const pending = deferred<HolidayFetchResult>();
    source.holidays.mockReturnValue(pending.promise);
    rerender({ ...options, rangeStart: '2027-05-01', rangeEnd: '2027-05-31' });
    expect(result.current.loading).toBe(true);
    expect(result.current.calendar.offDays).toEqual([]);
    expect(result.current.subdivisions).toEqual([]);
    expect(result.current.calendar.rangeStart).toBe('2027-05-01');
    await act(async () => { pending.resolve({ holidays: [], degraded: false }); });
    expect(result.current.loading).toBe(false);
    expect(result.current.calendar.offDays).toEqual([]);
  });

  it('keeps public holidays available when browser preferences cannot be read', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('storage disabled'); });
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const { result } = renderHook(() => useRequestCalendar(options));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.calendar.offDays).toEqual(['2027-01-01']);
    expect(result.current.degraded).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });

  it('reports partial or rejected holiday loading while retaining known safe data', async () => {
    source.holidays.mockResolvedValue({ holidays: [newYear], degraded: true });
    source.subdivisions.mockRejectedValue(new Error('discovery unavailable'));
    const { result } = renderHook(() => useRequestCalendar({ ...options, subdivision: 'US-CA' }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.degraded).toBe(true);
    expect(result.current.calendar.offDays).toEqual(['2027-01-01', '2027-03-31']);
  });

  it('loads a New Year observed on December 31 from the next nominal year and charges it only once', async () => {
    source.holidays.mockImplementation(async (_country: string, _start: string, end: string) => ({
      holidays: end === '2028-01-01' ? [
        { ...newYear, date: '2027-12-31', nominalDate: '2028-01-01' },
        { ...newYear, date: '2027-12-31', nominalDate: '2028-01-01' },
      ] : [], degraded: false,
    }));
    const { result } = renderHook(() => useRequestCalendar({ ...options, rangeStart: '2027-12-01', rangeEnd: '2027-12-31' }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.calendar.offDays).toEqual(['2027-12-31']);
    expect(requestPtoDates('2027-12-31', '2027-12-31', result.current.calendar)).toEqual([]);
  });

  it.each([
    { ...options, rangeStart: '2027-02-30' },
    { ...options, rangeEnd: '2037-01-02' },
    { ...options, rangeStart: '2027-05-01' },
    { ...options, country: 'invalid' },
    { ...options, subdivision: 'GB-ENG' },
    { ...options, subdivision: 'US-' },
    { ...options, altFridayStart: '2027-02-30' },
    { ...options, workWeek: [] as unknown as WorkWeek },
  ])('fails closed for invalid or excessive inputs without fetching: %o', (invalid) => {
    const { result } = renderHook(() => useRequestCalendar(invalid));
    expect(result.current.loading).toBe(false);
    expect(result.current.degraded).toBe(true);
    expect(result.current.calendar.offDays).toEqual([]);
    expect(result.current.calendar.rangeStart).toBe('');
    expect(result.current.calendar.rangeEnd).toBe('');
    expect(source.holidays).not.toHaveBeenCalled();
    expect(source.subdivisions).not.toHaveBeenCalled();
  });
});
