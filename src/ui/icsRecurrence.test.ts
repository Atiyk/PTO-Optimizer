import { describe, it, expect } from 'vitest';
import { parseICSBusyDays, IcsParseError, MAX_RECURRENCE_INSTANCES, incompleteRecurrenceMessage } from './icsImport';

/**
 * Issue 16: bounded RRULE/RDATE/EXDATE/RECURRENCE-ID support for the recurrence shapes
 * school calendars actually export. Semantics follow RFC 5545 §3.3.10 (RRULE: DTSTART
 * always counts as the first instance; UNTIL is inclusive; invalid dates such as Feb 30
 * are ignored and not counted), §3.8.5.1/§3.8.5.2 (EXDATE/RDATE, comma-separated values,
 * EXDATE wins over inclusion, duplicates ignored) and §3.8.4.4 (RECURRENCE-ID names the
 * ORIGINAL start of the instance it overrides).
 */

function cal(...events: string[][]): string {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Test//EN',
    ...events.flatMap(lines => ['BEGIN:VEVENT', ...lines, 'END:VEVENT']), 'END:VCALENDAR', ''].join('\r\n');
}

const SCHOOL_YEAR = { start: '2026-08-01', end: '2027-07-31' };

describe('RRULE expansion: frequencies', () => {
  it('FREQ=WEEKLY with COUNT expands all-day instances, DTSTART counting as the first', () => {
    const result = parseICSBusyDays(cal(['UID:a', 'DTSTART;VALUE=DATE:20260907', 'RRULE:FREQ=WEEKLY;COUNT=3']), { window: SCHOOL_YEAR });
    expect(result.busyDays).toEqual(['2026-09-07', '2026-09-14', '2026-09-21']);
    expect(result.skippedRecurring).toBe(0);
    expect(result.recurrence.expanded).toBe(1);
  });

  it('FREQ=WEEKLY;BYDAY=MO,WE expands each listed weekday inside the week', () => {
    const result = parseICSBusyDays(cal(['DTSTART;VALUE=DATE:20260907', 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4']), { window: SCHOOL_YEAR });
    expect(result.busyDays).toEqual(['2026-09-07', '2026-09-09', '2026-09-14', '2026-09-16']);
  });

  it('FREQ=WEEKLY;INTERVAL=2 skips alternate weeks', () => {
    const result = parseICSBusyDays(cal(['DTSTART;VALUE=DATE:20260904', 'RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=3']), { window: SCHOOL_YEAR });
    expect(result.busyDays).toEqual(['2026-09-04', '2026-09-18', '2026-10-02']);
  });

  it('FREQ=DAILY with UNTIL (DATE) is inclusive of the UNTIL day', () => {
    const result = parseICSBusyDays(cal(['DTSTART;VALUE=DATE:20261221', 'RRULE:FREQ=DAILY;UNTIL=20261223']), { window: SCHOOL_YEAR });
    expect(result.busyDays).toEqual(['2026-12-21', '2026-12-22', '2026-12-23']);
  });

  it('FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR limits to weekdays', () => {
    const result = parseICSBusyDays(cal(['DTSTART;VALUE=DATE:20261218', 'RRULE:FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR;COUNT=3']), { window: SCHOOL_YEAR });
    // Fri 18, (Sat/Sun skipped), Mon 21, Tue 22
    expect(result.busyDays).toEqual(['2026-12-18', '2026-12-21', '2026-12-22']);
  });

  it('FREQ=MONTHLY;BYDAY=1FR expands the first Friday of each month', () => {
    const result = parseICSBusyDays(cal(['DTSTART;VALUE=DATE:20260904', 'RRULE:FREQ=MONTHLY;BYDAY=1FR;COUNT=3']), { window: SCHOOL_YEAR });
    expect(result.busyDays).toEqual(['2026-09-04', '2026-10-02', '2026-11-06']);
  });

  it('FREQ=MONTHLY;BYDAY=-1FR expands the last Friday of each month', () => {
    const result = parseICSBusyDays(cal(['DTSTART;VALUE=DATE:20260925', 'RRULE:FREQ=MONTHLY;BYDAY=-1FR;COUNT=3']), { window: SCHOOL_YEAR });
    expect(result.busyDays).toEqual(['2026-09-25', '2026-10-30', '2026-11-27']);
  });

  it('FREQ=MONTHLY without BYxxx repeats on the DTSTART day and ignores months without it (RFC: invalid dates are not counted)', () => {
    const result = parseICSBusyDays(cal(['DTSTART;VALUE=DATE:20261031', 'RRULE:FREQ=MONTHLY;COUNT=3']), { window: SCHOOL_YEAR });
    // Nov 31 does not exist and is not counted; Dec 31, Jan 31.
    expect(result.busyDays).toEqual(['2026-10-31', '2026-12-31', '2027-01-31']);
  });

  it('FREQ=MONTHLY;BYMONTHDAY=-1 expands the last day of each month', () => {
    const result = parseICSBusyDays(cal(['DTSTART;VALUE=DATE:20270131', 'RRULE:FREQ=MONTHLY;BYMONTHDAY=-1;COUNT=3']), { window: SCHOOL_YEAR });
    expect(result.busyDays).toEqual(['2027-01-31', '2027-02-28', '2027-03-31']);
  });

  it('FREQ=YEARLY repeats on the DTSTART month/day', () => {
    const result = parseICSBusyDays(cal(['DTSTART;VALUE=DATE:20261225', 'RRULE:FREQ=YEARLY;COUNT=2']), { window: { start: '2026-01-01', end: '2028-12-31' } });
    expect(result.busyDays).toEqual(['2026-12-25', '2027-12-25']);
  });

  it('FREQ=YEARLY;BYMONTH=11;BYDAY=4TH expands US Thanksgiving', () => {
    const result = parseICSBusyDays(cal(['DTSTART;VALUE=DATE:20261126', 'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=4TH;COUNT=2']), { window: { start: '2026-01-01', end: '2028-12-31' } });
    expect(result.busyDays).toEqual(['2026-11-26', '2027-11-25']);
  });
});

describe('RRULE expansion: UNTIL and time zones', () => {
  it('UNTIL as a UTC date-time bounds a TZID timed series inclusively', () => {
    // 48-hour events every week, local Europe/London 09:00. UNTIL equals the 2nd instance's instant.
    const result = parseICSBusyDays(cal([
      'DTSTART;TZID=Europe/London:20261005T090000', 'DTEND;TZID=Europe/London:20261007T090000',
      'RRULE:FREQ=WEEKLY;UNTIL=20261012T080000Z',
    ]), { window: SCHOOL_YEAR });
    expect(result.busyDays).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-12', '2026-10-13', '2026-10-14']);
  });

  it('accepts a UTC date-time UNTIL on an all-day series (common exporter shape) by its UTC date', () => {
    const result = parseICSBusyDays(cal(['DTSTART;VALUE=DATE:20260907', 'RRULE:FREQ=WEEKLY;UNTIL=20260921T000000Z']), { window: SCHOOL_YEAR });
    expect(result.busyDays).toEqual(['2026-09-07', '2026-09-14', '2026-09-21']);
  });

  it('does not expand short timed recurring meetings at all (they are never busy days)', () => {
    const result = parseICSBusyDays(cal(['DTSTART:20260907T090000Z', 'DTEND:20260907T093000Z', 'RRULE:FREQ=DAILY;BYSETPOS=1']), { window: SCHOOL_YEAR });
    expect(result.busyDays).toEqual([]);
    expect(result.skippedRecurring).toBe(0);
  });
});

describe('DST and recurrence', () => {
  it('ignores, and does not count, an instance at a nonexistent local time (RFC 5545 §3.3.10)', () => {
    // 2026-03-08 02:30 does not exist in America/New_York (clocks jump 02:00 -> 03:00).
    const result = parseICSBusyDays(cal([
      'DTSTART;TZID=America/New_York:20260301T023000', 'DURATION:P2D', 'RRULE:FREQ=WEEKLY;COUNT=3',
    ]), { window: { start: '2026-01-01', end: '2026-12-31' } });
    expect(result.busyDays).toEqual([
      '2026-03-01', '2026-03-02', '2026-03-03',
      '2026-03-15', '2026-03-16', '2026-03-17',
      '2026-03-22', '2026-03-23', '2026-03-24',
    ]);
  });
});

describe('incompleteRecurrenceMessage', () => {
  it('is null for a complete import and names counts and reasons otherwise', () => {
    expect(incompleteRecurrenceMessage({ expanded: 2, unsupported: 0, truncated: 0, unsupportedReasons: [] })).toBeNull();
    expect(incompleteRecurrenceMessage({ expanded: 0, unsupported: 2, truncated: 1, unsupportedReasons: ['BYSETPOS', 'FREQ=HOURLY'] }))
      .toBe('Import incomplete: 2 repeating events are not included (uses BYSETPOS, FREQ=HOURLY). 1 repeating event was only partly included (too many repeats). Add those dates by hand.');
  });
});

describe('multi-day recurring events', () => {
  it('applies the DTEND-exclusive all-day span to every instance', () => {
    const result = parseICSBusyDays(cal(['DTSTART;VALUE=DATE:20260907', 'DTEND;VALUE=DATE:20260909', 'RRULE:FREQ=WEEKLY;COUNT=2']), { window: SCHOOL_YEAR });
    expect(result.busyDays).toEqual(['2026-09-07', '2026-09-08', '2026-09-14', '2026-09-15']);
  });
});

describe('EXDATE and RDATE', () => {
  it('EXDATE;VALUE=DATE removes an instance, and multiple values and lines all apply', () => {
    const result = parseICSBusyDays(cal([
      'DTSTART;VALUE=DATE:20260907', 'RRULE:FREQ=WEEKLY;COUNT=5',
      'EXDATE;VALUE=DATE:20260914,20260921', 'EXDATE;VALUE=DATE:20261005',
    ]), { window: SCHOOL_YEAR });
    expect(result.busyDays).toEqual(['2026-09-07', '2026-09-28']);
  });

  it('EXDATE can exclude DTSTART itself', () => {
    const result = parseICSBusyDays(cal(['DTSTART;VALUE=DATE:20260907', 'RRULE:FREQ=WEEKLY;COUNT=2', 'EXDATE;VALUE=DATE:20260907']), { window: SCHOOL_YEAR });
    expect(result.busyDays).toEqual(['2026-09-14']);
  });

  it('EXDATE as date-times matches timed instances by their instant', () => {
    const result = parseICSBusyDays(cal([
      'DTSTART;TZID=America/New_York:20261005T080000', 'DTEND;TZID=America/New_York:20261006T080000',
      'RRULE:FREQ=WEEKLY;COUNT=2', 'EXDATE;TZID=America/New_York:20261005T080000',
    ]), { window: SCHOOL_YEAR });
    expect(result.busyDays).toEqual(['2026-10-12', '2026-10-13']);
  });

  it('RDATE adds extra instances (with or without an RRULE) and ignores duplicates', () => {
    const withRule = parseICSBusyDays(cal([
      'DTSTART;VALUE=DATE:20260907', 'RRULE:FREQ=WEEKLY;COUNT=2', 'RDATE;VALUE=DATE:20260914,20261103',
    ]), { window: SCHOOL_YEAR });
    expect(withRule.busyDays).toEqual(['2026-09-07', '2026-09-14', '2026-11-03']);
    const alone = parseICSBusyDays(cal(['DTSTART;VALUE=DATE:20261103', 'RDATE;VALUE=DATE:20261211']), { window: SCHOOL_YEAR });
    expect(alone.busyDays).toEqual(['2026-11-03', '2026-12-11']);
  });

  it('EXDATE wins over RDATE for the same date', () => {
    const result = parseICSBusyDays(cal([
      'DTSTART;VALUE=DATE:20261103', 'RDATE;VALUE=DATE:20261211', 'EXDATE;VALUE=DATE:20261211',
    ]), { window: SCHOOL_YEAR });
    expect(result.busyDays).toEqual(['2026-11-03']);
  });
});

describe('RECURRENCE-ID overrides', () => {
  it('moves an overridden instance to its new date', () => {
    const result = parseICSBusyDays(cal(
      ['UID:early-release', 'DTSTART;VALUE=DATE:20260904', 'RRULE:FREQ=WEEKLY;COUNT=3'],
      ['UID:early-release', 'RECURRENCE-ID;VALUE=DATE:20260911', 'DTSTART;VALUE=DATE:20260910'],
    ), { window: SCHOOL_YEAR });
    expect(result.busyDays).toEqual(['2026-09-04', '2026-09-10', '2026-09-18']);
  });

  it('drops an instance whose override is STATUS:CANCELLED', () => {
    const result = parseICSBusyDays(cal(
      ['UID:pd', 'DTSTART;VALUE=DATE:20260904', 'RRULE:FREQ=WEEKLY;COUNT=3'],
      ['UID:pd', 'RECURRENCE-ID;VALUE=DATE:20260911', 'DTSTART;VALUE=DATE:20260911', 'STATUS:CANCELLED'],
    ), { window: SCHOOL_YEAR });
    expect(result.busyDays).toEqual(['2026-09-04', '2026-09-18']);
  });

  it('is order-independent: an override listed before its master still applies', () => {
    const result = parseICSBusyDays(cal(
      ['UID:pd', 'RECURRENCE-ID;VALUE=DATE:20260911', 'DTSTART;VALUE=DATE:20260911', 'STATUS:CANCELLED'],
      ['UID:pd', 'DTSTART;VALUE=DATE:20260904', 'RRULE:FREQ=WEEKLY;COUNT=3'],
    ), { window: SCHOOL_YEAR });
    expect(result.busyDays).toEqual(['2026-09-04', '2026-09-18']);
  });

  it('a cancelled master series contributes nothing', () => {
    const result = parseICSBusyDays(cal(['DTSTART;VALUE=DATE:20260904', 'RRULE:FREQ=WEEKLY;COUNT=3', 'STATUS:CANCELLED']), { window: SCHOOL_YEAR });
    expect(result.busyDays).toEqual([]);
    expect(result.skippedRecurring).toBe(0);
  });

  it('RANGE=THISANDFUTURE is reported as unsupported, not half-applied', () => {
    const result = parseICSBusyDays(cal(
      ['UID:x', 'DTSTART;VALUE=DATE:20260904', 'RRULE:FREQ=WEEKLY;COUNT=3'],
      ['UID:x', 'RECURRENCE-ID;RANGE=THISANDFUTURE;VALUE=DATE:20260911', 'DTSTART;VALUE=DATE:20260912'],
    ), { window: SCHOOL_YEAR });
    expect(result.busyDays).toEqual([]);
    expect(result.recurrence.unsupported).toBe(1);
    expect(result.recurrence.unsupportedReasons).toContain('RANGE=THISANDFUTURE');
    expect(result.skippedRecurring).toBe(1);
  });
});

describe('bounded expansion', () => {
  it('stops an unbounded series at the planning window end without reporting it incomplete', () => {
    const result = parseICSBusyDays(cal(['DTSTART;VALUE=DATE:20260907', 'RRULE:FREQ=WEEKLY']), { window: { start: '2026-09-01', end: '2026-09-30' } });
    expect(result.busyDays).toEqual(['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28']);
    expect(result.skippedRecurring).toBe(0);
  });

  it('fast-forwards a series that started long before the window', () => {
    const result = parseICSBusyDays(cal(['DTSTART;VALUE=DATE:19700105', 'RRULE:FREQ=DAILY;BYDAY=MO']), { window: { start: '2026-09-01', end: '2026-09-15' } });
    expect(result.busyDays).toEqual(['2026-09-07', '2026-09-14']);
    expect(result.skippedRecurring).toBe(0);
  });

  it('COUNT still counts instances before the window', () => {
    const result = parseICSBusyDays(cal(['DTSTART;VALUE=DATE:20260803', 'RRULE:FREQ=WEEKLY;COUNT=6']), { window: { start: '2026-09-01', end: '2026-12-31' } });
    expect(result.busyDays).toEqual(['2026-09-07']);
  });

  it('without a planning window, an unbounded series is reported as incomplete', () => {
    const result = parseICSBusyDays(cal(['DTSTART;VALUE=DATE:20260907', 'RRULE:FREQ=WEEKLY']));
    expect(result.recurrence.truncated).toBe(1);
    expect(result.skippedRecurring).toBe(1);
    expect(result.busyDays.length).toBeGreaterThan(0);
  });

  it('caps instances per series and reports the truncation', () => {
    const result = parseICSBusyDays(cal(['DTSTART;VALUE=DATE:20260101', `RRULE:FREQ=DAILY;COUNT=${MAX_RECURRENCE_INSTANCES + 10}`]), { window: { start: '2026-01-01', end: '2035-12-31' } });
    expect(result.busyDays.length).toBe(MAX_RECURRENCE_INSTANCES);
    expect(result.recurrence.truncated).toBe(1);
  });

  it('rejects an invalid planning window', () => {
    expect(() => parseICSBusyDays(cal(['DTSTART;VALUE=DATE:20260907']), { window: { start: '2027-01-01', end: '2026-01-01' } })).toThrow(IcsParseError);
  });

  it('handles a pathological long RRULE value quickly and safely', () => {
    const big = `RRULE:FREQ=WEEKLY;BYDAY=${Array.from({ length: 5000 }, () => 'MO').join(',')}`;
    const t0 = Date.now();
    const result = parseICSBusyDays(cal(['DTSTART;VALUE=DATE:20260907', big]), { window: SCHOOL_YEAR });
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(result.recurrence.unsupported).toBe(1);
  });
});

describe('unsupported recurrence is reported, never silently dropped or mis-expanded', () => {
  it.each([
    ['RRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1', 'BYSETPOS'],
    ['RRULE:FREQ=YEARLY;BYWEEKNO=20', 'BYWEEKNO'],
    ['RRULE:FREQ=YEARLY;BYYEARDAY=100', 'BYYEARDAY'],
    ['RRULE:FREQ=HOURLY;COUNT=30', 'FREQ=HOURLY'],
    ['RRULE:FREQ=MINUTELY;COUNT=30', 'FREQ=MINUTELY'],
    ['RRULE:FREQ=SECONDLY;COUNT=30', 'FREQ=SECONDLY'],
    ['RRULE:FREQ=MONTHLY;BYDAY=FR;BYMONTHDAY=13', 'BYDAY+BYMONTHDAY'],
    ['RRULE:FREQ=WEEKLY;COUNT=2;UNTIL=20261001', 'COUNT+UNTIL'],
    ['RRULE:COUNT=2', 'FREQ'],
    ['EXRULE:FREQ=WEEKLY;COUNT=2', 'EXRULE'],
    ['RDATE;VALUE=PERIOD:20261001T000000Z/20261003T000000Z', 'RDATE;VALUE=PERIOD'],
  ])('%s is counted as unsupported (%s)', (line, reason) => {
    const result = parseICSBusyDays(cal(['DTSTART;VALUE=DATE:20260907', line]), { window: SCHOOL_YEAR });
    expect(result.busyDays).toEqual([]);
    expect(result.recurrence.unsupported).toBe(1);
    expect(result.recurrence.unsupportedReasons).toContain(reason);
    expect(result.skippedRecurring).toBe(1);
  });

  it('keeps supported series and plain events while reporting the unsupported one', () => {
    const result = parseICSBusyDays(cal(
      ['DTSTART;VALUE=DATE:20260907', 'RRULE:FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1'],
      ['DTSTART;VALUE=DATE:20261123', 'DTEND;VALUE=DATE:20261128'],
      ['DTSTART;VALUE=DATE:20260904', 'RRULE:FREQ=WEEKLY;COUNT=2'],
    ), { window: SCHOOL_YEAR });
    expect(result.busyDays).toEqual(['2026-09-04', '2026-09-11', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27']);
    expect(result.recurrence).toMatchObject({ expanded: 1, unsupported: 1, truncated: 0 });
  });
});
