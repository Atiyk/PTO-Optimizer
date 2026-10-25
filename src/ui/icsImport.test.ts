import { describe, it, expect } from 'vitest';
import { parseICSBusyDays, IcsParseError, MAX_IMPORT_EVENTS } from './icsImport';

function wrapCalendar(events: string): string {
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//EN\r\n${events}END:VCALENDAR\r\n`;
}

function event(props: string): string {
  return `BEGIN:VEVENT\r\n${props}\r\nEND:VEVENT\r\n`;
}

describe('parseICSBusyDays: malformed input', () => {
  it('throws IcsParseError for a file with no BEGIN:VCALENDAR at all', () => {
    expect(() => parseICSBusyDays('this is not a calendar file, just some text')).toThrow(IcsParseError);
  });

  it('does not throw on an empty-but-valid calendar - just finds nothing', () => {
    const result = parseICSBusyDays(wrapCalendar(''));
    expect(result.busyDays).toEqual([]);
    expect(result.eventCount).toBe(0);
  });

  it('skips a VEVENT with no DTSTART at all, rather than crashing', () => {
    const ics = wrapCalendar(event('SUMMARY:No dates here'));
    const result = parseICSBusyDays(ics);
    expect(result.busyDays).toEqual([]);
  });
});

describe('parseICSBusyDays: all-day and multi-day events', () => {
  it('a single all-day event (VALUE=DATE, no DTEND) counts as one busy day', () => {
    const ics = wrapCalendar(event('DTSTART;VALUE=DATE:20261219'));
    const result = parseICSBusyDays(ics);
    expect(result.busyDays).toEqual(['2026-12-19']);
  });

  it('a multi-day all-day event uses DTEND as EXCLUSIVE, per RFC 5545', () => {
    // Dec 19 through Dec 27 inclusive = DTEND 20261228 (the day after the last busy day).
    const ics = wrapCalendar(event('DTSTART;VALUE=DATE:20261219\r\nDTEND;VALUE=DATE:20261228'));
    const result = parseICSBusyDays(ics);
    expect(result.busyDays[0]).toBe('2026-12-19');
    expect(result.busyDays[result.busyDays.length - 1]).toBe('2026-12-27');
    expect(result.busyDays).toHaveLength(9);
    expect(result.busyDays).not.toContain('2026-12-28');
  });

  it('an all-day event expressed with DURATION instead of DTEND', () => {
    const ics = wrapCalendar(event('DTSTART;VALUE=DATE:20261219\r\nDURATION:P3D'));
    const result = parseICSBusyDays(ics);
    expect(result.busyDays).toEqual(['2026-12-19', '2026-12-20', '2026-12-21']);
  });

  it('deduplicates and sorts busy days across multiple overlapping/unordered events', () => {
    const ics = wrapCalendar(
      event('DTSTART;VALUE=DATE:20261225') + event('DTSTART;VALUE=DATE:20261219\r\nDTEND;VALUE=DATE:20261221'),
    );
    const result = parseICSBusyDays(ics);
    expect(result.busyDays).toEqual(['2026-12-19', '2026-12-20', '2026-12-25']);
  });
});

describe('parseICSBusyDays: timed events - the 24-hour filter', () => {
  it('ignores a short 30-minute timed meeting entirely', () => {
    const ics = wrapCalendar(event('DTSTART:20261219T090000Z\r\nDTEND:20261219T093000Z'));
    const result = parseICSBusyDays(ics);
    expect(result.busyDays).toEqual([]);
  });

  it('ignores a long but still sub-24-hour timed event (an 8-hour conference day)', () => {
    const ics = wrapCalendar(event('DTSTART:20261219T090000Z\r\nDTEND:20261219T170000Z'));
    const result = parseICSBusyDays(ics);
    expect(result.busyDays).toEqual([]);
  });

  it('counts a timed event that genuinely spans 24 hours or more', () => {
    // 09:00 Dec 19 -> 09:00 Dec 21 = exactly 48 hours.
    const ics = wrapCalendar(event('DTSTART:20261219T090000Z\r\nDTEND:20261221T090000Z'));
    const result = parseICSBusyDays(ics);
    expect(result.busyDays).toEqual(['2026-12-19', '2026-12-20', '2026-12-21']);
  });

  it('counts a timed event right at the 24-hour boundary', () => {
    const ics = wrapCalendar(event('DTSTART:20261219T090000Z\r\nDTEND:20261220T090000Z'));
    const result = parseICSBusyDays(ics);
    expect(result.busyDays).toEqual(['2026-12-19', '2026-12-20']);
  });

  it('ignores a timed event one minute short of 24 hours', () => {
    const ics = wrapCalendar(event('DTSTART:20261219T090000Z\r\nDTEND:20261220T085900Z'));
    const result = parseICSBusyDays(ics);
    expect(result.busyDays).toEqual([]);
  });

  it('a timed event with no DTEND and no DURATION is skipped (duration unknown, never guessed)', () => {
    const ics = wrapCalendar(event('DTSTART:20261219T090000Z'));
    const result = parseICSBusyDays(ics);
    expect(result.busyDays).toEqual([]);
  });
});

