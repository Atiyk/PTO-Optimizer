import { describe, it, expect } from 'vitest';
import { generateICS } from './icsExport';
import type { Break } from '@daysoff/engine/solver/types';

function makeBreak(overrides: Partial<Break> = {}): Break {
  return {
    id: '2026-10-24|2026-11-01',
    start: '2026-10-24',
    end: '2026-11-01',
    days: ['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'],
    totalDaysOff: 9,
    ptoCost: 5,
    multiplier: 1.8,
    tags: [],
    meanDemand: 1.0,
    ...overrides,
  };
}

const FIXED_NOW = new Date('2026-10-18T12:00:00Z');

describe('generateICS', () => {
  it('wraps content in a single VCALENDAR with the required calendar properties', () => {
    const ics = generateICS([], () => false, FIXED_NOW);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('VERSION:2.0\r\n');
    expect(ics).toContain('PRODID:');
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
  });

  it('creates one all-day VEVENT per suggested-PTO day, not per calendar day in the break', () => {
    const ptoDays = new Set(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30']);
    const ics = generateICS([makeBreak()], (iso) => ptoDays.has(iso), FIXED_NOW);
    const eventCount = (ics.match(/BEGIN:VEVENT/g) || []).length;
    expect(eventCount).toBe(5); // only the 5 PTO-cost days, not the weekend days in the break
  });

  it('uses DTSTART/DTEND as an exclusive all-day pair one day apart', () => {
    const ics = generateICS([makeBreak()], (iso) => iso === '2026-10-26', FIXED_NOW);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261026');
    expect(ics).toContain('DTEND;VALUE=DATE:20261027');
  });

  it('titles every event "PTO" plus the break\'s overall date range', () => {
    const ics = generateICS([makeBreak()], (iso) => iso === '2026-10-26', FIXED_NOW);
    expect(ics).toContain('SUMMARY:PTO (Oct 24 - Nov 1\\, 2026)'); // comma is escaped per RFC 5545
  });

  it('every event gets a unique UID and a DTSTAMP', () => {
    const ptoDays = new Set(['2026-10-26', '2026-10-27']);
    const ics = generateICS([makeBreak()], (iso) => ptoDays.has(iso), FIXED_NOW);
    const uids = [...ics.matchAll(/UID:([^\r\n]+)/g)].map((m) => m[1]);
    expect(new Set(uids).size).toBe(uids.length); // all unique
    expect(ics).toContain('DTSTAMP:20261018T120000Z');
  });

  it('a December-to-January break spanning a year boundary produces a correctly dated event and title', () => {
    const brk = makeBreak({
      start: '2026-12-28',
      end: '2027-01-03',
      days: ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03'],
    });
    const ics = generateICS([brk], (iso) => iso === '2026-12-30', FIXED_NOW);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261230');
    expect(ics).toContain('DTEND;VALUE=DATE:20261231');
    expect(ics).toContain('Dec 28\\, 2026 - Jan 3\\, 2027');
  });

  it('produces an empty-but-valid calendar when there is nothing to export', () => {
    const ics = generateICS([], () => false, FIXED_NOW);
    expect(ics).not.toContain('BEGIN:VEVENT');
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
  });

  it('every line is CRLF-terminated, per RFC 5545', () => {
    const ics = generateICS([makeBreak()], (iso) => iso === '2026-10-26', FIXED_NOW);
    expect(ics.includes('\n') && !ics.includes('\r\n')).toBe(false);
    // no bare LF without a preceding CR
    expect(/(?<!\r)\n/.test(ics)).toBe(false);
  });

  it('omits reminder events entirely when reminderOptions is left out (every existing call site)', () => {
    const ics = generateICS([makeBreak()], (iso) => iso === '2026-10-26', FIXED_NOW);
    expect(ics).not.toContain('Request time off');
    expect(ics).not.toContain('VALARM');
  });
});

describe('generateICS reminders', () => {
  it('omits reminders when explicitly disabled', () => {
    const ics = generateICS([makeBreak()], (iso) => iso === '2026-10-26', FIXED_NOW, { enabled: false, leadDays: 14 });
    expect(ics).not.toContain('Request time off');
  });

  it('places a reminder leadDays before the break start, titled with the break\'s range', () => {
    // break starts 2026-12-01, leadDays=14 -> reminder on 2026-11-17, well before today (2026-10-18)
    const brk = makeBreak({ start: '2026-12-01', end: '2026-12-09' });
    const ics = generateICS([brk], () => false, FIXED_NOW, { enabled: true, leadDays: 14 });
    expect(ics).toContain('DTSTART;VALUE=DATE:20261117');
    expect(ics).toContain('DTEND;VALUE=DATE:20261118');
    expect(ics).toContain('SUMMARY:Request time off: Dec 1 – 9');
  });

  it('includes the break\'s cost/payoff details in the reminder description', () => {
    const brk = makeBreak({ start: '2026-12-01', end: '2026-12-09', ptoCost: 5, totalDaysOff: 9, multiplier: 1.8 });
    const ics = generateICS([brk], () => false, FIXED_NOW, { enabled: true, leadDays: 14 });
    expect(ics).toContain('DESCRIPTION:5 PTO days -> 9 days off (1.80x).');
  });

  it('attaches a VALARM so the reminder actually notifies, not just sits silently on the calendar', () => {
    const brk = makeBreak({ start: '2026-12-01', end: '2026-12-09' });
    const ics = generateICS([brk], () => false, FIXED_NOW, { enabled: true, leadDays: 14 });
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics).toContain('ACTION:DISPLAY');
    expect(ics).toContain('TRIGGER:PT0S');
    expect(ics).toContain('END:VALARM');
  });

  it('adjustable lead time: 7 and 30 days produce different reminder dates for the same break', () => {
    const brk = makeBreak({ start: '2026-12-01', end: '2026-12-09' });
    const ics7 = generateICS([brk], () => false, FIXED_NOW, { enabled: true, leadDays: 7 });
    const ics30 = generateICS([brk], () => false, FIXED_NOW, { enabled: true, leadDays: 30 });
    expect(ics7).toContain('DTSTART;VALUE=DATE:20261124'); // Dec 1 - 7 days
    expect(ics30).toContain('DTSTART;VALUE=DATE:20261101'); // Dec 1 - 30 days
  });

  it('clamps the reminder to today rather than placing it in the past, when the break starts inside the lead-time window', () => {
    // today = 2026-10-18, break starts 2026-10-24 (6 days away) - naive leadDays=14 would be
    // 2026-10-10, nine days in the PAST. Must clamp to today, not that past date.
    const brk = makeBreak({ start: '2026-10-24', end: '2026-11-01' });
    const ics = generateICS([brk], () => false, FIXED_NOW, { enabled: true, leadDays: 14 });
    expect(ics).toContain('DTSTART;VALUE=DATE:20261018'); // today, not 20261010
    expect(ics).not.toContain('DTSTART;VALUE=DATE:20261010');
  });

  it('suppresses the reminder entirely once the break itself has already started', () => {
    // today = 2026-10-18; a break starting on or before today has nothing left to "request".
    const started = makeBreak({ start: '2026-10-10', end: '2026-10-20' });
    const startsToday = makeBreak({ start: '2026-10-18', end: '2026-10-22', id: '2026-10-18|2026-10-22' });
    const ics = generateICS([started, startsToday], () => false, FIXED_NOW, { enabled: true, leadDays: 14 });
    expect(ics).not.toContain('Request time off');
  });

  it('gives one reminder per break, not per PTO day', () => {
    const brk1 = makeBreak({ start: '2026-12-01', end: '2026-12-09', id: 'a' });
    const brk2 = makeBreak({ start: '2026-12-15', end: '2026-12-20', id: 'b' });
    const ics = generateICS([brk1, brk2], () => false, FIXED_NOW, { enabled: true, leadDays: 14 });
    const reminderCount = (ics.match(/SUMMARY:Request time off/g) || []).length;
    expect(reminderCount).toBe(2); // one reminder event per break, regardless of its length
  });

  it('every reminder UID is unique and distinct from the PTO-day event UIDs', () => {
    const brk = makeBreak({ start: '2026-12-01', end: '2026-12-09' });
    const ics = generateICS([brk], (iso) => iso === '2026-12-02', FIXED_NOW, { enabled: true, leadDays: 14 });
    const uids = [...ics.matchAll(/UID:([^\r\n]+)/g)].map((m) => m[1]);
    expect(new Set(uids).size).toBe(uids.length);
    expect(uids.some((u) => u.startsWith('pto-reminder-'))).toBe(true);
  });
});
