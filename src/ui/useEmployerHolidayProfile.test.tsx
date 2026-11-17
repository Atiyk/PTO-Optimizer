import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { readEmployerCalendar } from '../personal/employerCalendar';
import type { HolidayChoice, HolidayEntry } from '../personal/employerHolidayChoices';
import { useEmployerHolidayProfile } from './useEmployerHolidayProfile';

const choice = (name: string, date: string): HolidayChoice => ({
  id: `public:${name}`, label: name, kind: 'public', pressed: true, dates: [date],
});
const entry = (name: string, date: string): HolidayEntry => ({
  date, name, source: 'public', checked: true,
});
const usName = 'Veterans Day';
const gbName = 'Christmas Day';
const usChoice = choice(usName, '2027-11-11');
const gbChoice = choice(gbName, '2027-12-25');

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.clear();
});

describe('homepage employer holiday saves across country switches', () => {
  it('saves an edited US calendar even when the country switches before the debounce', () => {
    const { result, rerender } = renderHook(({ country }) => useEmployerHolidayProfile(country), {
      initialProps: { country: 'US' },
    });
    act(() => { result.current.toggle(usChoice, [entry(usName, '2027-11-11')]); });
    expect(result.current.calendar.skipped).toContain(usName);

    rerender({ country: 'GB' });
    expect(result.current.calendar.country).toBe('GB');
    act(() => { vi.advanceTimersByTime(450); });

    expect(readEmployerCalendar('US').skipped).toContain(usName);
    expect(readEmployerCalendar('GB').skipped).toEqual([]);
    expect(result.current.calendar.country).toBe('GB');
    expect(result.current.status).not.toContain('United States');
  });

  it('persists both countries if each is edited before the first debounce finishes', () => {
    const { result, rerender } = renderHook(({ country }) => useEmployerHolidayProfile(country), {
      initialProps: { country: 'US' },
    });
    act(() => { result.current.toggle(usChoice, [entry(usName, '2027-11-11')]); });
    rerender({ country: 'GB' });
    act(() => { result.current.toggle(gbChoice, [entry(gbName, '2027-12-25')]); });
    act(() => { vi.advanceTimersByTime(450); });
    expect(readEmployerCalendar('US').skipped).toContain(usName);
    expect(readEmployerCalendar('GB').skipped).toContain(gbName);
    expect(result.current.calendar.country).toBe('GB');
  });

  it('resetting the active country does not discard pending edits for another country', () => {
    const { result, rerender } = renderHook(({ country }) => useEmployerHolidayProfile(country), {
      initialProps: { country: 'US' },
    });
    act(() => { result.current.toggle(usChoice, [entry(usName, '2027-11-11')]); });
    rerender({ country: 'GB' });
    act(() => { result.current.reset(); });
    act(() => { vi.advanceTimersByTime(450); });
    expect(readEmployerCalendar('US').skipped).toContain(usName);
    expect(readEmployerCalendar('GB').skipped).toEqual([]);
  });

  it('pagehide flush saves all edited scopes, not just the currently visible scope', () => {
    const { result, rerender } = renderHook(({ country }) => useEmployerHolidayProfile(country), {
      initialProps: { country: 'US' },
    });
    act(() => { result.current.toggle(usChoice, [entry(usName, '2027-11-11')]); });
    rerender({ country: 'GB' });
    act(() => { result.current.toggle(gbChoice, [entry(gbName, '2027-12-25')]); });
    act(() => { window.dispatchEvent(new Event('pagehide')); });
    expect(readEmployerCalendar('US').skipped).toContain(usName);
    expect(readEmployerCalendar('GB').skipped).toContain(gbName);
  });
});
