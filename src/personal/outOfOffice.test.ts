import { describe, expect, it } from 'vitest';
import { DEFAULT_WORK_WEEK, type WorkWeek } from '@daysoff/engine/solver/types';
import { requestByDate } from '@daysoff/engine/calendar/requestDeadline';
import { DEFAULT_NOTICE_PERIOD_DAYS, OOO_PLACEHOLDERS, formatOooDate, outOfOfficeMessage, returnToWorkDate, submitByDate } from './outOfOffice';
import { generateOutOfOfficeICS } from '../ui/icsExport';

const calendar = { workWeek: DEFAULT_WORK_WEEK, offDays: ['2026-12-25', '2027-01-01'] };
const NOW = new Date('2026-11-04T10:00:00Z');

describe('returnToWorkDate', () => {
  it('skips the weekend and employer holidays after the last day', () => {
    expect(returnToWorkDate('2026-12-24', calendar)).toBe('2026-12-28'); // Thu -> Fri 25 holiday -> Mon 28
    expect(returnToWorkDate('2026-12-31', calendar)).toBe('2027-01-04'); // Jan 1 holiday, then weekend
  });
  it('is the next day when that is a working day', () => expect(returnToWorkDate('2026-12-21', calendar)).toBe('2026-12-22'));
  it('follows a custom work week (Tue-Sat)', () => {
    const tueSat: WorkWeek = [false, true, true, true, true, true, false];
    expect(returnToWorkDate('2026-12-19', { workWeek: tueSat, offDays: [] })).toBe('2026-12-22'); // Sat -> Tue
  });
  it('falls back to the next day for an empty work week', () => {
    expect(returnToWorkDate('2026-12-19', { workWeek: [false, false, false, false, false, false, false], offDays: [] })).toBe('2026-12-20');
  });
});

describe('outOfOfficeMessage', () => {
  it('states the dates, the return date and editable placeholders', () => {
    const message = outOfOfficeMessage({ start: '2026-12-22', end: '2026-12-24' }, calendar);
    expect(message).toContain("I'm out of the office from Tuesday, December 22, 2026 through Thursday, December 24, 2026");
    expect(message).toContain("I'll be back on Monday, December 28, 2026");
    expect(message).toContain(`please contact ${OOO_PLACEHOLDERS.contactName} at ${OOO_PLACEHOLDERS.contactDetail}`);
    expect(message.endsWith(OOO_PLACEHOLDERS.yourName)).toBe(true);
  });
  it('fills names when given and handles a single day', () => {
    const message = outOfOfficeMessage({ start: '2026-12-22', end: '2026-12-22' }, calendar, { contactName: 'Priya', contactDetail: 'priya@example.com', yourName: 'Sam' });
    expect(message).toContain('on Tuesday, December 22, 2026,');
    expect(message).toContain('please contact Priya at priya@example.com.');
    expect(message).not.toContain('[');
    expect(message.endsWith('Sam')).toBe(true);
  });
  it('is deterministic', () => {
    expect(outOfOfficeMessage({ start: '2026-12-22', end: '2026-12-24' }, calendar)).toBe(outOfOfficeMessage({ start: '2026-12-22', end: '2026-12-24' }, calendar));
    expect(formatOooDate('2027-01-04')).toBe('Monday, January 4, 2027');
  });
});

describe('submitByDate', () => {
  it('is start minus the notice period, moved back to a working day', () => {
    expect(submitByDate('2026-12-22', 14, DEFAULT_WORK_WEEK)).toBe('2026-12-08');
    expect(submitByDate('2026-12-22', 16, DEFAULT_WORK_WEEK)).toBe('2026-12-04'); // Sun Dec 6 -> Fri Dec 4
  });
  it('matches the engine request-by date used by break cards and the .ics reminder', () => {
    for (const notice of [0, 7, 14, 30]) expect(submitByDate('2027-07-05', notice, DEFAULT_WORK_WEEK)).toBe(requestByDate('2027-07-05', notice, DEFAULT_WORK_WEEK));
  });
  it('uses the default notice period for an invalid value', () => {
    expect(DEFAULT_NOTICE_PERIOD_DAYS).toBe(14);
    expect(submitByDate('2026-12-22', Number.NaN, DEFAULT_WORK_WEEK)).toBe('2026-12-08');
    expect(submitByDate('2026-12-22', -3, DEFAULT_WORK_WEEK)).toBe('2026-12-08');
  });
});

describe('generateOutOfOfficeICS', () => {
  const ics = generateOutOfOfficeICS({ requestId: 'winter-1', start: '2026-12-22', end: '2026-12-24', description: 'Back on Monday, December 28, 2026.' }, NOW);
  const lines = ics.split('\r\n');
  it('is a CRLF calendar with one busy, out-of-office, all-day event', () => {
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    expect(lines.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(1);
    expect(lines).toContain('DTSTART;VALUE=DATE:20261222');
    expect(lines).toContain('DTEND;VALUE=DATE:20261225'); // exclusive
    expect(lines).toContain('SUMMARY:Out of office');
    expect(lines).toContain('TRANSP:OPAQUE');
    expect(lines).toContain('X-MICROSOFT-CDO-BUSYSTATUS:OOF');
    expect(lines).toContain('DTSTAMP:20261104T100000Z');
    expect(lines).toContain('DESCRIPTION:Back on Monday\\, December 28\\, 2026.');
  });
  it('has a UID unique per request and stable across downloads', () => {
    const uid = lines.find((l) => l.startsWith('UID:'));
    expect(uid).toBe('UID:ooo-winter-1-20261222-20261224@pto-optimizer.app');
    const other = generateOutOfOfficeICS({ requestId: 'winter-2', start: '2026-12-22', end: '2026-12-24' }, NOW).split('\r\n').find((l) => l.startsWith('UID:'));
    expect(other).not.toBe(uid);
    expect(generateOutOfOfficeICS({ requestId: 'winter-1', start: '2026-12-22', end: '2026-12-24', description: 'Back on Monday, December 28, 2026.' }, NOW)).toBe(ics);
  });
  it('escapes text and cannot be broken by carriage returns or long text', () => {
    const hostile = generateOutOfOfficeICS({ requestId: 'x;y\r\nUID:evil', start: '2026-12-22', end: '2026-12-22', description: 'a;b,c\r\nBEGIN:VEVENT\r' + 'z'.repeat(300) }, NOW);
    const hostileLines = hostile.split('\r\n');
    expect(hostileLines.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(1);
    expect(hostileLines.filter((l) => l.startsWith('UID:'))).toEqual(['UID:ooo-xyUIDevil-20261222-20261222@pto-optimizer.app']);
    expect(hostileLines.every((l) => l.length <= 75)).toBe(true);
    expect(hostile).toContain('DESCRIPTION:a\\;b\\,c\\nBEGIN:VEVENT\\n');
  });
  it('writes no event for invalid dates', () => {
    expect(generateOutOfOfficeICS({ requestId: 'a', start: '2026-12-24', end: '2026-12-22' }, NOW)).not.toContain('BEGIN:VEVENT');
    expect(generateOutOfOfficeICS({ requestId: 'a', start: 'nope', end: '2026-12-22' }, NOW)).not.toContain('BEGIN:VEVENT');
  });
});
