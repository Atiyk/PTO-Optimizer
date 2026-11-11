import { describe, it, expect } from 'vitest';
import { parseICSBusyDays, MAX_RECURRENCE_ITERATIONS, MAX_RECURRENCE_ITERATIONS_PER_SERIES, MAX_RULE_LINES_PER_EVENT, MAX_DATE_LIST_LINES_PER_EVENT, MAX_RECURRENCE_DATE_VALUES, MAX_ZONED_RECURRENCE_INSTANCES } from './icsImport';

/**
 * Critic Q1-1: every period the rule generator visits (not just the dates it yields) must
 * count against a bounded budget, so a hostile or odd file cannot stall the main thread.
 * Assertions are on visited iterations (deterministic) plus a generous wall-clock bound.
 */

function cal(...events: string[][]): string {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0',
    ...events.flatMap(lines => ['BEGIN:VEVENT', ...lines, 'END:VEVENT']), 'END:VCALENDAR', ''].join('\r\n');
}

const WINDOW_2027 = { start: '2027-01-01', end: '2027-12-31' };
const IMPOSSIBLE = ['DTSTART;VALUE=DATE:19010101', 'RRULE:FREQ=DAILY;BYMONTH=2;BYMONTHDAY=30;COUNT=5'];

describe('recurrence work budget', () => {
  it('500 events with an impossible BYMONTHDAY + COUNT stay within the iteration budget and are reported truncated', () => {
    const ics = cal(...Array.from({ length: 500 }, () => IMPOSSIBLE));
    const t0 = performance.now();
    const result = parseICSBusyDays(ics, { window: WINDOW_2027 });
    const elapsed = performance.now() - t0;
    expect(result.recurrence.iterations).toBeLessThanOrEqual(MAX_RECURRENCE_ITERATIONS);
    expect(result.recurrence.truncated).toBe(500);
    expect(result.recurrence.expanded).toBe(0);
    expect(result.recurrence.truncatedReasons).toContain('too many repeats to check');
    expect(result.busyDays).toEqual([]);
    expect(elapsed).toBeLessThan(2000); // generous for CI; typical is far lower
  });

  it('one impossible series is reported truncated after its own per-series budget, not as expanded', () => {
    const result = parseICSBusyDays(cal(IMPOSSIBLE), { window: WINDOW_2027 });
    expect(result.recurrence.iterations).toBeLessThanOrEqual(MAX_RECURRENCE_ITERATIONS_PER_SERIES);
    expect(result.recurrence).toMatchObject({ expanded: 0, truncated: 1 });
  });

  it('counts empty MONTHLY periods too', () => {
    const result = parseICSBusyDays(cal(['DTSTART;VALUE=DATE:19010131', 'RRULE:FREQ=MONTHLY;BYMONTH=2;BYMONTHDAY=31;COUNT=3']), { window: WINDOW_2027 });
    expect(result.recurrence.iterations).toBeGreaterThan(0);
    expect(result.recurrence.iterations).toBeLessThanOrEqual(MAX_RECURRENCE_ITERATIONS_PER_SERIES);
  });

  it('an event with more RRULE lines than allowed is reported unsupported by name', () => {
    const rules = Array.from({ length: 20 }, () => 'RRULE:FREQ=DAILY;BYMONTH=2;BYMONTHDAY=30;COUNT=5');
    const result = parseICSBusyDays(cal(['DTSTART;VALUE=DATE:19010101', ...rules]), { window: WINDOW_2027 });
    expect(result.recurrence.unsupported).toBe(1);
    expect(result.recurrence.unsupportedReasons).toContain('too many RRULE lines');
    expect(result.recurrence.iterations).toBe(0);
    expect(MAX_RULE_LINES_PER_EVENT).toBeLessThan(20);
  });

  it('10 events x 20 RRULE lines finish quickly', () => {
    const rules = Array.from({ length: 20 }, () => 'RRULE:FREQ=DAILY;BYMONTH=2;BYMONTHDAY=30;COUNT=5');
    const ics = cal(...Array.from({ length: 10 }, () => ['DTSTART;VALUE=DATE:19010101', ...rules]));
    const result = parseICSBusyDays(ics, { window: WINDOW_2027 });
    expect(result.recurrence.unsupported).toBe(10);
    expect(result.recurrence.iterations).toBeLessThanOrEqual(MAX_RECURRENCE_ITERATIONS);
  });

  it('caps RDATE / EXDATE property lines per event', () => {
    const lines = Array.from({ length: MAX_DATE_LIST_LINES_PER_EVENT + 1 }, (_, i) => `EXDATE;VALUE=DATE:2027${String((i % 12) + 1).padStart(2, '0')}01`);
    const result = parseICSBusyDays(cal(['DTSTART;VALUE=DATE:20270101', 'RRULE:FREQ=MONTHLY;COUNT=3', ...lines]), { window: WINDOW_2027 });
    expect(result.recurrence.unsupportedReasons).toContain('too many RDATE/EXDATE lines');
  });

  it('caps RDATE/EXDATE values across the whole file, reporting the over-cap series by name', () => {
    const vals = Array.from({ length: 900 }, (_, i) => `2027${String((i % 12) + 1).padStart(2, '0')}${String((i % 28) + 1).padStart(2, '0')}T090000`).join(',');
    const ev = ['DTSTART;TZID=America/New_York:20270101T090000', 'DURATION:P2D', 'RRULE:FREQ=WEEKLY;COUNT=3', `EXDATE;TZID=America/New_York:${vals}`];
    const events = Array.from({ length: 60 }, () => ev);
    const t0 = performance.now();
    const result = parseICSBusyDays(cal(...events), { window: WINDOW_2027 });
    expect(performance.now() - t0).toBeLessThan(2000);
    const accepted = Math.floor(MAX_RECURRENCE_DATE_VALUES / 900);
    expect(result.recurrence.expanded).toBe(accepted);
    expect(result.recurrence.unsupported).toBe(60 - accepted);
    expect(result.recurrence.unsupportedReasons).toContain('too many RDATE/EXDATE values');
  });

  it('caps rule instances in IANA time zones across the file (each costs several Intl calls)', () => {
    const ev = ['DTSTART;TZID=America/New_York:20270101T090000', 'DTEND;TZID=America/New_York:20270103T090000', 'RRULE:FREQ=DAILY'];
    const result = parseICSBusyDays(cal(...Array.from({ length: 10 }, () => ev)), { window: WINDOW_2027 });
    const perSeries = 364; // rule instances after DTSTART within 2027
    const full = Math.floor(MAX_ZONED_RECURRENCE_INSTANCES / perSeries);
    expect(result.recurrence).toMatchObject({ expanded: full, truncated: 10 - full });
    expect(result.recurrence.truncatedReasons).toEqual(['too many repeats to check']);
  });

  it('still expands a valid COUNT series that starts years before the window', () => {
    // Weekly from 2015 with COUNT: counting from DTSTART stays well inside the budget.
    const result = parseICSBusyDays(cal(['DTSTART;VALUE=DATE:20150105', 'RRULE:FREQ=WEEKLY;COUNT=700']), { window: WINDOW_2027 });
    expect(result.recurrence).toMatchObject({ expanded: 1, truncated: 0 });
    expect(result.busyDays[0]).toBe('2027-01-04');
  });
});
