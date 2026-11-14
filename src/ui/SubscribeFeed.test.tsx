import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { encodeEmployerCalendar } from '../personal/employerCalendar';
import { SubscribeFeed, feedLinks } from './SubscribeFeed';
import { buildPublicPlanSearch } from './publicSharePrivacy';
import { todayISO } from './today';

afterEach(cleanup);

const SEARCH = 'c=US&s=2027-01-01&e=2027-12-31&b=20&p=2027-03-15,2027-03-16';
// Issue 19: the feed link records the day it was made, so its events can say so.
const PUBLIC_SEARCH = `${buildPublicPlanSearch(SEARCH)}&fc=${todayISO()}`;
const ORIGIN = 'https://gapless.example';

describe('feedLinks', () => {
  it('builds the https, webcal, Google and Outlook URLs', () => {
    const links = feedLinks(ORIGIN, `?${SEARCH}`);
    expect(links.https).toBe(`${ORIGIN}/api/feed?${SEARCH}`);
    expect(links.webcal).toBe(`webcal://gapless.example/api/feed?${SEARCH}`);
    expect(links.google).toBe(`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(links.webcal)}`);
    const outlook = new URL(links.outlook);
    expect(outlook.origin + outlook.pathname).toBe('https://outlook.live.com/calendar/0/addfromweb');
    expect(outlook.searchParams.get('url')).toBe(links.https);
    expect(outlook.searchParams.get('name')).toBe('Timebower - PTO plan');
    expect(new URL(links.google).searchParams.get('cid')).toBe(links.webcal);
  });
});

