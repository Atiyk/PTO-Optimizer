import { describe, it, expect } from 'vitest';
import { parseICSBusyDays, IcsParseError, MAX_IMPORT_EVENTS, MAX_IMPORT_CHARS, MAX_IMPORT_SPAN_DAYS, MAX_IMPORT_BUSY_DAYS } from './icsImport';

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

describe('parseICSBusyDays: recurring events (issue 16: bounded expansion, see icsRecurrence.test.ts)', () => {
  it.each([
    ['RDATE;VALUE=DATE:20260112', ['2026-01-05', '2026-01-12']],
    ['EXDATE;VALUE=DATE:20260112', ['2026-01-05']],
    ['EXDATE;VALUE=DATE:20260105', []],
    ['RECURRENCE-ID;VALUE=DATE:20260112', ['2026-01-05']],
  ])('applies the recurrence component %s instead of skipping the event', (property, expected) => {
    const ics = wrapCalendar(event(`DTSTART;VALUE=DATE:20260105\r\n${property}`));
    const result = parseICSBusyDays(ics);
    expect(result.busyDays).toEqual(expected);
    expect(result.skippedRecurring).toBe(0);
  });

  it('a recurring event (RRULE with COUNT) is expanded, not skipped', () => {
    const ics = wrapCalendar(event('DTSTART;VALUE=DATE:20260105\r\nRRULE:FREQ=WEEKLY;COUNT=10'));
    const result = parseICSBusyDays(ics);
    expect(result.busyDays).toHaveLength(10);
    expect(result.busyDays[9]).toBe('2026-03-09');
    expect(result.skippedRecurring).toBe(0);
    expect(result.recurrence.expanded).toBe(1);
  });

  it('a mix of one unsupported recurring and one plain event: only the plain one contributes busy days', () => {
    const ics = wrapCalendar(
      event('DTSTART;VALUE=DATE:20260105\r\nRRULE:FREQ=MONTHLY;BYDAY=MO;BYSETPOS=2') +
        event('DTSTART;VALUE=DATE:20261219\r\nDTEND;VALUE=DATE:20261221'),
    );
    const result = parseICSBusyDays(ics);
    expect(result.busyDays).toEqual(['2026-12-19', '2026-12-20']);
    expect(result.skippedRecurring).toBe(1);
    expect(result.recurrence.unsupportedReasons).toEqual(['BYSETPOS']);
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

describe('parseICSBusyDays: bounded and fail-closed school/personal imports', () => {
  it('rejects oversized local files before unfolding or scanning events', () => {
    expect(() => parseICSBusyDays(wrapCalendar('X'.repeat(MAX_IMPORT_CHARS)))).toThrow(IcsParseError);
  });

  it('rejects truncated calendar wrappers instead of reporting an empty, complete import', () => {
    expect(() => parseICSBusyDays('BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261219\r\nEND:VEVENT\r\n')).toThrow(IcsParseError);
    expect(() => parseICSBusyDays('noise\r\n' + wrapCalendar(''))).toThrow(IcsParseError);
  });

  it('rejects nested and orphaned VEVENT boundaries instead of silently losing dates', () => {
    const nested = wrapCalendar(
      'BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261219\r\n'
      + 'BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261220\r\nEND:VEVENT\r\nEND:VEVENT\r\n',
    );
    expect(() => parseICSBusyDays(nested)).toThrow(IcsParseError);
    expect(() => parseICSBusyDays(wrapCalendar('END:VEVENT\r\n'))).toThrow(IcsParseError);
    expect(() => parseICSBusyDays(wrapCalendar(
      'BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261219\r\nEND:VEVENT\r\nEND:VEVENT\r\n',
    ))).toThrow(IcsParseError);
  });

  it('accepts a UTF-8 BOM without loosening complete-calendar validation', () => {
    const ics = '\uFEFF' + wrapCalendar(event('DTSTART;VALUE=DATE:20261219'));
    expect(parseICSBusyDays(ics).busyDays).toEqual(['2026-12-19']);
  });

  it('rejects unclosed VEVENTs instead of silently dropping their dates', () => {
    expect(() => parseICSBusyDays(wrapCalendar('BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261219\r\n'))).toThrow(IcsParseError);
  });

  it('rejects invalid calendar dates, leap dates and malformed date-time suffixes', () => {
    for (const date of ['20270229', '20261301', '20261219T250000Z', '20261219T090000Zgarbage']) {
      expect(() => parseICSBusyDays(wrapCalendar(event('DTSTART:' + date)))).toThrow(IcsParseError);
    }
    expect(parseICSBusyDays(wrapCalendar(event('DTSTART;VALUE=DATE:20280229'))).busyDays).toEqual(['2028-02-29']);
  });

  it('rejects invalid, reversed and mismatched all-day DTEND values', () => {
    for (const end of ['20261218', '20270229', '20261220T090000Z']) {
      expect(() => parseICSBusyDays(wrapCalendar(event('DTSTART;VALUE=DATE:20261219\r\nDTEND:' + end)))).toThrow(IcsParseError);
    }
  });

  it('rejects excessive event spans before range expansion', () => {
    expect(MAX_IMPORT_SPAN_DAYS).toBeLessThan(4000);
    expect(() => parseICSBusyDays(wrapCalendar(event('DTSTART;VALUE=DATE:20260101\r\nDTEND;VALUE=DATE:20990101')))).toThrow(IcsParseError);
    expect(() => parseICSBusyDays(wrapCalendar(event('DTSTART;VALUE=DATE:20260101\r\nDURATION:P999999D')))).toThrow(IcsParseError);
  });

  it('rejects invalid all-day durations and backwards timed ranges', () => {
    expect(() => parseICSBusyDays(wrapCalendar(event('DTSTART;VALUE=DATE:20261219\r\nDURATION:P2DT1H')))).toThrow(IcsParseError);
    expect(() => parseICSBusyDays(wrapCalendar(event('DTSTART:20261219T090000Z\r\nDTEND:20261218T090000Z')))).toThrow(IcsParseError);
  });

  it('caps distinct dates across multiple otherwise individually valid events', () => {
    expect(MAX_IMPORT_BUSY_DAYS).toBe(4000);
    const ics = wrapCalendar(
      event('DTSTART;VALUE=DATE:20200101\r\nDTEND;VALUE=DATE:20290101')
      + event('DTSTART;VALUE=DATE:20300101\r\nDTEND;VALUE=DATE:20330101'),
    );
    expect(() => parseICSBusyDays(ics)).toThrow(IcsParseError);
  });

  it('preserves ordinary school breaks spanning DST and academic-year boundaries', () => {
    const ics = wrapCalendar(
      event('DTSTART;VALUE=DATE:20270313\r\nDTEND;VALUE=DATE:20270316')
      + event('DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270102'),
    );
    expect(parseICSBusyDays(ics).busyDays).toEqual([
      '2026-12-31', '2027-01-01', '2027-03-13', '2027-03-14', '2027-03-15',
    ]);
  });

  it('does not reinterpret short meetings as all-day closures', () => {
    expect(parseICSBusyDays(wrapCalendar(event(
      'DTSTART:20270314T090000Z\r\nDTEND:20270314T100000Z',
    ))).busyDays).toEqual([]);
  });
});


describe('parseICSBusyDays: time-zone aware event boundaries', () => {
  it('does not overblock an exclusive midnight DTEND on a two-day UTC timed event', () => {
    const ics = wrapCalendar(event('DTSTART:20261219T000000Z\r\nDTEND:20261221T000000Z'));
    expect(parseICSBusyDays(ics).busyDays).toEqual(['2026-12-19', '2026-12-20']);
  });

  it('does not overblock midnight when a timed DURATION ends at midnight', () => {
    const ics = wrapCalendar(event('DTSTART:20261219T000000Z\r\nDURATION:P1D'));
    expect(parseICSBusyDays(ics).busyDays).toEqual(['2026-12-19']);
  });

  it('compares seconds precisely at the 24-hour timed-event threshold', () => {
    const ics = wrapCalendar(event('DTSTART:20261219T090000Z\r\nDTEND:20261220T085959Z'));
    expect(parseICSBusyDays(ics).busyDays).toEqual([]);
  });

  it('uses real IANA elapsed hours across spring-forward rather than a 24h wall-clock assumption', () => {
    const ics = wrapCalendar(event(
      'DTSTART;TZID=America/New_York:20270313T120000\r\nDTEND;TZID=America/New_York:20270314T120000',
    ));
    expect(parseICSBusyDays(ics).busyDays).toEqual([]); // 23 real hours
  });

  it('counts fall-back across 25 real hours and preserves event-local calendar days', () => {
    const ics = wrapCalendar(event(
      'DTSTART;TZID=America/New_York:20271106T120000\r\nDTEND;TZID=America/New_York:20271107T120000',
    ));
    expect(parseICSBusyDays(ics).busyDays).toEqual(['2027-11-06', '2027-11-07']);
  });

  it('fails closed for nonexistent, repeated or unknown IANA times rather than guessing busy days', () => {
    for (const start of [
      'DTSTART;TZID=America/New_York:20270314T023000', // spring gap
      'DTSTART;TZID=America/New_York:20271107T013000', // fall duplicate
      'DTSTART;TZID=Invalid/Timezone:20270313T120000',
    ]) {
      const ics = wrapCalendar(event(start + '\r\nDTEND;TZID=America/New_York:20270315T120000'));
      expect(() => parseICSBusyDays(ics)).toThrow(IcsParseError);
    }
  });

  it('fails closed for mismatched UTC and TZID endpoints', () => {
    const ics = wrapCalendar(event(
      'DTSTART;TZID=America/New_York:20270313T120000\r\nDTEND:20270314T160000Z',
    ));
    expect(() => parseICSBusyDays(ics)).toThrow(IcsParseError);
  });

  it('continues to support wall-clock floating DTSTART and DTEND without inventing a time zone', () => {
    const ics = wrapCalendar(event('DTSTART:20261219T090000\r\nDTEND:20261220T090000'));
    expect(parseICSBusyDays(ics).busyDays).toEqual(['2026-12-19', '2026-12-20']);
  });
});

describe('parseICSBusyDays: nested components (VALARM)', () => {
  const alarm = (duration: string) => `BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-PT15M\r\nREPEAT:1\r\nDURATION:${duration}\r\nEND:VALARM`;

  it("an alarm's DURATION does not become the all-day event's length", () => {
    const ics = wrapCalendar(event(`DTSTART;VALUE=DATE:20270105\r\n${alarm('PT15M')}`));
    expect(parseICSBusyDays(ics).busyDays).toEqual(['2027-01-05']);
  });

  it("an alarm's DURATION does not stretch a one-hour meeting into busy days", () => {
    const ics = wrapCalendar(event(`DTSTART:20270105T090000Z\r\nDURATION:PT1H\r\n${alarm('P2D')}`));
    expect(parseICSBusyDays(ics).busyDays).toEqual([]);
  });
});
