import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { encodeEmployerCalendar } from '../personal/employerCalendar';
import { SubscribeFeed, feedLinks } from './SubscribeFeed';

afterEach(cleanup);

const SEARCH = 'c=US&s=2027-01-01&e=2027-12-31&b=20&p=2027-03-15,2027-03-16';
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
    expect(outlook.searchParams.get('name')).toBe('Gapless PTO Optimizer - PTO plan');
    expect(new URL(links.google).searchParams.get('cid')).toBe(links.webcal);
  });
});

describe('SubscribeFeed', () => {
  it('shows a heading, three app links and the copyable feed URL, with no submit button', () => {
    render(<SubscribeFeed planSearch={SEARCH} origin={ORIGIN} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Keep this plan in your calendar' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Apple Calendar' }).getAttribute('href')).toBe(`webcal://gapless.example/api/feed?${SEARCH}`);
    const google = screen.getByRole('link', { name: /Google Calendar/ });
    expect(google.getAttribute('href')).toContain('https://calendar.google.com/calendar/r?cid=webcal%3A%2F%2F');
    expect(google.getAttribute('target')).toBe('_blank');
    expect(google.getAttribute('rel')).toContain('noopener');
    expect(screen.getByRole('link', { name: /Outlook/ }).getAttribute('href')).toContain('https://outlook.live.com/calendar/0/addfromweb?url=https%3A%2F%2F');
    const input = screen.getByLabelText(/paste this link/i) as HTMLInputElement;
    expect(input.readOnly).toBe(true);
    expect(input.value).toBe(`${ORIGIN}/api/feed?${SEARCH}`);
    expect(screen.getByRole('button', { name: 'Copy calendar link' })).toBeTruthy();
    expect(document.querySelector('button[type="submit"], form')).toBeNull();
    expect(screen.getByText(/After editing the plan, subscribe again/)).toBeTruthy();
  });

  it('uses this page origin once mounted (never a build-time host)', () => {
    render(<SubscribeFeed planSearch={SEARCH} />);
    expect(screen.getByRole('link', { name: 'Apple Calendar' }).getAttribute('href')).toBe(`webcal://${window.location.host}/api/feed?${SEARCH}`);
  });

  it('says to download instead when the link is too long for a feed', () => {
    render(<SubscribeFeed planSearch={`${SEARCH}&x=${'a'.repeat(4100)}`} origin={ORIGIN} />);
    expect(screen.queryByRole('link', { name: 'Apple Calendar' })).toBeNull();
    expect(screen.getByText(/too large for a calendar subscription/)).toBeTruthy();
  });

  it('offers no subscription for a plan the feed would refuse to solve', () => {
    render(<SubscribeFeed planSearch="c=US&s=2026-11-04&e=2027-12-31&b=120" origin={ORIGIN} />);
    expect(screen.queryByRole('link', { name: 'Apple Calendar' })).toBeNull();
    expect(screen.getByText(/too large for a calendar subscription/)).toBeTruthy();
  });
});

describe('private employer calendar subscriptions', () => {
  const privatePayload = encodeEmployerCalendar({
    version: 1, country: 'US', excluded: ['2027-12-24|PRIVATE_POLICY_EXCLUSION'],
    custom: [{ date: '2027-12-27', name: 'PRIVATE_EMPLOYER_POLICY_TITLE' }],
  });
  const privateQuery = SEARCH + '&eh=' + encodeURIComponent(privatePayload);

  it('hides all external provider and copyable URLs until explicit informed opt-in', () => {
    const { rerender } = render(<SubscribeFeed planSearch={privateQuery} origin={ORIGIN} />);
    expect(screen.getByText(/Nothing is shared unless you choose/i)).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Apple Calendar' })).toBeNull();
    expect(screen.queryByRole('link', { name: /Google Calendar/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Outlook/ })).toBeNull();
    expect(screen.queryByLabelText(/paste this link/i)).toBeNull();
    expect(document.body.textContent).not.toContain('PRIVATE_EMPLOYER_POLICY_TITLE');
    fireEvent.click(screen.getByRole('button', { name: /Include employer calendar details/i }));
    const google = screen.getByRole('link', { name: /Google Calendar/ });
    const outlook = screen.getByRole('link', { name: /Outlook/ });
    const external = new URL(outlook.getAttribute('href')!);
    expect(external.searchParams.get('url')).toContain('eh=');
    expect(new URL(google.getAttribute('href')!).searchParams.get('cid')).toContain('eh=');
    expect((screen.getByLabelText(/paste this link/i) as HTMLInputElement).value).toContain('eh=');
    rerender(<SubscribeFeed planSearch={privateQuery + '&w=10'} origin={ORIGIN} />);
    expect(screen.queryByRole('link', { name: /Google Calendar/ })).toBeNull();
    expect(screen.queryByLabelText(/paste this link/i)).toBeNull();
  });
});