describe('parseICSBusyDays: recurring events', () => {
  it('a recurring event (RRULE present) is not expanded, and counted as skipped', () => {
    const ics = wrapCalendar(event('DTSTART;VALUE=DATE:20260105\r\nRRULE:FREQ=WEEKLY;COUNT=10'));
    const result = parseICSBusyDays(ics);
    expect(result.busyDays).toEqual([]);
    expect(result.skippedRecurring).toBe(1);
  });

  it('a mix of one recurring and one plain event: only the plain one contributes busy days', () => {
    const ics = wrapCalendar(
      event('DTSTART;VALUE=DATE:20260105\r\nRRULE:FREQ=WEEKLY;COUNT=10') +
        event('DTSTART;VALUE=DATE:20261219\r\nDTEND;VALUE=DATE:20261221'),
    );
    const result = parseICSBusyDays(ics);
    expect(result.busyDays).toEqual(['2026-12-19', '2026-12-20']);
    expect(result.skippedRecurring).toBe(1);
    expect(result.eventCount).toBe(2);
  });
});

describe('parseICSBusyDays: the event cap', () => {
  it('reports cappedAt and stops reading further events once the file exceeds MAX_IMPORT_EVENTS', () => {
    const many = Array.from({ length: MAX_IMPORT_EVENTS + 50 }, (_, i) => {
      const day = String((i % 27) + 1).padStart(2, '0');
      return event(`DTSTART;VALUE=DATE:202601${day}`);
    }).join('');
    const ics = wrapCalendar(many);
    const result = parseICSBusyDays(ics);
    expect(result.cappedAt).toBe(MAX_IMPORT_EVENTS);
    expect(result.eventCount).toBe(MAX_IMPORT_EVENTS);
  });

  it('cappedAt is null when the file is under the limit', () => {
    const ics = wrapCalendar(event('DTSTART;VALUE=DATE:20261219'));
    const result = parseICSBusyDays(ics);
    expect(result.cappedAt).toBeNull();
  });
});

describe('parseICSBusyDays: line folding (RFC 5545 long lines)', () => {
  it('unfolds a continuation line (CRLF + single leading space) before parsing', () => {
    // SUMMARY folded across two lines shouldn't break DTSTART parsing on the next real line.
    const ics = wrapCalendar(
      'BEGIN:VEVENT\r\nSUMMARY:A very long summary that got\r\n folded across two lines\r\nDTSTART;VALUE=DATE:20261219\r\nEND:VEVENT\r\n',
    );
    const result = parseICSBusyDays(ics);
    expect(result.busyDays).toEqual(['2026-12-19']);
  });
});

describe('parseICSBusyDays: real-world export shape (Google Calendar style)', () => {
  it('parses a realistic multi-event export with mixed event types correctly', () => {
    const ics = wrapCalendar(
      event('UID:1@google.com\r\nDTSTAMP:20261001T000000Z\r\nDTSTART;VALUE=DATE:20261224\r\nDTEND;VALUE=DATE:20270102\r\nSUMMARY:Winter break') +
        event('UID:2@google.com\r\nDTSTAMP:20261001T000000Z\r\nDTSTART:20261105T140000Z\r\nDTEND:20261105T150000Z\r\nSUMMARY:Standup') +
        event('UID:3@google.com\r\nDTSTAMP:20261001T000000Z\r\nDTSTART;VALUE=DATE:20261111\r\nDTEND;VALUE=DATE:20261112\r\nSUMMARY:Veterans Day'),
    );
    const result = parseICSBusyDays(ics);
    expect(result.busyDays).toContain('2026-12-24');
    expect(result.busyDays).toContain('2027-01-01');
    expect(result.busyDays).not.toContain('2027-01-02'); // DTEND exclusive
    expect(result.busyDays).toContain('2026-11-11');
    expect(result.busyDays).not.toContain('2026-11-05'); // the 1-hour standup is ignored
    expect(result.eventCount).toBe(3);
  });
});
