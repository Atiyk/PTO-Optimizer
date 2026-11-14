import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Landing } from './Landing';
import { SHARE_LINK_SENTENCE } from './shareLinkCopy';
import type { Holiday } from '@daysoff/engine/data/holidays';
import { defaultEmployerCalendar, saveEmployerCalendar } from '../personal/employerCalendar';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import { createPtoRequest, writeRequestLedger, type PtoRequest } from '../personal/requestLedger';
import { PINNED_PLANS_STORAGE_KEY } from './pinnedPlanStore';

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
    expect(html).toMatch(/15 PTO days \+ \d+ weekend and holiday days, across/);
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
    expect(screen.getByText(/^15 PTO days \+ \d+ weekend and holiday days, across/)).toBeTruthy();
    await act(async () => { fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '5' } }); });
    expect(screen.getByText(/^5 PTO days \+ \d+ weekend and holiday days, across/)).toBeTruthy();
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
    expect(screen.queryByRole('heading', { name: 'No PTO days to spend' })).toBeNull();
    await act(async () => { fireEvent.change(field, { target: { value: '0' } }); });
    expect(field.value).toBe('0');
    expect(screen.getByRole('heading', { name: 'No PTO days to spend' })).toBeTruthy();
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
    // One primary action on the page: the closing section no longer repeats it.
    expect(primary.length).toBe(1);
    expect(screen.queryByRole('button', { name: 'Copy this PTO plan' })).toBeNull();
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
    expect(screen.getByRole('heading', { name: 'No PTO days to spend' })).toBeTruthy();
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
    const links = within(list).getAllByRole('link', { name: /^(?:Plan around .+|Connect a \d+-day break around .+)$/ });
    expect(links.length).toBe(3);
    // F23: each link names its holiday, so a list of links never reads as identical entries.
    expect(new Set(links.map((link) => link.textContent)).size).toBe(3);
    expect(links.some((link) => /Christmas Day/.test(link.textContent ?? ''))).toBe(true);
    expect(screen.queryByRole('button', { name: /^Show all/ })).toBeNull();
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
    expect(screen.getByText(/^15 PTO days \+/)).toBeTruthy();
    const link = screen.getAllByRole('link', { name: 'See the full plan →' })[0] as HTMLAnchorElement;
    expect(new URL(link.href).searchParams.has('eh')).toBe(false);
  });

  it('labels the 15 days and the country as a starting guess until the visitor changes either (research rec 3)', async () => {
    await act(async () => { render(<Landing />); });
    const guess = 'A starting guess: 15 PTO days and United States holidays. Change either to match yours.';
    expect(screen.getByText(guess)).toBeTruthy();
    await act(async () => { fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '20' } }); });
    expect(screen.queryByText(/A starting guess/)).toBeNull();
    await act(async () => { fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '15' } }); });
    expect(screen.queryByText(/A starting guess/)).toBeNull();
  });

  it('does not call the country a guess when a homepage link names it', async () => {
    window.history.replaceState(null, '', '/?home=1&c=US&b=15&s=2026-11-02&e=2027-11-01');
    await act(async () => { render(<Landing />); });
    expect(screen.queryByText(/A starting guess/)).toBeNull();
  });

  it('with 0 PTO days, says so and shows the long weekends public holidays already make (F05)', async () => {
    await act(async () => { render(<Landing />); });
    await act(async () => { fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '0' } }); });
    const result = screen.getByRole('heading', { name: 'No PTO days to spend' }).closest('section')!;
    // Christmas (Fri) and New Year's Day (Fri) and Independence Day observed (Mon): three 3-day weekends.
    expect(result.textContent).toContain('Public holidays alone give you 3 long weekends in these dates.');
    expect(result.textContent).toContain('The next is Dec 25 – 27, 2026, for Christmas Day.');
    expect(result.textContent).not.toMatch(/\d+ PTO days? \+/);
    expect(screen.queryByRole('figure')).toBeNull();
  });

  it('with a blank PTO field, asks for the number instead of showing the old plan as theirs (F06)', async () => {
    await act(async () => { render(<Landing />); });
    await act(async () => { fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '' } }); });
    expect(screen.getByRole('heading', { name: 'Enter your PTO days' })).toBeTruthy();
    expect(document.getElementById('landing-result')!.closest('section')!.textContent).not.toMatch(/\d+ days off/);
    expect(screen.queryByText(/weekend and holiday days/)).toBeNull();
    expect(screen.queryByRole('figure')).toBeNull();
    expect(screen.queryByText(/A starting guess/)).toBeNull();
  });

  it('states only new information after the longest break, never the trade twice (F12)', async () => {
    await act(async () => { render(<Landing />); });
    const longest = screen.getByText(/^Longest:/);
    expect(longest.textContent).not.toMatch(/—/);
    expect((longest.textContent!.match(/PTO days? for|days off for/g) ?? []).length).toBe(1);
  });
});

