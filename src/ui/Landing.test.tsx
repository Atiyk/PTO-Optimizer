import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Landing } from './Landing';
import type { Holiday } from '@daysoff/engine/data/holidays';
import { defaultEmployerCalendar, saveEmployerCalendar } from '../personal/employerCalendar';

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
  window.__PTO_PRELOADED_HOLIDAY_YEARS__ = { US: [2026, 2027] };
  localStorage.clear();
});
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); delete window.plausible;
  delete window.__PTO_PRELOADED_HOLIDAY_YEARS__;
});

describe('live homepage planner', () => {
  it('prerenders a real planning preview from embedded holiday data', () => {
    const html = renderToStaticMarkup(<Landing />);
    expect(html).toContain('Your plan: ');
    expect(html).toContain('days off');
    expect(html).toContain('from 15 PTO days across');
    expect(html).not.toContain('Calculating');
    expect(html).not.toContain('Updating your holiday calendar');
    expect((html.match(/<h1\b/g) ?? []).length).toBe(1);
  });

  it('reads as a live sentence: heading, then the sentence inputs, then the real result, then the finer controls', () => {
    const html = renderToStaticMarkup(<Landing />);
    const heading = html.indexOf('<h1');
    const budgetField = html.indexOf('id="landing-budget"');
    const countryField = html.indexOf('id="landing-country"');
    const result = html.indexOf('id="landing-result"');
    const slider = html.indexOf('id="landing-budget-slider"');
    const dates = html.indexOf('Planning dates');
    expect(heading).toBeGreaterThan(0);
    expect(budgetField).toBeGreaterThan(heading);
    expect(countryField).toBeGreaterThan(budgetField);
    expect(result).toBeGreaterThan(countryField);
    expect(slider).toBeGreaterThan(result);
    expect(dates).toBeGreaterThan(result);
    expect(html).toMatch(/<span class="mark">\d+ days off<\/span>/);
    expect(html).toContain('Preview assumes a Monday–Friday workweek.');
  });

  it('updates a real plan and its URL when the PTO budget changes, without submission', async () => {
    const event = vi.fn();
    window.plausible = event;
    await act(async () => { render(<Landing />); });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('More days off from the same PTO.');
    expect(screen.getByRole('spinbutton', { name: 'PTO days available' }).getAttribute('value')).toBe('15');
    expect(screen.getByText(/from 15 PTO days across/)).toBeTruthy();
    await act(async () => { fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '5' } }); });
    expect(screen.getByText(/from 5 PTO days across/)).toBeTruthy();
    const link = screen.getAllByRole('link', { name: 'See the full plan →' })[0] as HTMLAnchorElement;
    expect(link.search).toContain('b=5');
    expect(link.search).toContain('pv=2');
    expect(new URLSearchParams(window.location.search).get('b')).toBe('5');
    expect(event).toHaveBeenCalledExactlyOnceWith('quick_plan_engaged', { url: window.location.origin + '/' });
    expect(document.querySelector('button[type="submit"]')).toBeNull();
  });

  it('keeps a cleared PTO field unknown instead of planning 0 days, and accepts a typed 0 (issue 15)', async () => {
    await act(async () => { render(<Landing />); });
    const field = screen.getByRole<HTMLInputElement>('spinbutton', { name: 'PTO days available' });
    await act(async () => { fireEvent.change(field, { target: { value: '' } }); });
    expect(field.value).toBe('');
    expect(new URLSearchParams(window.location.search).get('b')).not.toBe('0');
    expect(screen.queryByText('No PTO days allocated. You can still explore the holidays below.')).toBeNull();
    await act(async () => { fireEvent.change(field, { target: { value: '0' } }); });
    expect(field.value).toBe('0');
    expect(screen.getByText('No PTO days allocated. You can still explore the holidays below.')).toBeTruthy();
  });

  it('shows a directly visible, keyboard-friendly PTO slider that stays synchronized with the number field', async () => {
    await act(async () => { render(<Landing />); });
    const slider = screen.getByRole('slider', { name: 'Adjust PTO days available' });
    expect(slider.getAttribute('aria-valuetext')).toBe('15 PTO days available');
    await act(async () => { fireEvent.change(slider, { target: { value: '7' } }); });
    expect((screen.getByRole('spinbutton', { name: 'PTO days available' }) as HTMLInputElement).value).toBe('7');
    expect(slider.getAttribute('aria-valuetext')).toBe('7 PTO days available');
    expect(new URLSearchParams(window.location.search).get('b')).toBe('7');
    expect(screen.getByRole('heading', { name: 'Plan the breaks, then keep track of the days.' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Put your days off on the calendar.' })).toBeTruthy();
  });

  it('draws every break of the plan on a weekday-aligned year schedule and names each one in words', async () => {
    await act(async () => { render(<Landing />); });
    const breaks = screen.getByRole('list', { name: 'Breaks in this plan' });
    expect(breaks.querySelectorAll('li').length).toBe(Number(/across (\d+) break/.exec(document.body.textContent ?? '')![1]));
    expect(breaks.textContent).toContain('(longest)');
    expect(screen.getByText('Day off in a recommended break')).toBeTruthy();
  });

  it('starts the schedule week on the same day as the planner for the chosen country', async () => {
    await act(async () => { render(<Landing />); });
    const header = () => screen.getByRole('figure').querySelector('[aria-hidden="true"].sm\\:grid')!.textContent;
    expect(header()).toMatch(/^SMTWTFS/);
    await act(async () => { fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'GB' } }); });
    expect(header()).toMatch(/^MTWTFSS/);
  });

  it('uses one label for the primary planner action everywhere on the page', async () => {
    await act(async () => { render(<Landing />); });
    const primary = screen.getAllByRole('link', { name: 'See the full plan →' });
    expect(primary.length).toBe(2);
    expect(new Set(primary.map((link) => link.getAttribute('href'))).size).toBe(1);
  });

  it('leaves unmarked root queries to the historic /pto redirect', async () => {
    // Root links without home=1 are historic optimizer links (index.html redirects them),
    // so the homepage must not claim them.
    window.history.replaceState(null, '', '/?c=GB&b=20');
    await act(async () => { render(<Landing />); });
    expect((screen.getByRole('spinbutton', { name: 'PTO days available' }) as HTMLInputElement).value).toBe('15');
  });

  it('shows explicit empty and invalid-date states while preserving the basic controls', async () => {
    await act(async () => { render(<Landing />); });
    await act(async () => { fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '0' } }); });
    expect(screen.getByText(/No PTO days allocated/)).toBeTruthy();
    await act(async () => { fireEvent.change(screen.getByLabelText('Through'), { target: { value: '2026-01-01' } }); });
    expect(screen.getByRole('alert').textContent).toContain('Choose valid start and end dates');
    expect(screen.getByLabelText('Country')).toBeTruthy();
  });

  it('displays year-inclusive date summaries for ranges that cross calendar years', async () => {
    await act(async () => { render(<Landing />); });
    expect(screen.getByText(/Preview: November 2, 2026 – November 1, 2027\./)).toBeTruthy();
  });

  it('sets the PTO days and country as labelled controls inside one sentence', () => {
    const html = renderToStaticMarkup(<Landing />);
    expect(html).toMatch(/I have <input id="landing-budget" aria-label="PTO days available"/);
    expect(html).toContain('id="landing-country" aria-label="Country"');
    expect(html).toContain('PTO days in');
  });

  it('lists every upcoming holiday with its own deep link into the planner', async () => {
    await act(async () => { render(<Landing />); });
    const list = screen.getByRole('list', { name: /upcoming holidays/ });
    expect(list.querySelectorAll('li').length).toBe(3);
    expect(screen.getAllByRole('link', { name: /View this holiday in the planner|Plan around this holiday|Connect a \d+-day break/ }).length).toBe(3);
    expect(screen.getByRole('button', { name: 'Download holidays (.ics)' })).toBeTruthy();
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
    expect(screen.getByRole('link', { name: /^Forecast my balance/ }).getAttribute('href')).toBe('/policy#balance');
    expect(screen.getByRole('link', { name: /^Check my policy/ }).getAttribute('href')).toBe('/policy');
    expect(screen.getByText(/Preview assumes a Monday–Friday workweek/)).toBeTruthy();
  });

  it('restores the homepage scenario on back navigation before rebuilding its planner link', async () => {
    await act(async () => { render(<Landing />); });
    await act(async () => { fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '6' } }); });
    await act(async () => {
      window.history.replaceState(null, '', '/?home=1&c=US&b=15&s=2026-11-02&e=2027-11-01');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('15');
    const link = screen.getAllByRole('link', { name: 'See the full plan →' })[0] as HTMLAnchorElement;
    expect(link.search).toContain('b=15');
  });

  it('applies the saved employer calendar without putting it in links or rewriting preferences', async () => {
    const employer = { ...defaultEmployerCalendar('US'), excluded: ['2026-12-25|Christmas Day'], custom: [{ date: '2026-11-20', name: 'Company day off' }] };
    expect(saveEmployerCalendar(employer)).toBe(true);
    const write = vi.spyOn(Storage.prototype, 'setItem');
    await act(async () => { render(<Landing />); });
    expect(screen.queryByText('Christmas Day')).toBeNull();
    expect(screen.getAllByText('Company day off').length).toBeGreaterThan(0);
    expect(screen.getByText(/Your saved employer holiday calendar is applied/)).toBeTruthy();
    const link = screen.getAllByRole('link', { name: 'See the full plan →' })[0] as HTMLAnchorElement;
    expect(new URL(link.href).searchParams.has('eh')).toBe(false);
    expect(write).not.toHaveBeenCalled();
    await act(async () => { fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'GB' } }); });
    const otherCountryLink = screen.getAllByRole('link', { name: 'See the full plan →' })[0] as HTMLAnchorElement;
    expect(new URL(otherCountryLink.href).searchParams.has('eh')).toBe(false);
    expect(new URL(otherCountryLink.href).searchParams.get('c')).toBe('GB');
    expect(screen.queryByText('Company day off')).toBeNull();
    expect(write).not.toHaveBeenCalled();
  });

  it('keeps planning available when saved preferences cannot be read', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('storage disabled'); });
    await act(async () => { render(<Landing />); });
    expect(screen.getByText(/from 15 PTO days across/)).toBeTruthy();
    const link = screen.getAllByRole('link', { name: 'See the full plan →' })[0] as HTMLAnchorElement;
    expect(new URL(link.href).searchParams.has('eh')).toBe(false);
  });
});
