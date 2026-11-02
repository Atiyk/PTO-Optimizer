import { addDays, rangeISO, isoToSerial } from '@daysoff/engine/solver/dateUtils';
import { validCalendarDate } from '../personal/employerCalendar';

/** A single .ics file is parsed entirely client-side (FileReader/`file.text()`, never
 * fetch/XHR) - nothing is uploaded anywhere, per the product's no-backend design. This
 * module is pure string-in, data-out: it has no idea it's being handed a File, which keeps
 * the actual parsing logic directly unit-testable without any DOM/File API involved. */

export const MAX_IMPORT_EVENTS = 500;
/** Hard local-only input and expansion bounds; no network or storage access. */
export const MAX_IMPORT_CHARS = 1_000_000;
export const MAX_IMPORT_SPAN_DAYS = 3660;
export const MAX_IMPORT_BUSY_DAYS = 4000;

export class IcsParseError extends Error {}

export interface ParsedImportResult {
  /** Sorted, deduplicated ISO dates the file marks as busy - the only output callers need
   * to turn into "Days I can't take off". */
  busyDays: string[];
  /** Total VEVENT blocks encountered (capped - see cappedAt). */
  eventCount: number;
  /** Non-null, equal to MAX_IMPORT_EVENTS, when the file had more events than that and
   * parsing stopped early - the caller shows this plainly rather than silently truncating. */
  cappedAt: number | null;
  /** Events with an RRULE are intentionally not expanded (see parseICSBusyDays' own
   * comment) - counted here so the caller can mention they were skipped. */
  skippedRecurring: number;
}

interface RawProp {
  name: string;
  params: Record<string, string>;
  value: string;
}

/** RFC 5545 §3.1 line unfolding: a line that starts with a single space or tab is a
 * continuation of the previous line, with that one leading character removed. Must run
 * before any other parsing - a folded SUMMARY or DTSTART otherwise reads as two garbled
 * lines instead of one. */
function unfoldLines(raw: string): string[] {
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rawLines = normalized.split('\n');
  const lines: string[] = [];
  for (const line of rawLines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else if (line.length > 0) {
      lines.push(line);
    }
  }
  return lines;
}

function parseLine(line: string): RawProp | null {
  const colonIdx = line.indexOf(':');
  if (colonIdx === -1) return null;
  const left = line.slice(0, colonIdx);
  const value = line.slice(colonIdx + 1);
  const [name, ...paramParts] = left.split(';');
  const params: Record<string, string> = {};
  for (const p of paramParts) {
    const eq = p.indexOf('=');
    if (eq === -1) continue;
    params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
  }
  return { name: name.toUpperCase(), params, value };
}

interface DateTimeValue {
  date: string; // YYYY-MM-DD
  isAllDay: boolean;
  minutesOfDay: number; // 0 for an all-day value
}

/** Reads only the date (and, for a DATE-TIME value, the clock time) a DTSTART/DTEND
 * property carries - deliberately ignoring TZID/UTC offset entirely. That's a real
 * simplification (no timezone database is available client-side without a dependency), but
 * a safe one for this module's one real question - "is this event at least 24 hours long,
 * and which calendar day(s) does it touch" - since no realistic UTC offset (max ~14h) can
 * turn a genuinely short meeting into a day-long block or vice versa at the thresholds this
 * module cares about. */
function parseDateTimeValue(prop: RawProp): DateTimeValue | null {
  const m = prop.value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/);
  if (!m) return null;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  if (!validCalendarDate(date)) return null;
  const hasTime = m[4] !== undefined;
  if ((prop.params.VALUE === 'DATE' && hasTime)
    || (prop.params.VALUE === 'DATE-TIME' && !hasTime)
    || (hasTime && (Number(m[4]) > 23 || Number(m[5]) > 59 || Number(m[6]) > 59))) return null;
  const isAllDay = !hasTime;
  const minutesOfDay = hasTime ? Number(m[4]) * 60 + Number(m[5]) : 0;
  return { date, isAllDay, minutesOfDay };
}

/** Crude RFC 5545 DURATION parser (PnDTnHnMnS) - only the whole-days/hours/minutes this
 * module needs, not the full grammar (weeks, negative durations). Returns null for anything
 * it doesn't recognise, which callers treat as "unknown", not "zero". */
function parseDurationMinutes(value: string): number | null {
  const m = value.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return null;
  if (!m[1] && !m[2] && !m[3] && !m[4]) return null;
  const days = Number(m[1] || 0);
  const hours = Number(m[2] || 0);
  const mins = Number(m[3] || 0);
  return days * 1440 + hours * 60 + mins;
}

function totalMinutes(date: string, minutesOfDay: number): number {
  return isoToSerial(date) * 1440 + minutesOfDay;
}

/** Guard BEFORE expanding ranges; an imported file must never freeze the browser. */
function addBoundedDays(busy: Set<string>, first: string, last: string): void {
  const span = isoToSerial(last) - isoToSerial(first);
  if (!Number.isSafeInteger(span) || span < 0 || span > MAX_IMPORT_SPAN_DAYS) {
    throw new IcsParseError('Calendar event has an invalid or excessively long date range.');
  }
  for (const date of rangeISO(first, last)) {
    busy.add(date);
    if (busy.size > MAX_IMPORT_BUSY_DAYS) {
      throw new IcsParseError('Calendar includes too many distinct dates to import safely.');
    }
  }
}