describe('share-link claim (N2/F10)', () => {
  it('uses the one shared sentence and no longer promises a link opens the plan exactly', async () => {
    await act(async () => { render(<Landing />); });
    expect(screen.getByText((_, el) => el?.tagName === 'P' && !!el.textContent?.includes(SHARE_LINK_SENTENCE))).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/exactly as you left it/);
  });
});

const REQUEST_CALENDAR = { workWeek: DEFAULT_WORK_WEEK, offDays: [], rangeStart: '2026-01-01', rangeEnd: '2028-12-31' };
const request = (start: string, end: string, status: PtoRequest['status'], id: string) => createPtoRequest({ start, end, status }, REQUEST_CALENDAR, id)!;
const SAVED_PLAN = {
  country: 'US', planningVersion: 2, planningStyle: 'balanced', minimumBreakDays: 3,
  employerCalendar: { version: 1, country: 'US', excluded: [], custom: [{ date: '2027-05-17', name: 'Private closure' }] },
  rangeStart: '2027-01-01', rangeEnd: '2027-12-31', budget: 10, w: 30,
  letSolverDecide: false, manualBreakCount: 3, weekStartOverride: 'auto', accrualEnabled: false,
  accrualPerMonth: 1.25, expiryEnabled: false, expiryDate: '', carryoverCap: 0,
  overlapDays: [], blackouts: [], workWeek: DEFAULT_WORK_WEEK, forced: {}, altFridayEnabled: false, altFridayStart: '',
  reserveDays: 0, applyTrackedRequests: false, reserveApprovedPto: false, unlimitedPto: false, noticePeriodDays: 14,
  peakCapEnabled: false, peakCapStart: '', peakCapEnd: '', peakCapMaxDays: 5,
  summary: { budgetSpent: 10, totalDaysOff: 26, breakCountActual: 3, travelPercentile: null },
};

