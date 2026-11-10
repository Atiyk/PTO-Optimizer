import { addDays, rangeISO, isoToSerial } from '@daysoff/engine/solver/dateUtils';
import { validCalendarDate } from '../personal/employerCalendar';

/** A single .ics file is parsed entirely client-side (FileReader/`file.text()`, never
 * fetch/XHR) - nothing is uploaded anywhere, per the product's no-backend design. This
 * module is pure string-in, data-out: it has no idea it's being handed a File, which keeps
 * the actual parsing logic directly unit-testable without any DOM/File API involved. */

export const MAX_IMPORT_EVENTS = 500;
/** Hard local-only input and expansion bounds; no network or storage access. */
export const MAX_IMPORT_CHARS = 1_000_000;
export const MAX_IMPORT_FILE_BYTES = 1_000_000;
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
  /** Recurrence rules, dates and exceptions are skipped and counted for the caller. */
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
  const normalized = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
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
  date: string;
  isAllDay: boolean;
  minutesOfDay: number;
  secondsOfDay: number;
  /** UTC for Z timestamps, IANA TZID when specified, otherwise floating time. */
  zone: string | null;
  instantMs: number | null;
}

function utcWallMillis(date: string, h: number, m: number, sec: number): number {
  const result = new Date(0);
  result.setUTCFullYear(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
  result.setUTCHours(h, m, sec, 0);
  return result.getTime();
}

interface WallParts { date: string; hours: number; minutes: number; seconds: number }
const formatters = new Map<string, Intl.DateTimeFormat>();

function zonedWallParts(ms: number, tzid: string): WallParts {
  let formatter = formatters.get(tzid);
  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat('en-US-u-nu-latn', {
        timeZone: tzid, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
      });
    } catch {
      throw new IcsParseError('Calendar has an unsupported time zone. Use an IANA time zone or export as all-day.');
    }
    formatters.set(tzid, formatter);
  }
  const parts = Object.fromEntries(formatter.formatToParts(ms).map(p => [p.type, p.value]));
  const date = [parts.year, parts.month, parts.day].join('-');
  const hours = Number(parts.hour), minutes = Number(parts.minute), seconds = Number(parts.second);
  if (!validCalendarDate(date) || !Number.isInteger(hours) || !Number.isInteger(minutes) || !Number.isInteger(seconds)) {
    throw new IcsParseError('Calendar contains an unsupported zoned date-time.');
  }
  return { date, hours, minutes, seconds };
}

/** Convert civil IANA date-times to exactly one actual instant. Explicitly
 * reject nonexistent or repeated local hours at DST boundaries, rather than
 * silently blocking the wrong day. */
function zonedInstantMs(date: string, hours: number, minutes: number, seconds: number, zone: string): number {
  const nominal = utcWallMillis(date, hours, minutes, seconds);
  const candidates = new Set<number>();
  for (const delta of [-2, 0, 2]) {
    const sample = nominal + delta * 86400000;
    const p = zonedWallParts(sample, zone);
    const offset = utcWallMillis(p.date, p.hours, p.minutes, p.seconds) - sample;
    const instant = nominal - offset;
    const w = zonedWallParts(instant, zone);
    if (w.date === date && w.hours === hours && w.minutes === minutes && w.seconds === seconds) {
      candidates.add(instant);
    }
  }
  if (candidates.size !== 1) {
    throw new IcsParseError('Calendar contains a nonexistent or ambiguous DST time. Review this event manually.');
  }
  return [...candidates][0];
}

function wallAtInstant(ms: number, zone: string | null): WallParts {
  if (zone && zone !== 'UTC') return zonedWallParts(ms, zone);
  const d = new Date(ms);
  return { date: d.toISOString().slice(0, 10), hours: d.getUTCHours(), minutes: d.getUTCMinutes(), seconds: d.getUTCSeconds() };
}

function parseDateTimeValue(prop: RawProp): DateTimeValue | null {
  const m = prop.value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const date = [m[1], m[2], m[3]].join('-');
  if (!validCalendarDate(date)) return null;
  const hasTime = m[4] !== undefined;
  const rawTz = prop.params.TZID?.replace(/^"|"$/g, '') ?? null;
  if ((prop.params.VALUE === 'DATE' && hasTime)
    || (prop.params.VALUE === 'DATE-TIME' && !hasTime)
    || (!hasTime && rawTz)
    || (rawTz && m[7])
    || (hasTime && (Number(m[4]) > 23 || Number(m[5]) > 59 || Number(m[6]) > 59))) return null;
  const hours = hasTime ? Number(m[4]) : 0;
  const minutes = hasTime ? Number(m[5]) : 0;
  const seconds = hasTime ? Number(m[6]) : 0;
  const zone = hasTime ? (m[7] ? 'UTC' : rawTz) : null;
  const instantMs = !hasTime ? null
    : zone && zone !== 'UTC' ? zonedInstantMs(date, hours, minutes, seconds, zone)
      : utcWallMillis(date, hours, minutes, seconds);
  return { date, isAllDay: !hasTime, minutesOfDay: hours * 60 + minutes, secondsOfDay: seconds, zone, instantMs };
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
  return days * 1440 + hours * 60 + mins + Number(m[4] || 0) / 60;
}