describe('SubscribeFeed', () => {
  it('shows a heading, three app links and the copyable feed URL, with no submit button', () => {
    render(<SubscribeFeed planSearch={SEARCH} origin={ORIGIN} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Keep this plan in your calendar' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Apple Calendar' }).getAttribute('href')).toBe(`webcal://gapless.example/api/feed?${PUBLIC_SEARCH}`);
    const google = screen.getByRole('link', { name: /Google Calendar/ });
    expect(google.getAttribute('href')).toContain('https://calendar.google.com/calendar/r?cid=webcal%3A%2F%2F');
    expect(google.getAttribute('target')).toBe('_blank');
    expect(google.getAttribute('rel')).toContain('noopener');
    expect(screen.getByRole('link', { name: /Outlook/ }).getAttribute('href')).toContain('https://outlook.live.com/calendar/0/addfromweb?url=https%3A%2F%2F');
    const input = screen.getByLabelText(/paste this link/i) as HTMLInputElement;
    expect(input.readOnly).toBe(true);
    expect(input.value).toBe(`${ORIGIN}/api/feed?${PUBLIC_SEARCH}`);
    expect(screen.getByRole('button', { name: 'Copy calendar link' })).toBeTruthy();
    expect(document.querySelector('button[type="submit"], form')).toBeNull();
    expect(screen.getByText(/fixed snapshot/)).toBeTruthy();
    expect(document.body.textContent).toContain('Shows the dates as of today; subscribe again after changes.');
  });

  it('keeps every visible block short and puts the update mechanics behind a disclosure (F16)', () => {
    render(<SubscribeFeed planSearch={SEARCH} origin={ORIGIN} />);
    for (const p of document.querySelectorAll('p')) {
      expect(p.textContent!.trim().split(/\s+/).length, p.textContent!).toBeLessThanOrEqual(25);
    }
    const summary = screen.getByText('How updates work', { selector: 'summary' });
    expect(summary.closest('details')!.textContent).toContain('Edits you make after subscribing are not included.');
  });

  it('says what the snapshot holds, that later edits are left out, and how to update and remove it', () => {
    render(<SubscribeFeed planSearch={SEARCH} origin={ORIGIN} />);
    const text = document.body.textContent ?? '';
    expect(text).toMatch(/fixed snapshot of this plan.s shared settings as they are today/);
    expect(text).toContain('PTO days, holidays and request-by reminders');
    expect(text).toContain('Anyone with the link can see these dates.');
    expect(text).toContain('Edits you make after subscribing are not included.');
    expect(text).toContain('To update, subscribe again, then remove the old “Timebower - PTO plan” calendar');
    expect(text).toContain('Each event notes the day the snapshot was made.');
  });

  it('records only the creation date beside the public share keys, and never for the watch feed', () => {
    render(<SubscribeFeed planSearch={SEARCH} origin={ORIGIN} />);
    const query = new URL((screen.getByLabelText(/paste this link/i) as HTMLInputElement).value).searchParams;
    expect(query.get('fc')).toBe(todayISO());
    expect([...query.keys()].filter((key) => !new URLSearchParams(buildPublicPlanSearch(SEARCH)).has(key))).toEqual(['fc']);
    cleanup();
    render(<SubscribeFeed planSearch="c=US&cb=5" path="/api/watch" origin={ORIGIN} />);
    expect((screen.getByLabelText(/paste this link/i) as HTMLInputElement).value).not.toContain('fc=');
  });

  it('uses this page origin once mounted (never a build-time host)', () => {
    render(<SubscribeFeed planSearch={SEARCH} />);
    expect(screen.getByRole('link', { name: 'Apple Calendar' }).getAttribute('href')).toBe(`webcal://${window.location.host}/api/feed?${PUBLIC_SEARCH}`);
  });

  it('says to download instead when the link is too long for a feed', () => {
    const dates = Array.from({ length: 370 }, (_, index) => new Date(Date.UTC(2027, 0, index + 1)).toISOString().slice(0, 10)).join(',');
    const params = new URLSearchParams(SEARCH);
    params.set('p', dates);
    render(<SubscribeFeed planSearch={params.toString()} origin={ORIGIN} />);
    expect(screen.queryByRole('link', { name: 'Apple Calendar' })).toBeNull();
    expect(screen.getByText(/too large for a calendar subscription/)).toBeTruthy();
  });

  it('offers no subscription for a plan the feed would refuse to solve', () => {
    render(<SubscribeFeed planSearch="c=US&s=2026-11-04&e=2027-12-31&b=120" origin={ORIGIN} />);
    expect(screen.queryByRole('link', { name: 'Apple Calendar' })).toBeNull();
    expect(screen.getByText(/too large for a calendar subscription/)).toBeTruthy();
  });
});