describe('returning visitors (research rec 10)', () => {
  it('shows nothing new to a first-time visitor', async () => {
    await act(async () => { render(<Landing />); });
    expect(screen.queryByRole('region', { name: 'Welcome back' })).toBeNull();
    expect(screen.queryByText(/Welcome back/)).toBeNull();
  });

  it('names the next tracked break, its request-by date and one way to open it', async () => {
    writeRequestLedger([
      request('2027-03-15', '2027-03-19', 'approved', 'later'),
      request('2026-12-21', '2026-12-23', 'planned', 'next'),
      request('2026-11-20', '2026-11-20', 'canceled', 'dropped'),
    ]);
    await act(async () => { render(<Landing />); });
    const row = screen.getByRole('region', { name: 'Welcome back' });
    expect(row.textContent).toContain('Next up: Dec 21 – 23, 2026');
    expect(row.textContent).toContain('Planned · 3 PTO days');
    // 14 calendar days before Monday Dec 21 is Monday Dec 7.
    expect(row.textContent).toContain('Request by Dec 7');
    const links = row.querySelectorAll('a');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('/policy#requests');
    // It sits at the top of the result area, before the answer.
    const result = document.querySelector('[data-plan-result]')!;
    expect(result.firstElementChild).toBe(row);
  });

  it('opens a saved plan from its own planner link, keeping private settings off the address', async () => {
    localStorage.setItem(PINNED_PLANS_STORAGE_KEY, JSON.stringify({ version: 1, plans: [{ id: 'one', snapshot: SAVED_PLAN }] }));
    await act(async () => { render(<Landing />); });
    const row = screen.getByRole('region', { name: 'Welcome back' });
    expect(row.textContent).toContain('Your saved plan: 26 days off for 10 PTO days');
    const link = screen.getByRole('link', { name: 'Open saved plan →' }) as HTMLAnchorElement;
    const url = new URL(link.href);
    expect(url.pathname).toBe('/pto');
    expect(url.searchParams.get('b')).toBe('10');
    expect(url.searchParams.get('s')).toBe('2027-01-01');
    expect(url.searchParams.get('e')).toBe('2027-12-31');
    expect(link.href).not.toContain('Private');
    expect(url.searchParams.has('eh')).toBe(false);
  });

  it('ignores finished and past requests', async () => {
    writeRequestLedger([request('2026-10-01', '2026-10-02', 'approved', 'past'), request('2026-12-01', '2026-12-01', 'rejected', 'no')]);
    await act(async () => { render(<Landing />); });
    expect(screen.queryByRole('region', { name: 'Welcome back' })).toBeNull();
  });
});

describe('blank PTO field (R2)', () => {
  it('does not carry the cleared number into the planner link or the address', async () => {
    await act(async () => { render(<Landing />); });
    await act(async () => { fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '' } }); });
    const cta = screen.getByRole('link', { name: 'Open the planner →' }) as HTMLAnchorElement;
    expect(new URL(cta.href).searchParams.has('b')).toBe(false);
    expect(new URL(cta.href).searchParams.get('c')).toBe('US');
    expect(screen.queryByRole('link', { name: 'See the full plan →' })).toBeNull();
    expect(screen.getByText('It starts at 15 PTO days. Change them there.')).toBeTruthy();
    expect(new URLSearchParams(window.location.search).has('b')).toBe(false);
    await act(async () => { fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '9' } }); });
    expect(new URL((screen.getByRole('link', { name: 'See the full plan →' }) as HTMLAnchorElement).href).searchParams.get('b')).toBe('9');
  });
});

describe('holidays ahead (F23)', () => {
  it('shows the next three and puts the rest behind one disclosure', async () => {
    const extra = [
      { date: '2027-05-31', nominalDate: '2027-05-31', name: 'Memorial Day', countryCode: 'US', counties: null },
      { date: '2027-09-06', nominalDate: '2027-09-06', name: 'Labor Day', countryCode: 'US', counties: null },
    ] satisfies Holiday[];
    calendar.push(...extra);
    try {
      await act(async () => { render(<Landing />); });
      expect(screen.getByRole('list', { name: 'Next 3 of 5 upcoming holidays' }).querySelectorAll('li')).toHaveLength(3);
      const more = screen.getByRole('button', { name: 'Show all 5 holidays' });
      expect(more.getAttribute('aria-expanded')).toBe('false');
      await act(async () => { fireEvent.click(more); });
      expect(screen.getByRole('list', { name: 'All 5 upcoming holidays' }).querySelectorAll('li')).toHaveLength(5);
      expect(screen.getByRole('button', { name: 'Show the next 3 only' }).getAttribute('aria-expanded')).toBe('true');
      expect(screen.getByRole('button', { name: 'Download holidays (.ics)' })).toBeTruthy();
    } finally {
      calendar.splice(3);
    }
  });
});
