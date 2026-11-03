import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Landing } from './Landing';
import type { Holiday } from '@daysoff/engine/data/holidays';
import { defaultEmployerCalendar, decodeEmployerCalendar, saveEmployerCalendar } from '../personal/employerCalendar';

const calendar = vi.hoisted(() => [
  { date: '2026-12-25', nominalDate: '2026-12-25', name: 'Christmas Day', countryCode: 'US', counties: null },
  { date: '2027-01-01', nominalDate: '2027-01-01', name: 'New Year’s Day', countryCode: 'US', counties: null },
  { date: '2027-07-05', nominalDate: '2027-07-04', name: 'Independence Day', countryCode: 'US', counties: null },
] satisfies Holiday[]);

vi.mock('@daysoff/engine/data/holidays', async (original) => ({
  ...await original<typeof import('@daysoff/engine/data/holidays')>(),
  getPreloadedHolidays: () => calendar,
  getHolidaysWithStatus: async () => ({ holidays: calendar, degraded: false }),
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-02T12:00:00Z'));
  window.history.replaceState(null, '', '/');
  localStorage.clear();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); delete window.plausible; });

describe('live homepage planner', () => {
  it('prerenders a real planning preview from embedded holiday data', () => {
    const html = renderToStaticMarkup(<Landing />);
    expect(html).toContain('Your recommended break');
    expect(html).toContain('calendar days off');
    expect(html).toContain('15 of 15 PTO days');
    expect(html).not.toContain('Calculating');
    expect(html).not.toContain('Updating your holiday calendar');
    expect((html.match(/<h1\b/g) ?? []).length).toBe(1);
  });

  it('places the real recommended break before editable fields in reading and focus order', () => {
    const html = renderToStaticMarkup(<Landing />);
    const heading = html.indexOf('Your recommended break');
    const budgetField = html.indexOf('id="landing-budget"');
    const dateDisclosure = html.indexOf('Planning dates');
    expect(heading).toBeGreaterThan(0);
    expect(budgetField).toBeGreaterThan(heading);
    expect(dateDisclosure).toBeGreaterThan(heading);
    expect(html).toContain('Make this preview yours');
    expect(html).toContain('Your recommendation updates automatically.');
    expect(html).toContain('grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]');
  });

  it('updates a real plan and its URL when the PTO budget changes, without submission', async () => {
    const event = vi.fn();
    window.plausible = event;
    await act(async () => { render(<Landing />); });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('every day off');
    expect(screen.getByRole('spinbutton', { name: 'PTO days available' }).getAttribute('value')).toBe('15');
    expect(screen.getByText(/15 of 15 PTO days/)).toBeTruthy();
    await act(async () => { fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '5' } }); });
    expect(screen.getByText(/5 of 5 PTO days/)).toBeTruthy();
    const link = screen.getAllByRole('link', { name: 'See the full plan →' })[0] as HTMLAnchorElement;
    expect(link.search).toContain('b=5');
    expect(link.search).toContain('pv=2');
    expect(new URLSearchParams(window.location.search).get('b')).toBe('5');
    expect(event).toHaveBeenCalledExactlyOnceWith('quick_plan_engaged', { url: window.location.origin + '/' });
    expect(document.querySelector('button[type="submit"]')).toBeNull();
  });

  it('shows a directly visible, keyboard-friendly PTO slider that stays synchronized with the number field', async () => {
    await act(async () => { render(<Landing />); });
    const slider = screen.getByRole('slider', { name: 'Adjust PTO days available' });
    expect(slider.getAttribute('aria-valuetext')).toBe('15 PTO days available');
    await act(async () => { fireEvent.change(slider, { target: { value: '7' } }); });
    expect((screen.getByRole('spinbutton', { name: 'PTO days available' }) as HTMLInputElement).value).toBe('7');
    expect(slider.getAttribute('aria-valuetext')).toBe('7 PTO days available');
    expect(new URLSearchParams(window.location.search).get('b')).toBe('7');
    expect(screen.getByRole('heading', { name: 'Make your PTO worth more time away.' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Take the next step with your plan.' })).toBeTruthy();
  });

  it('provides a mobile quick-edit link from the long result to the live slider', () => {
    const html = renderToStaticMarkup(<Landing />);
    expect(html).toContain('href="#landing-budget-slider"');
    expect(html).toContain('Change PTO days in this preview');
  });

  it('keeps the full 23-day mobile calendar accessible but collapsed so the controls are nearer the top', () => {
    const html = renderToStaticMarkup(<Landing />);
    expect(html).toContain('View all 23 calendar days');
    expect(html).toContain('data-testid="home-break-calendar"');
    expect(html).toContain('sm:hidden');
    expect(html).toContain('hidden sm:block');
  });

  it('shows explicit empty and invalid-date states while preserving the basic controls', async () => {
    await act(async () => { render(<Landing />); });
    await act(async () => { fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '0' } }); });
    expect(screen.getByText(/No PTO days allocated/)).toBeTruthy();
    await act(async () => { fireEvent.change(screen.getByLabelText('Through'), { target: { value: '2026-01-01' } }); });
    expect(screen.getByRole('alert').textContent).toContain('Choose valid start and end dates');
    expect(screen.getByLabelText('Country')).toBeTruthy();
  });

  it('keeps planning dates visible and accessible without a hidden disclosure', async () => {
    await act(async () => { render(<Landing />); });
    expect(screen.getByRole('group', { name: 'Planning dates' })).toBeTruthy();
    expect(screen.getByLabelText('From').closest('details')).toBeNull();
    expect(screen.getByLabelText('Through').closest('details')).toBeNull();
    expect(document.getElementById('main-content')?.tagName).toBe('MAIN');
    await act(async () => { fireEvent.change(screen.getByLabelText('Through'), { target: { value: '2027-10-31' } }); });
    expect(new URLSearchParams(window.location.search).get('e')).toBe('2027-10-31');
  });

  it('restores all new homepage inputs and keeps forecasting and policy entry points', async () => {
    window.history.replaceState(null, '', '/?home=1&c=GB&b=7&s=2027-01-01&e=2027-08-01');
    await act(async () => { render(<Landing />); });
    expect((screen.getByLabelText('Country') as HTMLSelectElement).value).toBe('GB');
    expect((screen.getByLabelText('From') as HTMLInputElement).value).toBe('2027-01-01');
    expect((screen.getByLabelText('Through') as HTMLInputElement).value).toBe('2027-08-01');
    expect(screen.getByRole('link', { name: 'Forecast my balance →' }).getAttribute('href')).toBe('/policy#balance');
    expect(screen.getByRole('link', { name: 'Check my policy →' }).getAttribute('href')).toBe('/policy');
    expect(screen.getByText(/Preview assumes a Monday–Friday workweek/)).toBeTruthy();
  });

  it('applies a saved employer calendar and reproduces it in the full-plan link without writing preferences', async () => {
    const employer = { ...defaultEmployerCalendar('US'), excluded: ['2026-12-25|Christmas Day'], custom: [{ date: '2026-11-20', name: 'Company day off' }] };
    expect(saveEmployerCalendar(employer)).toBe(true);
    const write = vi.spyOn(Storage.prototype, 'setItem');
    await act(async () => { render(<Landing />); });
    expect(screen.queryByText('Christmas Day')).toBeNull();
    expect(screen.getAllByText('Company day off').length).toBeGreaterThan(0);
    expect(screen.getByText(/Your saved employer holiday calendar is applied/)).toBeTruthy();
    const link = screen.getAllByRole('link', { name: 'See the full plan →' })[0] as HTMLAnchorElement;
    expect(decodeEmployerCalendar(new URL(link.href).searchParams.get('eh'))).toEqual(employer);
    expect(write).not.toHaveBeenCalled();
    await act(async () => { fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'GB' } }); });
    const otherCountryLink = screen.getAllByRole('link', { name: 'See the full plan →' })[0] as HTMLAnchorElement;
    expect(decodeEmployerCalendar(new URL(otherCountryLink.href).searchParams.get('eh'))).toEqual(defaultEmployerCalendar('GB'));
    expect(screen.queryByText('Company day off')).toBeNull();
    expect(write).not.toHaveBeenCalled();
  });

  it('keeps planning available when saved preferences cannot be read', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('storage disabled'); });
    await act(async () => { render(<Landing />); });
    expect(screen.getByText(/15 of 15 PTO days/)).toBeTruthy();
    const link = screen.getAllByRole('link', { name: 'See the full plan →' })[0] as HTMLAnchorElement;
    expect(decodeEmployerCalendar(new URL(link.href).searchParams.get('eh'))).toEqual(defaultEmployerCalendar('US'));
  });
});