/**
 * Phase 3 item 3: an .ics import, not a live OAuth calendar sync - that needs a backend for
 * token exchange and Google's calendar-scope verification, which breaks the no-backend
 * design. This gets most of the real value: every calendar app can export one.
 *
 * Extracts "busy days" from VEVENTs only (ignoring every other component type), applying
 * exactly the spec's filter: an all-day event counts regardless of length (even a single
 * day), but a timed event only counts when its REAL duration is at least 24 hours - a
 * 30-minute meeting, or even a long multi-hour one, is not a reason to block a day off.
 * Recurring events (RRULE present) are deliberately NOT expanded - a general recurrence
 * engine is out of scope for one import feature (same judgment call as the 9/80 schedule
 * option elsewhere in this phase); they're counted and reported as skipped instead of
 * silently dropped or wrongly expanded.
 */
export function parseICSBusyDays(raw: string): ParsedImportResult {
  if (typeof raw !== 'string' || raw.length > MAX_IMPORT_CHARS) {
    throw new IcsParseError('Calendar file is too large to import safely.');
  }

  const lines = unfoldLines(raw);
  if (lines[0] !== 'BEGIN:VCALENDAR' || lines[lines.length - 1] !== 'END:VCALENDAR') {
    throw new IcsParseError("This doesn't look like a complete calendar (.ics) file.");
  }
  const busy = new Set<string>();
  let eventCount = 0;
  let cappedAt: number | null = null;
  let skippedRecurring = 0;

  let inEvent = false;
  let dtstartProp: RawProp | null = null;
  let dtendProp: RawProp | null = null;
  let durationValue: string | null = null;
  let hasRRule = false;

  function flushEvent(): void {
    if (!dtstartProp) return;
    if (hasRRule) {
      skippedRecurring++;
      return;
    }
    const start = parseDateTimeValue(dtstartProp);
    if (!start) throw new IcsParseError('Calendar event has an invalid start date.');

    if (start.isAllDay) {
      // DTEND is EXCLUSIVE for an all-day event per RFC 5545 (the day after the last busy
      // day) - same convention this app's own icsExport.ts uses when generating one.
      let lastDay = start.date;
      if (dtendProp) {
        const end = parseDateTimeValue(dtendProp);
        if (!end || !end.isAllDay) throw new IcsParseError('Calendar event has an invalid all-day end date.');
        lastDay = addDays(end.date, -1);
      } else if (durationValue) {
        const mins = parseDurationMinutes(durationValue);
        if (mins === null || !Number.isFinite(mins) || mins <= 0 || mins % 1440 !== 0
          || mins / 1440 > MAX_IMPORT_SPAN_DAYS + 1) {
          throw new IcsParseError('Calendar event has an invalid or excessive all-day duration.');
        }
        lastDay = addDays(start.date, mins / 1440 - 1);
      }
      addBoundedDays(busy, start.date, lastDay);
      return;
    }

    // Timed event: only counts once its real duration is known and is >= 24 hours.
    let durationMinutes: number | null = null;
    let endDateForSpan: string | null = null;
    if (dtendProp) {
      const end = parseDateTimeValue(dtendProp);
      if (!end || end.isAllDay) throw new IcsParseError('Calendar event has an invalid timed end date.');
      durationMinutes = totalMinutes(end.date, end.minutesOfDay) - totalMinutes(start.date, start.minutesOfDay);
      endDateForSpan = end.date;
    } else if (durationValue) {
      durationMinutes = parseDurationMinutes(durationValue);
      if (durationMinutes !== null) {
        if (!Number.isFinite(durationMinutes) || durationMinutes < 0
          || durationMinutes > (MAX_IMPORT_SPAN_DAYS + 1) * 1440) {
          throw new IcsParseError('Calendar event has an invalid or excessive timed duration.');
        }
        endDateForSpan = addDays(start.date, Math.floor(durationMinutes / 1440));
      }
    }
    if (durationMinutes !== null && (!Number.isFinite(durationMinutes) || durationMinutes < 0)) {
      throw new IcsParseError('Calendar event has an invalid timed date range.');
    }
    if (durationMinutes === null || durationMinutes < 24 * 60) return; // unknown or short - ignore

    const lastDay = endDateForSpan && endDateForSpan > start.date ? endDateForSpan : start.date;
    addBoundedDays(busy, start.date, lastDay);
  }

  for (const line of lines) {
    const prop = parseLine(line);
    if (!prop) continue;

    if (prop.name === 'BEGIN' && prop.value === 'VEVENT') {
      inEvent = true;
      dtstartProp = null;
      dtendProp = null;
      durationValue = null;
      hasRRule = false;
      eventCount++;
      if (eventCount > MAX_IMPORT_EVENTS) {
        cappedAt = MAX_IMPORT_EVENTS;
        break;
      }
      continue;
    }
    if (prop.name === 'END' && prop.value === 'VEVENT') {
      if (inEvent) flushEvent();
      inEvent = false;
      continue;
    }
    if (!inEvent) continue;

    if (prop.name === 'DTSTART') dtstartProp = prop;
    else if (prop.name === 'DTEND') dtendProp = prop;
    else if (prop.name === 'DURATION') durationValue = prop.value;
    else if (prop.name === 'RRULE') hasRRule = true;
  }

  if (inEvent && cappedAt === null) {
    throw new IcsParseError('Calendar has an unclosed event.');
  }

  return {
    busyDays: Array.from(busy).sort(),
    eventCount: cappedAt !== null ? cappedAt : eventCount,
    cappedAt,
    skippedRecurring,
  };
}
