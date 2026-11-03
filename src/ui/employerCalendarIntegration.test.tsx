import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { useAppState } from './useAppState';
import { App } from './App';
import {
  defaultEmployerCalendar,
  EMPLOYER_STORAGE_PREFIX,
  encodeEmployerCalendar,
  saveEmployerCalendar,
} from '../personal/employerCalendar';
import type { Holiday } from '@daysoff/engine/data/holidays';

vi.mock('@daysoff/engine/data/holidays', () => {
  const holidays = (country: string): Holiday[] => [{
    date: country === 'GB' ? '2027-12-27' : '2027-12-24',
    nominalDate: '2027-12-25',
    name: 'Christmas Day',
    countryCode: country,
    counties: null,
  }];
  return {
    getPreloadedHolidays: (country: string) => holidays(country),
    getHolidaysWithStatus: async (country: string) => ({ holidays: holidays(country), degraded: false }),
    getHolidays: async (country: string) => holidays(country),
    getSubdivisionCandidates: async () => [],
  };
});

const defaultSearch = '?c=US&s=2027-12-20&e=2027-12-31&b=4&rv=0&w=0&count=0';

function navigate(search = defaultSearch) {
  window.history.replaceState(null, '', `/pto${search}`);
}

beforeEach(() => {
  localStorage.clear();
  delete window.__PTO_COUNTRY_PRESET__;
  navigate();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('employer calendar integrated with the live consumer state', () => {
  it('deselects and restores an observed holiday, changing the pinned day actual PTO cost', async () => {
    navigate('?c=US&s=2027-12-24&e=2027-12-24&b=1&rv=0&w=0&p=2027-12-24');
    const { result } = renderHook(() => useAppState());
    await waitFor(() => expect(result.current.holidayEntries).toHaveLength(1));
    expect(result.current.effectiveOffDays).toContain('2027-12-24');
    expect(result.current.budgetSpent).toBe(0);

    act(() => result.current.toggleHoliday('2027-12-24', 'Christmas Day'));
    expect(result.current.holidayEntries[0].checked).toBe(false);
    expect(result.current.effectiveOffDays).not.toContain('2027-12-24');
    expect(result.current.budgetSpent).toBe(1);

    act(() => result.current.toggleHoliday('2027-12-24', 'Christmas Day'));
    expect(result.current.holidayEntries[0].checked).toBe(true);
    expect(result.current.effectiveOffDays).toContain('2027-12-24');
    expect(result.current.budgetSpent).toBe(0);
  });

  it('saves a live edit and restores it on a new visit with no explicit holiday URL', async () => {
    const first = renderHook(() => useAppState());
    await waitFor(() => expect(first.result.current.holidayEntries).toHaveLength(1));
    act(() => first.result.current.toggleHoliday('2027-12-24', 'Christmas Day'));
    act(() => first.result.current.saveEmployerHolidays());
    expect(first.result.current.employerCalendarMessage).toContain('saved in this browser');
    first.unmount();

    navigate(); // Strip the generated share parameter to exercise saved-preference fallback.
    const second = renderHook(() => useAppState());
    await waitFor(() => expect(second.result.current.holidayEntries[0]?.checked).toBe(false));
    expect(second.result.current.effectiveOffDays).not.toContain('2027-12-24');
  });

  it('explicit shared defaults outrank recipient saved exclusions without overwriting them', async () => {
    const saved = { ...defaultEmployerCalendar('US'), excluded: ['2027-12-24|Christmas Day'] };
    expect(saveEmployerCalendar(saved)).toBe(true);
    const key = `${EMPLOYER_STORAGE_PREFIX}US:`;
    const originalStoredValue = localStorage.getItem(key);
    const params = new URLSearchParams(defaultSearch);
    params.set('eh', encodeEmployerCalendar(defaultEmployerCalendar('US')));
    navigate(`?${params}`);

    const { result } = renderHook(() => useAppState());
    await waitFor(() => expect(result.current.holidayEntries[0]?.checked).toBe(true));
    expect(result.current.effectiveOffDays).toContain('2027-12-24');
    expect(localStorage.getItem(key)).toBe(originalStoredValue);
    act(() => result.current.addCustomHoliday('2027-12-28', 'Shared-plan edit'));
    expect(localStorage.getItem(key)).toBe(originalStoredValue);
  });

  it('switches countries independently and restores each country calendar on return', async () => {
    const british = {
      ...defaultEmployerCalendar('GB'),
      excluded: ['2027-12-27|Christmas Day'],
      custom: [{ date: '2027-12-28', name: 'Winter closure' }],
    };
    expect(saveEmployerCalendar(british)).toBe(true);
    const { result } = renderHook(() => useAppState());
    await waitFor(() => expect(result.current.holidayEntries[0]?.date).toBe('2027-12-24'));
    act(() => result.current.setCountry('GB'));
    await waitFor(() => expect(result.current.holidayEntries.some((holiday) => holiday.date === '2027-12-27')).toBe(true));
    expect(result.current.employerCalendar).toEqual(british);
    expect(result.current.effectiveOffDays).not.toContain('2027-12-27');
    expect(result.current.effectiveOffDays).toContain('2027-12-28');

    act(() => result.current.setCountry('US'));
    await waitFor(() => expect(result.current.holidayEntries[0]?.date).toBe('2027-12-24'));
    expect(result.current.employerCalendar).toEqual(defaultEmployerCalendar('US'));
    expect(result.current.effectiveOffDays).not.toContain('2027-12-28');
    expect(result.current.effectiveOffDays).toContain('2027-12-24');
  });

  it('scopes saved calendars by subdivision without silently copying another region', () => {
    const newYork = { ...defaultEmployerCalendar('US', 'US-NY'), excluded: ['2027-12-24|Christmas Day'] };
    expect(saveEmployerCalendar(newYork)).toBe(true);
    navigate(`${defaultSearch}&sd=US-NY`);
    const { result } = renderHook(() => useAppState());
    expect(result.current.employerCalendar).toEqual(newYork);
    act(() => result.current.setSubdivision('US-CA'));
    expect(result.current.employerCalendar).toEqual(defaultEmployerCalendar('US', 'US-CA'));
    act(() => result.current.setSubdivision('US-NY'));
    expect(result.current.employerCalendar).toEqual(newYork);
  });

  it('deduplicates a date when two holiday names or repeated custom edits share it', async () => {
    const { result } = renderHook(() => useAppState());
    await waitFor(() => expect(result.current.holidayEntries).toHaveLength(1));
    act(() => result.current.addCustomHoliday('2027-12-24', 'Company closure'));
    act(() => result.current.addCustomHoliday('2027-12-24', 'Company closure'));
    expect(result.current.holidayEntries.filter((holiday) => holiday.date === '2027-12-24')).toHaveLength(2);
    expect(result.current.effectiveOffDays.filter((date) => date === '2027-12-24')).toHaveLength(1);
    act(() => result.current.toggleHoliday('2027-12-24', 'Christmas Day'));
    expect(result.current.effectiveOffDays).toContain('2027-12-24');
    act(() => result.current.removeHoliday('2027-12-24', 'Company closure'));
    expect(result.current.effectiveOffDays).not.toContain('2027-12-24');
    act(() => result.current.resetEmployerHolidays());
    expect(result.current.employerCalendar).toEqual(defaultEmployerCalendar('US'));
    expect(result.current.effectiveOffDays).toContain('2027-12-24');
  });

  it('keeps live edits and URL reproducibility when browser storage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('disabled'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('disabled'); });
    const { result } = renderHook(() => useAppState());
    await waitFor(() => expect(result.current.holidayEntries).toHaveLength(1));
    act(() => result.current.toggleHoliday('2027-12-24', 'Christmas Day'));
    act(() => result.current.saveEmployerHolidays());
    expect(result.current.effectiveOffDays).not.toContain('2027-12-24');
    expect(result.current.employerCalendarMessage).toContain('storage is unavailable');
    expect(new URLSearchParams(window.location.search).has('eh')).toBe(true);
  });
});


it('rejects an unbounded planning link before building calendar derived data', () => {
  navigate('?c=US&sd=US-CA&s=0100-01-01&e=9999-12-31&b=15&af=1&afs=2027-01-01');
  const { result } = renderHook(() => useAppState());
  expect(result.current.validationIssues).toContain('Choose a planning window of ten years or less.');
  expect(result.current.offRuns).toEqual([]);
  expect(result.current.allDaysOff).toEqual([]);
  expect(result.current.marginalValues.size).toBe(0);
  expect(result.current.budgetSpent).toBe(0);
});

it('shows an over-budget legacy pin issue and prevents exporting an invalid plan', async () => {
  navigate('?c=US&s=2027-12-20&e=2027-12-31&b=1&rv=0&w=0&p=2027-12-27,2027-12-28');
  render(<App />);
  await screen.findByText('Required dates or the selected plan exceed your available PTO.');
  expect(screen.getByText('Check your planning inputs before exporting.')).toBeTruthy();
  expect(screen.getByRole('alert', { name: 'Planning needs attention' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Clear pinned and excluded dates' })).toBeTruthy();
  expect(screen.queryByText('Choose valid dates and a PTO balance to display the calendar.')).toBeNull();
  expect(document.getElementById('shortcut-download-ics')).toBeNull();
});
