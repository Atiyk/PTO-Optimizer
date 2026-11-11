import { describe, expect, it } from 'vitest';
import { addDays } from '@daysoff/engine/solver/dateUtils';
import { requestByDate } from '@daysoff/engine/calendar/requestDeadline';
import { buildPlanFeedICS, holidayEventLines, MAX_FEED_QUERY_LENGTH } from './feed';
import type { HolidaySource } from './planFromSearch';
import { diskHolidays } from './feedTestHolidays';
import { generateICS } from '../ui/icsExport';
import { encodeEmployerCalendar } from '../personal/employerCalendar';

const disk: HolidaySource = diskHolidays;
const TODAY = '2026-11-04';
const SEARCH = '?c=US&s=2026-11-04&e=2027-12-31&b=20&rv=0';

function feed(search = SEARCH, today = TODAY) {
  const result = buildPlanFeedICS(search, today, disk);
  if (!result.ok) throw new Error(result.message);
  return result;
}

/** Unfolds RFC 5545 continuation lines and splits into VEVENT blocks. */
function events(ics: string): string[][] {
  const lines = ics.replace(/\r\n /g, '').split('\r\n');
  const out: string[][] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') current = [];
    else if (line === 'END:VEVENT' && current) { out.push(current); current = null; }
    else if (current) current.push(line);
  }
  return out;
}
const prop = (event: string[], name: string) => event.find((l) => l.startsWith(`${name}:`) || l.startsWith(`${name};`));

describe('buildPlanFeedICS: calendar shape', () => {
  it('is a CRLF calendar with refresh hints and a deterministic DTSTAMP', () => {
    const { ics } = feed();
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(/(?<!\r)\n/.test(ics)).toBe(false);
    expect(ics).toContain('\r\nREFRESH-INTERVAL;VALUE=DURATION:PT12H\r\n');
    expect(ics).toContain('\r\nX-PUBLISHED-TTL:PT12H\r\n');
    expect(ics).toContain('DTSTAMP:20261104T000000Z');
    expect(feed().ics).toBe(feed().ics);
  });

  it('every line is at most 75 octets and every UID is unique', () => {
    const { ics } = feed();
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    const uids = events(ics).map((e) => prop(e, 'UID'));
    expect(uids.length).toBeGreaterThan(10);
    expect(new Set(uids).size).toBe(uids.length);
  });

  it('uses exclusive DTEND for every all-day event', () => {
    for (const event of events(feed().ics)) {
      const start = prop(event, 'DTSTART')!.split(':')[1];
      const end = prop(event, 'DTEND')!.split(':')[1];
      const iso = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
      expect(iso(end)).toBe(addDays(iso(start), 1));
    }
  });
});

