import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ExportBar } from './ExportBar';
import { encodeEmployerCalendar } from '../personal/employerCalendar';
import { PLAN_SHARE_KEYS } from './shareFormat';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('actual Copy link action protects private employer details', () => {
  it('copies a privacy-safe URL, not the eh-bearing browser address', async () => {
    const raw = encodeEmployerCalendar({
      version: 1, country: 'US',
      excluded: ['2027-12-24|PRIVATE_POLICY_EXCLUSION'],
      custom: [{ date: '2027-12-27', name: 'PRIVATE_EMPLOYER_POLICY_TITLE' }],
    });
    const search = 'c=US&s=2027-01-01&e=2027-12-31&b=12&bo=2027-12-26&od=2027-12-28&eh=' + encodeURIComponent(raw);
    window.history.replaceState(null, '', '/pto?' + search + '#PRIVATE_FRAGMENT');
    const writeText = vi.fn(async (_text: string) => {});
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<ExportBar
      breaks={[]} isSuggestedPto={() => false} categoryOf={() => 'outside' as never}
      rangeStart="2027-01-01" rangeEnd="2027-12-31" weekStart={1}
      budgetSpent={0} totalDaysOff={0} travelPercentile={null} efficiencyPercentile={null}
      noticePeriodDays={14} onPlanWithPartner={() => {}} planSearch={search}
      observedHolidayDates={['2027-12-27', '2027-07-05']}
    />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy plan link' })); });
    expect(writeText).toHaveBeenCalledTimes(1);
    const copied = String(writeText.mock.calls[0][0]);
    const copiedURL = new URL(copied);
    expect(copiedURL.searchParams.get('b')).toBe('12');
    expect(copied).not.toMatch(/PRIVATE_|[?&](eh|bo|od|ho)=|#/);
    expect(screen.getByRole('button', { name: /Copied \(calendar omitted\)/i })).toBeTruthy();
    fireEvent.click(screen.getByText('Send your holiday dates with the link', { selector: 'summary' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy link with holiday dates' })); });
    expect(writeText).toHaveBeenCalledTimes(2);
    const optedIn = String(writeText.mock.calls[1][0]);
    expect(new URL(optedIn).searchParams.get('ho')).toBe('2027-07-05,2027-12-27');
    expect(optedIn).not.toMatch(/PRIVATE_|[?&](eh|bo|od)=|#/);
    window.history.replaceState(null, '', '/');
  });

  it('copies and subscribes with share-format keys only when the plan carries every private setting', async () => {
    const search = 'c=US&s=2027-01-01&e=2027-06-30&b=12&w=30&count=0&rv=1&p=2027-02-02'
      + '&r=2027-02-09&bo=2027-03-03&od=2027-03-04&ac=1&am=1.5&ex=1&xd=2027-05-01&cc=2&np=21'
      + '&pc=1&pcs=2027-04-01&pce=2027-04-30&pcm=2&up=1&pp=PRIVATE_PARTNER&ov=2027-03-05';
    window.history.replaceState(null, '', '/pto?' + search);
    const writeText = vi.fn(async (_text: string) => {});
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<ExportBar
      breaks={[]} isSuggestedPto={() => false} categoryOf={() => 'outside' as never}
      rangeStart="2027-01-01" rangeEnd="2027-06-30" weekStart={1}
      budgetSpent={0} totalDaysOff={0} travelPercentile={null} efficiencyPercentile={null}
      noticePeriodDays={21} onPlanWithPartner={() => {}} planSearch={search}
    />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy plan link' })); });
    const copied = new URL(String(writeText.mock.calls[0][0]));
    const allowed = new Set<string>(PLAN_SHARE_KEYS);
    expect([...copied.searchParams.keys()].filter(key => !allowed.has(key))).toEqual([]);
    expect(copied.searchParams.get('p')).toBe('2027-02-02');
    expect(copied.href).not.toMatch(/PRIVATE|2027-03-0[345]|2027-02-09|2027-05-01|2027-04-/);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Use public holidays' })); });
    const feedHrefs = screen.getAllByRole('link').map(link => link.getAttribute('href') ?? '').filter(href => href.includes('api%2Ffeed') || href.includes('/api/feed'));
    expect(feedHrefs.length).toBeGreaterThan(0);
    for (const href of feedHrefs) {
      expect(decodeURIComponent(href)).not.toMatch(/PRIVATE|[?&](r|bo|od|ov|pp|ac|am|ex|xd|cc|np|pc|pcs|pce|pcm|up)=/);
    }
    window.history.replaceState(null, '', '/');
  });
});
