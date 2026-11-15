import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { CompanyHolidayChips, HOLIDAY_QUESTION } from './CompanyHolidayChips';
import { useEmployerHolidayProfile } from './useEmployerHolidayProfile';
import { EMPLOYER_STORAGE_PREFIX, readEmployerCalendar } from '../personal/employerCalendar';
import { holidayChoices, resolveHolidayEntries, type HolidayChoice } from '../personal/employerHolidayChoices';
import type { Holiday } from '@daysoff/engine/data/holidays';
import * as analytics from './analytics';

const choice = (id: string, label: string, pressed: HolidayChoice['pressed'], kind: HolidayChoice['kind'] = 'public'): HolidayChoice => ({ id, label, pressed, kind, dates: ['2027-01-18'] });
const MANY = Array.from({ length: 12 }, (_, i) => choice(`public:h${i}`, `Holiday ${i}`, i % 2 === 0));

afterEach(cleanup);

describe('CompanyHolidayChips semantics', () => {
  it('asks the question with toggle buttons that expose aria-pressed, including mixed', () => {
    const onToggle = vi.fn();
    render(<CompanyHolidayChips country="US" choices={[choice('public:a', 'MLK Day', true), choice('extra:b', 'Christmas Eve', false, 'extra'), choice('public:c', 'Veterans Day', 'mixed')]} onToggle={onToggle} status="Saved for United States." />);
    expect(screen.getByRole('heading', { name: HOLIDAY_QUESTION })).toBeTruthy();
    expect(screen.getByText(/Not sure\? Most private employers give/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /MLK Day/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /Christmas Eve/ }).getAttribute('aria-pressed')).toBe('false');
    const mixed = screen.getByRole('button', { name: /Veterans Day.*some years only/ });
    expect(mixed.getAttribute('aria-pressed')).toBe('mixed');
    // Native buttons: focusable and activated by Enter/Space (click events in the DOM).
    mixed.focus();
    expect(document.activeElement).toBe(mixed);
    fireEvent.click(mixed);
    expect(onToggle).toHaveBeenCalledWith('public:c');
    expect(screen.getByRole('status').textContent).toBe('Saved for United States.');
    expect(screen.queryByRole('button', { name: /Save/ })).toBeNull();
  });

  it('collapses after eight with a Show all toggle that reports its state', () => {
    render(<CompanyHolidayChips country="GB" choices={MANY} onToggle={() => {}} />);
    expect(screen.getAllByRole('button', { pressed: true }).length + screen.getAllByRole('button', { pressed: false }).length).toBe(8);
    const more = screen.getByRole('button', { name: 'Show all 12' });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(more);
    expect(screen.getByRole('button', { name: 'Show fewer' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('list', { name: 'Holidays' }).children).toHaveLength(12);
    expect(screen.queryByText(/Not sure\?/)).toBeNull(); // US-only helper
  });

  it('adds a company day through the existing custom-day support', () => {
    const onAdd = vi.fn();
    render(<CompanyHolidayChips country="US" choices={MANY.slice(0, 2)} onToggle={() => {}} onAddCompanyDay={onAdd} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add a company day' }));
    fireEvent.change(screen.getByLabelText('Company day off date'), { target: { value: '2027-07-06' } });
    fireEvent.change(screen.getByLabelText('Company day off name'), { target: { value: 'Summer shutdown' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(onAdd).toHaveBeenCalledWith('2027-07-06', 'Summer shutdown');
  });
});

describe('homepage profile: auto-save, reload, undo, reset', () => {
  const NATIONAL: Holiday[] = [{ date: '2027-01-18', nominalDate: '2027-01-18', name: 'Martin Luther King, Jr. Day', countryCode: 'US', counties: null }];
  beforeEach(() => localStorage.clear());

  it('saves a chip edit without a save step and restores it on the next visit; sends no holiday detail', async () => {
    const track = vi.spyOn(analytics, 'track').mockImplementation(() => {});
    const first = renderHook(() => useEmployerHolidayProfile('US'));
    const entries = resolveHolidayEntries(NATIONAL, [], first.result.current.calendar, '2027-01-01', '2027-12-31');
    const mlk = holidayChoices(entries, 'US').find((c) => c.label === 'MLK Day')!;
    act(() => first.result.current.toggle(mlk, entries));
    expect(track).toHaveBeenCalledWith('holiday_preference_customized');
    expect(track.mock.calls.every((call) => call.length === 1)).toBe(true);
    await waitFor(() => expect(first.result.current.status).toBe('Saved for United States.'));
    expect(localStorage.getItem(`${EMPLOYER_STORAGE_PREFIX}US:`)).toMatch(/^2\./);
    first.unmount();

    const second = renderHook(() => useEmployerHolidayProfile('US'));
    expect(second.result.current.calendar.skipped).toEqual(['Martin Luther King, Jr. Day']);
    expect(second.result.current.status).toBe('Saved for United States.');
    act(() => second.result.current.reset());
    expect(localStorage.getItem(`${EMPLOYER_STORAGE_PREFIX}US:`)).toBeNull();
    expect(second.result.current.canUndo).toBe(true);
    act(() => second.result.current.undo());
    await waitFor(() => expect(readEmployerCalendar('US').skipped).toEqual(['Martin Luther King, Jr. Day']));
    track.mockRestore();
  });
});