describe('buildPlanFeedICS: same events as the downloaded .ics', () => {
  it('PTO-day and book-by events are byte-identical to generateICS on the same day', () => {
    const result = feed();
    // The download uses the viewer's local date, so it is made at local noon on TODAY; DTSTAMP
    // (the moment of export) is the only line allowed to differ.
    const [y, m, d] = TODAY.split('-').map(Number);
    const download = generateICS(result.plan.breaks, result.plan.isPtoDay, new Date(y, m - 1, d, 12), {
      enabled: true, leadDays: 14, workWeek: result.plan.state.workWeek, offDays: result.plan.solveInput.offDays,
    });
    const body = (ics: string) => ics.slice(ics.indexOf('BEGIN:VEVENT'), ics.lastIndexOf('END:VEVENT')).replace(/^DTSTAMP:.*$/gm, 'DTSTAMP');
    expect(body(result.ics)).toContain(body(download));
    expect(events(result.ics).filter((e) => prop(e, 'UID')!.startsWith('UID:pto-')).length).toBe(events(download).length);
  });

  it('PTO-day UIDs and titles match the download scheme', () => {
    const { ics, plan } = feed();
    const first = plan.breaks[0];
    const day = first.days.find(plan.isPtoDay)!;
    expect(ics).toContain(`UID:pto-${day.replace(/-/g, '')}@pto-optimizer.app`);
    expect(ics.replace(/\r\n /g, '')).toMatch(/SUMMARY:PTO \(\w{3} \d+/);
  });
});

describe('F2 book-by events', () => {
  it('honours a working-day notice unit (nu=w) with the same canonical deadline as the card', () => {
    const { ics, plan } = feed(`${SEARCH}&np=8&nu=w`);
    expect(plan.state.noticeUnit).toBe('working');
    const reminders = events(ics).filter((e) => prop(e, 'UID')!.startsWith('UID:pto-reminder-'));
    for (const brk of plan.breaks.filter((b) => b.start > TODAY)) {
      const bookBy = requestByDate(brk.start, 8, plan.state.workWeek, plan.solveInput.offDays, 'working')!;
      const expected = (bookBy < TODAY ? TODAY : bookBy).replace(/-/g, '');
      expect(reminders.some((e) => prop(e, 'DTSTART') === `DTSTART;VALUE=DATE:${expected}`)).toBe(true);
    }
    expect(reminders.length).toBeGreaterThan(0);
  });

  it('one per future break, shifted to a working date from the link schedule', () => {
    const { ics, plan } = feed(`${SEARCH}&np=21`);
    const future = plan.breaks.filter((b) => b.start > TODAY);
    const reminders = events(ics).filter((e) => prop(e, 'UID')!.startsWith('UID:pto-reminder-'));
    expect(reminders.length).toBe(future.length);
    for (const brk of future) {
      const bookBy = requestByDate(brk.start, 21, plan.state.workWeek, plan.solveInput.offDays)!;
      const expected = (bookBy < TODAY ? TODAY : bookBy).replace(/-/g, '');
      expect(reminders.some((e) => prop(e, 'DTSTART') === `DTSTART;VALUE=DATE:${expected}`)).toBe(true);
    }
  });

  it('titles name the deadline, and carry alarms at 9:00 a week before and on the day', () => {
    const result = feed('?c=US&s=2027-03-01&e=2027-12-31&b=10&rv=0');
    const reminder = events(result.ics).find((e) => prop(e, 'UID')!.startsWith('UID:pto-reminder-'))!;
    expect(prop(reminder, 'SUMMARY')).toMatch(/^SUMMARY:Request time off: .+ \(book by \w{3} \d+\)$/);
    expect(prop(reminder, 'DESCRIPTION')).toMatch(/Book by \w{3} \d+ to give 14 days of notice\./);
    expect(reminder).toContain('TRIGGER:-P6DT15H');
    expect(reminder).toContain('TRIGGER:PT9H');
    expect(reminder.filter((l) => l === 'BEGIN:VALARM').length).toBe(2);
  });

  it('a break inside the notice window gets a "book now" event today, without a past alarm', () => {
    const result = feed('?c=US&s=2026-11-10&e=2026-11-30&b=3&rv=0&p=2026-11-12&np=30');
    const reminders = events(result.ics).filter((e) => prop(e, 'UID')!.startsWith('UID:pto-reminder-'));
    expect(reminders.length).toBeGreaterThan(0);
    for (const r of reminders) {
      expect(prop(r, 'DTSTART')).toBe('DTSTART;VALUE=DATE:20261104');
      expect(prop(r, 'SUMMARY')).toContain('(book now)');
      expect(r).not.toContain('TRIGGER:-P6DT15H');
      expect(r).toContain('TRIGGER:PT9H');
    }
  });

  it('book-by dates are re-derived against today on each fetch', () => {
    const search = '?c=US&s=2026-11-10&e=2026-12-31&b=5&rv=0&p=2026-12-14';
    const early = events(feed(search, '2026-11-10').ics).filter((e) => prop(e, 'UID')!.startsWith('UID:pto-reminder-'));
    const late = events(feed(search, '2026-12-05').ics).filter((e) => prop(e, 'UID')!.startsWith('UID:pto-reminder-'));
    expect(early.some((e) => prop(e, 'SUMMARY')!.includes('book by'))).toBe(true);
    // The pinned Monday Dec 14 now includes its free weekend: the break is Sat Dec 12-Mon
    // Dec 14 (issue 5). Notice is counted from Monday Dec 14, the first day actually away.
    const dec14 = (list: string[][]) => list.find((e) => prop(e, 'SUMMARY')!.includes('Dec 12 – 14'))!;
    expect(prop(dec14(early), 'SUMMARY')).toBe('SUMMARY:Request time off: Dec 12 – 14 (book by Nov 30)');
    expect(prop(dec14(late), 'SUMMARY')).toBe('SUMMARY:Request time off: Dec 12 – 14 (book now)');
    expect(prop(dec14(late), 'DTSTART')).toBe('DTSTART;VALUE=DATE:20261205');
  });

  it('no book-by event for a break that already started', () => {
    const result = feed('?c=US&s=2026-11-02&e=2026-11-04&b=1&rv=0&p=2026-11-03');
    expect(events(result.ics).filter((e) => prop(e, 'UID')!.startsWith('UID:pto-reminder-'))).toEqual([]);
  });
});

describe('holidays in the feed', () => {
  it('includes the public holidays the plan counts as off', () => {
    const { ics } = feed();
    expect(ics).toContain('UID:holiday-20261126-US@pto-optimizer.app');
    expect(ics).toContain('SUMMARY:Thanksgiving Day');
  });

  it('honours the dates in a legacy employer calendar without exposing its labels', () => {
    const eh = encodeEmployerCalendar({ version: 1, country: 'US', excluded: ['2026-11-26|Thanksgiving Day'], custom: [{ date: '2026-12-24', name: 'Office closed; eve, "early"\\ off' }] });
    const { ics } = feed(`${SEARCH}&eh=${encodeURIComponent(eh)}`);
    expect(ics).not.toContain('UID:holiday-20261126-US');
    expect(ics).toContain('UID:holiday-20271125-US'); // only the excluded year's entry
    expect(ics).toContain('SUMMARY:Employer-observed day off');
    expect(ics).not.toContain('Office closed');
  });

  it('merges two holidays on one date into one event with a unique UID', () => {
    const lines = holidayEventLines([
      { date: '2027-01-01', name: 'A', source: 'public', checked: true },
      { date: '2027-01-01', name: 'B', source: 'state', checked: true },
      { date: '2027-01-02', name: 'C', source: 'public', checked: false },
    ], 'US', '20261104T000000Z');
    expect(lines.filter((l) => l.startsWith('UID:'))).toEqual(['UID:holiday-20270101-US@pto-optimizer.app']);
    expect(lines).toContain('SUMMARY:A / B');
  });

  it('folds a long holiday name', () => {
    const name = 'A very long company holiday name that keeps going well past the limit';
    const lines = holidayEventLines([{ date: '2026-12-24', name, source: 'public', checked: true }], 'US', '20261104T000000Z');
    expect(lines.join('\r\n')).toContain('\r\n ');
    expect(lines.join('\r\n').replace(/\r\n /g, '')).toContain(`SUMMARY:${name}`);
  });
});

describe('input bounds', () => {
  it(`rejects a query over ${MAX_FEED_QUERY_LENGTH} characters`, () => {
    const result = buildPlanFeedICS(`${SEARCH}&x=${'a'.repeat(MAX_FEED_QUERY_LENGTH)}`, TODAY, disk);
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it.each([
    ['an invalid start date', '?c=US&s=2026-02-30&e=2026-12-31&b=10'],
    ['an invalid end date', '?c=US&s=2026-11-04&e=nope&b=10'],
    ['a range over ten years', '?c=US&s=2027-01-01&e=2038-01-02&b=10'],
    ['a negative balance falls back, but an absurd one is rejected', '?c=US&s=2027-01-01&e=2027-12-31&b=400&rv=0&ex=1&xd=2028-06-01'],
  ])('rejects %s', (_label, search) => {
    const result = buildPlanFeedICS(search, TODAY, disk);
    expect(result.ok).toBe(false);
  });

  it('clamps an end before the start to one day, as the planner does', () => {
    const result = buildPlanFeedICS('?c=US&s=2027-05-03&e=2027-01-01&b=10', TODAY, disk);
    expect(result.ok && [result.plan.state.rangeStart, result.plan.state.rangeEnd]).toEqual(['2027-05-03', '2027-05-03']);
  });

  it('rejects an invalid today', () => {
    expect(buildPlanFeedICS(SEARCH, '2026-13-01', disk)).toMatchObject({ ok: false, status: 400 });
  });

  it('ignores unknown country codes rather than reading arbitrary files', () => {
    const seen: string[] = [];
    const result = buildPlanFeedICS('?c=../../etc&s=2027-01-01&e=2027-12-31&b=10', TODAY, (c, y) => { seen.push(`${c}-${y}`); return null; });
    expect(seen).toEqual([]);
    expect(result.ok).toBe(true);
  });
});