/** Guard BEFORE expanding ranges; an imported file must never freeze the browser. */
function addBoundedDays(busy: Set<string>, first: string, last: string): void {
  if (!validCalendarDate(first) || !validCalendarDate(last)) {
    throw new IcsParseError('Calendar event has an invalid date.');
  }
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
 * Recurring events are deliberately NOT expanded - a general recurrence
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
    throw new IcsParseError("This doesn't look like a calendar (.ics) file, or it is incomplete.");
  }
  const busy = new Set<string>();
  let eventCount = 0;
  let cappedAt: number | null = null;
  let skippedRecurring = 0;

  let inEvent = false;
  let dtstartProp: RawProp | null = null;
  let dtendProp: RawProp | null = null;
  let durationValue: string | null = null;
  let hasRecurrence = false;
  // Depth inside a sub-component of the event (VALARM etc.): its DTSTART/DURATION are not the event's.
  let subDepth = 0;

  function flushEvent(): void {
    if (hasRecurrence) {
      skippedRecurring++;
      return;
    }
    if (!dtstartProp) return;
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

    // Timed spans use real elapsed time with UTC/IANA DST awareness.
    // DTEND is exclusive: midnight on the next day does not block that day.
    let durationMinutes: number | null = null;
    let endDateForSpan: string | null = null;
    let exclusiveMidnightEnd = false;
    if (dtendProp) {
      const end = parseDateTimeValue(dtendProp);
      if (!end || end.isAllDay) throw new IcsParseError('Calendar event has an invalid timed end date.');
      if (start.zone !== end.zone) {
        throw new IcsParseError('Calendar event has mismatched time zones. Export matching start/end times or review manually.');
      }
      durationMinutes = (end.instantMs! - start.instantMs!) / 60000;
      endDateForSpan = end.date;
      exclusiveMidnightEnd = end.minutesOfDay === 0 && end.secondsOfDay === 0;
    } else if (durationValue) {
      durationMinutes = parseDurationMinutes(durationValue);
      if (durationMinutes !== null) {
        if (!Number.isFinite(durationMinutes) || durationMinutes < 0
          || durationMinutes > (MAX_IMPORT_SPAN_DAYS + 1) * 1440) {
          throw new IcsParseError('Calendar event has an invalid or excessive timed duration.');
        }
        const localEnd = wallAtInstant(start.instantMs! + durationMinutes * 60000, start.zone);
        endDateForSpan = localEnd.date;
        exclusiveMidnightEnd = localEnd.hours === 0 && localEnd.minutes === 0 && localEnd.seconds === 0;
      }
    }
    if (durationMinutes !== null && (!Number.isFinite(durationMinutes) || durationMinutes < 0)) {
      throw new IcsParseError('Calendar event has an invalid timed date range.');
    }
    if (durationMinutes === null || durationMinutes < 1440) return;
    if (!endDateForSpan) return;
    const lastDay = endDateForSpan > start.date
      ? (exclusiveMidnightEnd ? addDays(endDateForSpan, -1) : endDateForSpan)
      : start.date;
    addBoundedDays(busy, start.date, lastDay);
  }

  for (const line of lines) {
    const prop = parseLine(line);
    if (!prop) continue;

    if (prop.name === 'BEGIN' && prop.value === 'VEVENT') {
      if (inEvent) throw new IcsParseError('Calendar has a nested event.');
      inEvent = true;
      dtstartProp = null;
      dtendProp = null;
      durationValue = null;
      hasRecurrence = false;
      subDepth = 0;
      eventCount++;
      if (eventCount > MAX_IMPORT_EVENTS) {
        cappedAt = MAX_IMPORT_EVENTS;
        break;
      }
      continue;
    }
    if (prop.name === 'END' && prop.value === 'VEVENT') {
      if (!inEvent) throw new IcsParseError('Calendar has an unmatched event end.');
      flushEvent();
      inEvent = false;
      continue;
    }
    if (!inEvent) continue;
    if (prop.name === 'BEGIN') {
      subDepth++;
      continue;
    }
    if (prop.name === 'END') {
      subDepth = Math.max(0, subDepth - 1);
      continue;
    }
    if (subDepth > 0) continue;

    if (prop.name === 'DTSTART') dtstartProp = prop;
    else if (prop.name === 'DTEND') dtendProp = prop;
    else if (prop.name === 'DURATION') durationValue = prop.value;
    else if (['RRULE', 'RDATE', 'EXDATE', 'EXRULE', 'RECURRENCE-ID'].includes(prop.name)) hasRecurrence = true;
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
