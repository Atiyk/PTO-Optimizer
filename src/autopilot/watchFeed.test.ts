import { describe, expect, it } from 'vitest';
import type { Holiday } from '@daysoff/engine/data/holidays';
import { buildWatchFeedICS, policyFromURLState, watchFeedHolidayYears, type WatchFeedHolidays } from './watchFeed';
import { readPolicyStateFromURL } from '../ui/policyUrlState';

const h = (date: string, name: string): Holiday => ({ date, nominalDate: date, name, countryCode: 'US', counties: null });
const US: Record<number, Holiday[]> = {
  2026: [h('2026-11-26', 'Thanksgiving Day'), h('2026-12-25', 'Christmas Day')],
  2027: [h('2027-01-01', "New Year's Day")],
  2028: [],
};
const holidays: WatchFeedHolidays = (country, year) => (country === 'US' ? US[year] ?? null : null);
// Front-loaded, calendar year, carry 5: 8 days on Oct 1 means 3 days expire on Jan 1.
const SEARCH = '?ak=fl&am=0&gd=2026-01-01&cc=5&cb=8&bao=2026-10-01&c=US';

function events(ics: string): string[] {
  return ics.split('BEGIN:VEVENT').slice(1);
}
function unfold(ics: string): string {
  return ics.replace(/\r\n /g, '');
}

describe('buildWatchFeedICS', () => {
  it('emits 60/30/7 reminders with alarms and one suggested event per rescue PTO day', () => {
    const result = buildWatchFeedICS(SEARCH, '2026-10-01', holidays);
    if (!result.ok) throw new Error(result.message);
    const ics = unfold(result.ics);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT12H\r\n');
    expect(ics).toContain('X-PUBLISHED-TTL:PT12H\r\n');
    expect(ics).toMatch(/X-WR-CALDESC:.*are stored on your device and are not included/);
    const all = events(ics);
    const reminders = all.filter((event) => event.includes('reminder'));
    expect(reminders.map((event) => event.match(/DTSTART;VALUE=DATE:(\d+)/)![1])).toEqual(['20261102', '20261202', '20261225']);
    for (const reminder of reminders) {
      expect(reminder).toContain('BEGIN:VALARM');
      expect(reminder).toContain('rechecked against today each time your calendar refreshes');
    }
    // A reminder names only the suggested breaks that have not started by its own date.
    expect(reminders[0]).toContain('Suggested: take');
    const rescue = all.filter((event) => event.includes('SUMMARY:Suggested: use expiring PTO'));
    expect(rescue).toHaveLength(3);
    for (const event of rescue) {
      expect(event).not.toContain('VALARM');
      const day = event.match(/DTSTART;VALUE=DATE:(\d+)/)![1];
      expect(day >= '20261001' && day <= '20261231').toBe(true);
      expect(['20261126', '20261225']).not.toContain(day);
      expect(event).toMatch(/DTEND;VALUE=DATE:\d{8}/);
    }
    const uids = all.map((event) => event.match(/UID:(.+)\r\n/)![1]);
    expect(new Set(uids).size).toBe(uids.length);
  });

  it('is byte-identical for the same today and uses a DTSTAMP derived from it', () => {
    const a = buildWatchFeedICS(SEARCH, '2026-10-01', holidays);
    const b = buildWatchFeedICS(SEARCH, '2026-10-01', holidays);
    expect(a).toEqual(b);
    expect(a.ok && a.ics).toContain('DTSTAMP:20261001T000000Z');
  });

  it('recomputes against today: past reminders drop out and suggestions move', () => {
    const later = buildWatchFeedICS(SEARCH, '2026-12-29', holidays);
    if (!later.ok) throw new Error(later.message);
    const ics = unfold(later.ics);
    expect(events(ics).filter((event) => event.includes('reminder'))).toHaveLength(0);
    const days = events(ics).filter((event) => event.includes('use expiring PTO')).map((event) => event.match(/DTSTART;VALUE=DATE:(\d+)/)![1]);
    expect(days).toEqual(['20261229', '20261230', '20261231']);
  });

  it('writes valid RFC 5545 lines: CRLF, ASCII, folded at 75 octets, escaped text', () => {
    const result = buildWatchFeedICS(SEARCH, '2026-10-01', holidays);
    if (!result.ok) throw new Error(result.message);
    expect(result.ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(result.ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    for (const line of result.ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(/^[\x20-\x7e\r\n]*$/.test(result.ics)).toBe(true);
    expect(unfold(result.ics)).toMatch(/DESCRIPTION:You could lose 3 days on Jan 1\\, 2027\./);
  });

  it('says when holidays were not available instead of failing', () => {
    const result = buildWatchFeedICS(SEARCH, '2026-10-01', () => null);
    expect(result.ok).toBe(true);
    expect(result.ok && unfold(result.ics)).toContain('Public holidays for 2026 were not available');
  });

  it('rejects oversize queries, missing balances, unknown countries and invalid policies', () => {
    expect(buildWatchFeedICS(`${SEARCH}&x=${'a'.repeat(4096)}`, '2026-10-01', holidays)).toMatchObject({ ok: false, status: 414 });
    expect(buildWatchFeedICS('?ak=fl&c=US', '2026-10-01', holidays)).toMatchObject({ ok: false, status: 400 });
    expect(buildWatchFeedICS(SEARCH.replace('c=US', 'c=ZZ'), '2026-10-01', holidays)).toMatchObject({ ok: false, status: 400 });
    expect(buildWatchFeedICS(SEARCH.replace('c=US', ''), '2026-10-01', holidays)).toMatchObject({ ok: false, status: 400 });
    expect(buildWatchFeedICS(`${SEARCH}&car=99&cm=a&cue=1&cub=2027-03-31`, '2026-10-01', holidays)).toMatchObject({ ok: false, status: 400 });
    expect(buildWatchFeedICS(SEARCH, '2026-02-30', holidays)).toMatchObject({ ok: false, status: 400 });
  });

  it('escapes hostile input rather than echoing it into calendar text', () => {
    const result = buildWatchFeedICS(`${SEARCH}&sd=US-CA%0D%0ABEGIN:VEVENT`, '2026-10-01', holidays);
    expect(result.ok).toBe(true);
    expect(result.ok && result.ics).not.toContain('US-CA\r\nBEGIN');
  });

  it('pins date defaults to today so a feed never depends on the server clock', () => {
    const state = readPolicyStateFromURL('ak=fl&am=10&gd=2026-01-01&cb=0&bao=2026-10-01&c=US', 'US');
    expect(policyFromURLState(state)).toMatchObject({ accrual: { kind: 'front-loaded', amount: 10 }, currentBalance: 0, balanceAsOf: '2026-10-01' });
    const noDate = buildWatchFeedICS('ak=fl&am=0&cc=5&cb=8&c=US', '2026-10-01', holidays);
    expect(noDate).toEqual(buildWatchFeedICS('ak=fl&am=0&cc=5&cb=8&c=US', '2026-10-01', holidays));
    expect(noDate.ok && noDate.ics).toContain('DTSTAMP:20261001T000000Z');
  });

  it('lists the holiday years a server should read', () => {
    expect(watchFeedHolidayYears('2026-11-04')).toEqual([2026, 2027, 2028]);
  });

  it('refuses an absurd hand-edited balance instead of printing Infinity days', () => {
    const result = buildWatchFeedICS(SEARCH.replace('cb=8', 'cb=1e308'), '2026-11-04', holidays);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });
});