describe('dates-only subscription links (format 2)', () => {
  const breaks = [
    { start: '2027-05-29', end: '2027-06-06', days: ['2027-05-29', '2027-05-30', '2027-05-31', '2027-06-01', '2027-06-02', '2027-06-03', '2027-06-04', '2027-06-05', '2027-06-06'], ptoCost: 4 },
  ];
  const isPtoDay = (iso: string) => ['2027-06-01', '2027-06-02', '2027-06-03', '2027-06-04'].includes(iso);
  const BALANCE_SEARCH = `${SEARCH}&ac=1&am=1.67&ex=1&xd=2027-03-31&cc=5&np=10`;

  it('puts the chosen dates in the link and no budget, balance or policy value', () => {
    render(<SubscribeFeed planSearch={BALANCE_SEARCH} origin={ORIGIN} breaks={breaks} isPtoDay={isPtoDay} />);
    expect(screen.getByText(/Your PTO dates come from this plan/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Use public holidays' }));
    const link = (screen.getByLabelText(/paste this link/i) as HTMLInputElement).value;
    const query = new URL(link).searchParams;
    expect(query.get('fv')).toBe('2');
    expect(query.get('k')).toBe('20270529-20270606-000111100');
    for (const key of ['b', 'rv', 'ac', 'am', 'ex', 'xd', 'cc', 'np', 'p', 'w', 'count']) expect(query.has(key), key).toBe(false);
    expect(link).not.toMatch(/1\.67|[?&]b=20/);
    expect(document.body.textContent).toContain('It holds no PTO balance or policy settings.');
  });

  it('counts a subscribe action, with no properties', () => {
    const calls: unknown[][] = [];
    window.plausible = Object.assign((...args: unknown[]) => { calls.push(args); }, {});
    render(<SubscribeFeed planSearch={SEARCH} origin={ORIGIN} breaks={breaks} isPtoDay={isPtoDay} />);
    const apple = screen.getByRole('link', { name: 'Apple Calendar' });
    apple.addEventListener('click', (event) => event.preventDefault());
    fireEvent.click(apple);
    expect(calls.map(([name]) => name)).toContain('feed_subscribed');
    for (const [, options] of calls) expect(Object.keys(options as object)).toEqual(['url']);
    delete window.plausible;
  });
});

describe('private employer calendar subscriptions', () => {
  const privatePayload = encodeEmployerCalendar({
    version: 1, country: 'US', excluded: ['2027-12-24|PRIVATE_POLICY_EXCLUSION'],
    custom: [{ date: '2027-12-27', name: 'PRIVATE_EMPLOYER_POLICY_TITLE' }],
  });
  const privateQuery = SEARCH + '&bo=2027-12-26&od=2027-12-28&eh=' + encodeURIComponent(privatePayload);
  const observedHolidayDates = ['2027-07-05', '2027-12-27'];

  it('requires a choice and uses date-only snapshots even after explicit opt-in', () => {
    const { rerender } = render(<SubscribeFeed planSearch={privateQuery} observedHolidayDates={observedHolidayDates} origin={ORIGIN} />);
    expect(screen.getByText(/Choose which holidays the subscription uses/i)).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Apple Calendar' })).toBeNull();
    expect(screen.queryByRole('link', { name: /Google Calendar/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Outlook/ })).toBeNull();
    expect(screen.queryByLabelText(/paste this link/i)).toBeNull();
    expect(document.body.textContent).not.toContain('PRIVATE_EMPLOYER_POLICY_TITLE');
    fireEvent.click(screen.getByRole('button', { name: /Use my holiday dates/i }));
    const google = screen.getByRole('link', { name: /Google Calendar/ });
    const outlook = screen.getByRole('link', { name: /Outlook/ });
    const external = new URL(outlook.getAttribute('href')!);
    const outlookSnapshot = external.searchParams.get('url')!;
    const googleSnapshot = new URL(google.getAttribute('href')!).searchParams.get('cid')!.replace(/^webcal:/, 'https:');
    const copiedSnapshot = (screen.getByLabelText(/paste this link/i) as HTMLInputElement).value;
    for (const link of [outlookSnapshot, googleSnapshot, copiedSnapshot]) {
      const query = new URL(link).searchParams;
      expect(query.get('sv')).toBe('1');
      expect(query.get('ho')).toBe('2027-07-05,2027-12-27');
      expect(link).not.toMatch(/PRIVATE_|[?&](eh|bo|od)=/);
    }
    rerender(<SubscribeFeed planSearch={privateQuery + '&w=10'} observedHolidayDates={observedHolidayDates} origin={ORIGIN} />);
    expect(screen.queryByRole('link', { name: /Google Calendar/ })).toBeNull();
    expect(screen.queryByLabelText(/paste this link/i)).toBeNull();
  });

  it('offers a public-holiday option even when private dates are unavailable', () => {
    render(<SubscribeFeed planSearch={privateQuery} origin={ORIGIN} />);
    expect(screen.queryByRole('button', { name: /Use my holiday dates/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Use public holidays' }));
    const query = new URL((screen.getByLabelText(/paste this link/i) as HTMLInputElement).value).searchParams;
    expect(query.get('sv')).toBe('1');
    for (const key of ['eh', 'bo', 'od', 'ho']) expect(query.has(key)).toBe(false);
  });
});
