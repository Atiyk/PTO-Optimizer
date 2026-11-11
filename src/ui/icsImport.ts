import { addDays, rangeISO, isoToSerial } from '@daysoff/engine/solver/dateUtils';
import { validCalendarDate } from '../personal/employerCalendar';
import { parseRRule, ruleDates, type RecurrenceRule, type WorkBudget } from './icsRecurrence';

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
/** Issue 16: hard bounds on recurrence expansion - instances kept per series, and rule
 * candidates examined across the whole file. Hitting either reports the series as truncated. */
export const MAX_RECURRENCE_INSTANCES = 1000;
/** Work units (periods visited + candidate dates examined, see WorkBudget) for the whole
 * file and for any one series. Sized so the worst case stays well under ~100 ms. */
export const MAX_RECURRENCE_ITERATIONS = 100_000;
export const MAX_RECURRENCE_ITERATIONS_PER_SERIES = 20_000;
/** RFC 5545 says RRULE SHOULD NOT occur more than once; a few are tolerated, more are refused. */
export const MAX_RULE_LINES_PER_EVENT = 4;
/** RDATE and EXDATE property lines per event (values within them are capped separately). */
export const MAX_DATE_LIST_LINES_PER_EVENT = 100;
/** RDATE + EXDATE + RECURRENCE-ID values parsed across the whole file: each zoned value
 * costs several Intl calls, so this bounds that work too. */
export const MAX_RECURRENCE_DATE_VALUES = 2000;
/** Rule-generated instances in an IANA time zone across the whole file (several Intl calls each). */
export const MAX_ZONED_RECURRENCE_INSTANCES = 1000;

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
  /** Recurring series NOT fully imported: recurrence.unsupported + recurrence.truncated.
   * Non-zero means the import is incomplete and the caller must say so. */
  skippedRecurring: number;
  recurrence: RecurrenceSummary;
}

export interface RecurrenceSummary {
  /** Recurring series expanded completely across the expansion window. */
  expanded: number;
  /** Series using a recurrence feature outside the supported subset: contribute no dates. */
  unsupported: number;
  /** Sorted, de-duplicated names of the unsupported features (e.g. "BYSETPOS"). */
  unsupportedReasons: string[];
  /** Series cut short by the instance/work caps (or, with no window, still running at the horizon). */
  truncated: number;
  /** Sorted, de-duplicated reasons for truncation (e.g. "too many repeats to check"). */
  truncatedReasons: string[];
  /** Work units spent expanding rules (bounded by MAX_RECURRENCE_ITERATIONS). */
  iterations: number;
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
  const candidates = zonedInstantCandidates(date, hours, minutes, seconds, zone);
  if (candidates.length !== 1) {
    throw new IcsParseError('Calendar contains a nonexistent or ambiguous DST time. Review this event manually.');
  }
  return candidates[0];
}

/** Every actual instant a civil IANA date-time maps to, earliest first: none in a DST gap,
 * two in a repeated hour. */
function zonedInstantCandidates(date: string, hours: number, minutes: number, seconds: number, zone: string): number[] {
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
  return [...candidates].sort((a, b) => a - b);
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

interface EventRecord {
  uid: string | null;
  dtstart: RawProp | null;
  dtend: RawProp | null;
  duration: string | null;
  rrules: string[];
  rdates: RawProp[];
  exdates: RawProp[];
  exrule: boolean;
  recurrenceId: RawProp | null;
  cancelled: boolean;
}

/** How long one occurrence of an event lasts; null = it can never block a whole day. */
type EventShape = { kind: 'all-day'; days: number } | { kind: 'timed'; minutes: number } | null;

/** Same validation and the same 24-hour rule a single event always had, lifted out so every
 * recurrence instance reuses it. */
function eventShape(start: DateTimeValue, ev: EventRecord): EventShape {
  if (start.isAllDay) {
    // DTEND is EXCLUSIVE for an all-day event per RFC 5545 (the day after the last busy
    // day) - same convention this app's own icsExport.ts uses when generating one.
    if (ev.dtend) {
      const end = parseDateTimeValue(ev.dtend);
      if (!end || !end.isAllDay) throw new IcsParseError('Calendar event has an invalid all-day end date.');
      const days = isoToSerial(end.date) - isoToSerial(start.date);
      // An end on or before the start is rejected, as it always was.
      if (days < 1) throw new IcsParseError('Calendar event has an invalid or excessively long date range.');
      return { kind: 'all-day', days };
    }
    if (ev.duration) {
      const mins = parseDurationMinutes(ev.duration);
      if (mins === null || !Number.isFinite(mins) || mins <= 0 || mins % 1440 !== 0
        || mins / 1440 > MAX_IMPORT_SPAN_DAYS + 1) {
        throw new IcsParseError('Calendar event has an invalid or excessive all-day duration.');
      }
      return { kind: 'all-day', days: mins / 1440 };
    }
    return { kind: 'all-day', days: 1 };
  }

  // Timed spans use real elapsed time with UTC/IANA DST awareness.
  let durationMinutes: number | null = null;
  if (ev.dtend) {
    const end = parseDateTimeValue(ev.dtend);
    if (!end || end.isAllDay) throw new IcsParseError('Calendar event has an invalid timed end date.');
    if (start.zone !== end.zone) {
      throw new IcsParseError('Calendar event has mismatched time zones. Export matching start/end times or review manually.');
    }
    durationMinutes = (end.instantMs! - start.instantMs!) / 60000;
  } else if (ev.duration) {
    durationMinutes = parseDurationMinutes(ev.duration);
    if (durationMinutes !== null && (!Number.isFinite(durationMinutes) || durationMinutes < 0
      || durationMinutes > (MAX_IMPORT_SPAN_DAYS + 1) * 1440)) {
      throw new IcsParseError('Calendar event has an invalid or excessive timed duration.');
    }
  }
  if (durationMinutes !== null && (!Number.isFinite(durationMinutes) || durationMinutes < 0)) {
    throw new IcsParseError('Calendar event has an invalid timed date range.');
  }
  if (durationMinutes === null || durationMinutes < 1440) return null;
  return { kind: 'timed', minutes: durationMinutes };
}

/** First and last busy day of one occurrence. DTEND is exclusive: a timed end at exactly
 * midnight does not block that next day. */
function occurrenceDays(start: DateTimeValue, shape: NonNullable<EventShape>): { first: string; last: string } {
  if (shape.kind === 'all-day') return { first: start.date, last: addDays(start.date, shape.days - 1) };
  const end = wallAtInstant(start.instantMs! + shape.minutes * 60000, start.zone);
  const exclusiveMidnightEnd = end.hours === 0 && end.minutes === 0 && end.seconds === 0;
  const last = end.date > start.date ? (exclusiveMidnightEnd ? addDays(end.date, -1) : end.date) : start.date;
  return { first: start.date, last };
}

/** A recurrence instance on another date, keeping DTSTART's wall-clock time and zone.
 * RFC 5545 §3.3.10: an instance at a nonexistent local time is ignored (null); a repeated
 * local time takes its first occurrence. */
function instanceOn(date: string, start: DateTimeValue): DateTimeValue | null {
  if (start.isAllDay) return { ...start, date };
  const h = Math.floor(start.minutesOfDay / 60), m = start.minutesOfDay % 60, s = start.secondsOfDay;
  if (start.zone && start.zone !== 'UTC') {
    const candidates = zonedInstantCandidates(date, h, m, s, start.zone);
    return candidates.length === 0 ? null : { ...start, date, instantMs: candidates[0] };
  }
  return { ...start, date, instantMs: utcWallMillis(date, h, m, s) };
}

function exactKey(v: DateTimeValue): string {
  return v.isAllDay ? `D${v.date}` : `T${v.instantMs}`;
}

/** Matches EXDATE / RECURRENCE-ID values to instances: exactly on the instant (timed) or
 * date (all-day). A value of the other type (DATE vs DATE-TIME, which exporters mix up)
 * matches only on the same local date - lenient on value type, never fuzzy on the day. */
class InstanceMatcher<T> {
  private exact = new Map<string, T>();
  private looseDates = new Map<string, T>();
  add(v: DateTimeValue, value: T): void {
    this.exact.set(exactKey(v), value);
    this.looseDates.set(`${v.isAllDay ? 'T' : 'D'}${v.date}`, value);
  }
  get(instance: DateTimeValue): T | undefined {
    return this.exact.get(exactKey(instance)) ?? this.looseDates.get(`${instance.isAllDay ? 'D' : 'T'}${instance.date}`);
  }
}

/** Splits a multi-valued RDATE/EXDATE property (comma-separated, RFC 5545 §3.8.5) into single values. */
function propValues(prop: RawProp): RawProp[] {
  return prop.value.split(',').map(value => ({ ...prop, value }));
}

/** UNTIL is inclusive (RFC 5545 §3.3.10). */
function untilChecker(until: string, start: DateTimeValue): (instance: DateTimeValue) => boolean {
  // Resolved once per rule: a zoned UNTIL costs several Intl calls.
  const untilDate = `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}`;
  if (!validCalendarDate(untilDate)) return () => false;
  if (until.length === 8) return instance => instance.date <= untilDate;
  const h = Number(until.slice(9, 11)), m = Number(until.slice(11, 13)), s = Number(until.slice(13, 15));
  const utc = until.endsWith('Z');
  if (start.isAllDay) {
    // An all-day series with a date-time UTC UNTIL (a common exporter shape): compare dates.
    const lastDate = utc ? new Date(utcWallMillis(untilDate, h, m, s)).toISOString().slice(0, 10) : untilDate;
    return instance => instance.date <= lastDate;
  }
  const untilMs = utc || !start.zone || start.zone === 'UTC'
    ? utcWallMillis(untilDate, h, m, s)
    : zonedInstantCandidates(untilDate, h, m, s, start.zone)[0] ?? utcWallMillis(untilDate, h, m, s);
  return instance => instance.instantMs! <= untilMs;
}



function untilDateOf(until: string): string {
  return `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}`;
}

export interface ImportWindow { start: string; end: string }

export interface ParseIcsOptions {
  /** Recurring series are expanded only across this inclusive date range (normally the
   * planning window). Without it each series is expanded for MAX_IMPORT_SPAN_DAYS from its
   * own DTSTART, and a series that keeps going past that is reported as truncated. */
  window?: ImportWindow;
}

/** A usable expansion window: real dates, in order, at most MAX_IMPORT_SPAN_DAYS long. */
export function isValidImportWindow(window: ImportWindow | null | undefined): window is ImportWindow {
  return Boolean(window) && typeof window!.start === 'string' && typeof window!.end === 'string'
    && validCalendarDate(window!.start) && validCalendarDate(window!.end) && window!.end >= window!.start
    && isoToSerial(window!.end) - isoToSerial(window!.start) <= MAX_IMPORT_SPAN_DAYS;
}

function validWindow(window: ImportWindow | undefined): ImportWindow | null {
  if (window === undefined) return null;
  if (!isValidImportWindow(window)) throw new IcsParseError('The planning window for this import is invalid.');
  return window;
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
 * STATUS:CANCELLED events are not busy.
 *
 * Issue 16: recurring events are expanded for the bounded subset in icsRecurrence.ts
 * (RRULE, RDATE, EXDATE, RECURRENCE-ID overrides incl. STATUS:CANCELLED), only across the
 * planning window and with a per-series instance cap. A series using anything outside that
 * subset is reported in `recurrence.unsupported` (with reasons) and contributes nothing,
 * never a partial or wrong expansion. Timed series shorter than 24 hours never produce a
 * busy day, so they are neither expanded nor reported.
 */
export function parseICSBusyDays(raw: string, options: ParseIcsOptions = {}): ParsedImportResult {
  if (typeof raw !== 'string' || raw.length > MAX_IMPORT_CHARS) {
    throw new IcsParseError('Calendar file is too large to import safely.');
  }
  const window = validWindow(options.window);

  const lines = unfoldLines(raw);
  if (lines[0] !== 'BEGIN:VCALENDAR' || lines[lines.length - 1] !== 'END:VCALENDAR') {
    throw new IcsParseError("This doesn't look like a calendar (.ics) file, or it is incomplete.");
  }
  const events: EventRecord[] = [];
  let eventCount = 0;
  let cappedAt: number | null = null;

  let current: EventRecord | null = null;
  // Depth inside a sub-component of the event (VALARM etc.): its DTSTART/DURATION are not the event's.
  let subDepth = 0;

  for (const line of lines) {
    const prop = parseLine(line);
    if (!prop) continue;

    if (prop.name === 'BEGIN' && prop.value === 'VEVENT') {
      if (current) throw new IcsParseError('Calendar has a nested event.');
      eventCount++;
      if (eventCount > MAX_IMPORT_EVENTS) {
        cappedAt = MAX_IMPORT_EVENTS;
        break;
      }
      current = {
        uid: null, dtstart: null, dtend: null, duration: null, rrules: [], rdates: [], exdates: [],
        exrule: false, recurrenceId: null, cancelled: false,
      };
      subDepth = 0;
      continue;
    }
    if (prop.name === 'END' && prop.value === 'VEVENT') {
      if (!current) throw new IcsParseError('Calendar has an unmatched event end.');
      events.push(current);
      current = null;
      continue;
    }
    if (!current) continue;
    if (prop.name === 'BEGIN') {
      subDepth++;
      continue;
    }
    if (prop.name === 'END') {
      subDepth = Math.max(0, subDepth - 1);
      continue;
    }
    if (subDepth > 0) continue;

    if (prop.name === 'DTSTART') current.dtstart = prop;
    else if (prop.name === 'DTEND') current.dtend = prop;
    else if (prop.name === 'DURATION') current.duration = prop.value;
    else if (prop.name === 'UID') current.uid = prop.value;
    else if (prop.name === 'STATUS') current.cancelled = prop.value.trim().toUpperCase() === 'CANCELLED';
    else if (prop.name === 'RRULE') { if (current.rrules.length <= MAX_RULE_LINES_PER_EVENT) current.rrules.push(prop.value); }
    else if (prop.name === 'RDATE') { if (current.rdates.length <= MAX_DATE_LIST_LINES_PER_EVENT) current.rdates.push(prop); }
    else if (prop.name === 'EXDATE') { if (current.exdates.length <= MAX_DATE_LIST_LINES_PER_EVENT) current.exdates.push(prop); }
    else if (prop.name === 'EXRULE') current.exrule = true;
    else if (prop.name === 'RECURRENCE-ID') current.recurrenceId = prop;
  }

  if (current && cappedAt === null) {
    throw new IcsParseError('Calendar has an unclosed event.');
  }

  const busy = new Set<string>();
  const recurrence: RecurrenceSummary = { expanded: 0, unsupported: 0, truncated: 0, unsupportedReasons: [], truncatedReasons: [], iterations: 0 };
  const reasons = new Set<string>();
  const truncatedReasons = new Set<string>();
  let fileBudgetRemaining = MAX_RECURRENCE_ITERATIONS;
  let dateValuesRemaining = MAX_RECURRENCE_DATE_VALUES;
  let zonedInstancesRemaining = MAX_ZONED_RECURRENCE_INSTANCES;

  const addSingle = (ev: EventRecord): void => {
    if (ev.cancelled || !ev.dtstart) return;
    const start = parseDateTimeValue(ev.dtstart);
    if (!start) throw new IcsParseError('Calendar event has an invalid start date.');
    const shape = eventShape(start, ev);
    if (!shape) return;
    const { first, last } = occurrenceDays(start, shape);
    addBoundedDays(busy, first, last);
  };

  // RECURRENCE-ID overrides, grouped by UID, are applied to their master series (in any
  // file order); an override whose master is absent is just an event of its own.
  const overridesByUid = new Map<string, EventRecord[]>();
  const masters: EventRecord[] = [];
  for (const ev of events) {
    if (ev.recurrenceId && ev.uid !== null) {
      const group = overridesByUid.get(ev.uid) ?? [];
      group.push(ev);
      overridesByUid.set(ev.uid, group);
    } else masters.push(ev);
  }
  const masterUids = new Set(masters.flatMap(ev => (ev.uid !== null && !ev.recurrenceId ? [ev.uid] : [])));
  for (const [uid, overrides] of overridesByUid) {
    if (!masterUids.has(uid)) overrides.forEach(addSingle);
  }

  for (const ev of masters) {
    const overrides = ev.uid !== null ? overridesByUid.get(ev.uid) ?? [] : [];
    const recurring = ev.rrules.length > 0 || ev.rdates.length > 0 || ev.exdates.length > 0 || ev.exrule || overrides.length > 0;
    if (!recurring || ev.recurrenceId) {
      addSingle(ev);
      continue;
    }
    if (ev.cancelled || !ev.dtstart) continue;
    const start = parseDateTimeValue(ev.dtstart);
    if (!start) throw new IcsParseError('Calendar event has an invalid start date.');
    const shape = eventShape(start, ev);
    if (!shape) {
      // Never busy at its own length (e.g. a weekly meeting): only an override that makes
      // one occurrence long enough can matter.
      overrides.forEach(addSingle);
      continue;
    }

    const reason = ((): string | null => {
      if (ev.exrule) return 'EXRULE';
      if (ev.rrules.length > MAX_RULE_LINES_PER_EVENT) return 'too many RRULE lines';
      if (ev.rdates.length > MAX_DATE_LIST_LINES_PER_EVENT || ev.exdates.length > MAX_DATE_LIST_LINES_PER_EVENT) return 'too many RDATE/EXDATE lines';
      for (const text of ev.rrules) {
        const parsed = parseRRule(text);
        if (!parsed.ok) return parsed.reason;
      }
      if (ev.rdates.some(p => p.params.VALUE?.toUpperCase() === 'PERIOD')) return 'RDATE;VALUE=PERIOD';
      if (overrides.some(o => o.recurrenceId!.params.RANGE !== undefined)) return 'RANGE=THISANDFUTURE';
      return null;
    })();
    if (reason) {
      recurrence.unsupported++;
      reasons.add(reason);
      continue;
    }
    const rules = ev.rrules.map(text => (parseRRule(text) as { ok: true; rule: RecurrenceRule }).rule);
    const rdateProps = ev.rdates.flatMap(propValues);
    const exdateProps = ev.exdates.flatMap(propValues);
    const dateValues = rdateProps.length + exdateProps.length + overrides.length;
    if (rdateProps.length > MAX_RECURRENCE_INSTANCES || exdateProps.length > MAX_RECURRENCE_INSTANCES
      || dateValues > dateValuesRemaining) {
      recurrence.unsupported++;
      reasons.add('too many RDATE/EXDATE values');
      continue;
    }
    dateValuesRemaining -= dateValues;
    const valueOf = (p: RawProp, what: string): DateTimeValue => {
      const v = parseDateTimeValue(p);
      if (!v) throw new IcsParseError(`Calendar event has an invalid ${what} date.`);
      return v;
    };
    const rdates = rdateProps.map(p => valueOf(p, 'RDATE'));
    const excluded = new InstanceMatcher<true>();
    for (const p of exdateProps) excluded.add(valueOf(p, 'EXDATE'), true);
    const overrideFor = new InstanceMatcher<EventRecord>();
    for (const o of overrides) overrideFor.add(valueOf(o.recurrenceId!, 'RECURRENCE-ID'), o);

    // Expansion bounds: the planning window, or a horizon from DTSTART; generation starts
    // one occurrence-length earlier so an occurrence overlapping the window start counts.
    const lengthDays = shape.kind === 'all-day' ? shape.days : Math.ceil(shape.minutes / 1440) + 1;
    const rangeStart = window ? window.start : start.date;
    const rangeEnd = window ? window.end : addDays(start.date, MAX_IMPORT_SPAN_DAYS);
    const generateFrom = addDays(rangeStart, -lengthDays);

    const instances = new Map<string, DateTimeValue>();
    instances.set(exactKey(start), start); // DTSTART always counts as the first occurrence
    let truncated = false;
    const markTruncated = (why: string) => { truncated = true; truncatedReasons.add(why); };
    const budget: WorkBudget = { remaining: Math.min(MAX_RECURRENCE_ITERATIONS_PER_SERIES, fileBudgetRemaining), exhausted: false };
    const budgetAtStart = budget.remaining;
    const zoned = !start.isAllDay && start.zone !== null && start.zone !== 'UTC';
    for (const rule of rules) {
      let count = 1;
      let exhausted = rule.count !== null && count >= rule.count;
      if (!exhausted && !truncated) {
        const untilOk = rule.until !== null ? untilChecker(rule.until, start) : null;
        for (const date of ruleDates(rule, start.date, rangeEnd, generateFrom, budget)) {
          // Each instance in an IANA zone costs several Intl calls: separately capped per file.
          if (zoned && --zonedInstancesRemaining < 0) { budget.exhausted = true; break; }
          const instance = instanceOn(date, start);
          if (!instance) continue; // nonexistent local time: ignored and not counted
          if (untilOk && !untilOk(instance)) { exhausted = true; break; }
          count++;
          if (date >= generateFrom) {
            if (instances.size >= MAX_RECURRENCE_INSTANCES) { markTruncated('too many instances'); break; }
            instances.set(exactKey(instance), instance);
          }
          if (rule.count !== null && count >= rule.count) { exhausted = true; break; }
        }
        // Out of work budget before the rule finished: incomplete, never "expanded".
        if (budget.exhausted && !exhausted) markTruncated('too many repeats to check');
      }
      // With no planning window, a rule that is still running at the horizon is incomplete.
      if (!window && !exhausted && !truncated
        && (rule.count !== null || rule.until === null || untilDateOf(rule.until) > rangeEnd)) markTruncated('repeats past the import horizon');
    }
    const spent = budgetAtStart - Math.max(0, budget.remaining);
    fileBudgetRemaining -= spent;
    recurrence.iterations += spent;
    for (const v of rdates) {
      if (instances.size >= MAX_RECURRENCE_INSTANCES) { markTruncated('too many instances'); break; }
      instances.set(exactKey(v), v); // duplicates of RRULE instances collapse (RFC 5545 §3.8.5.2)
    }

    const usedOverrides = new Set<EventRecord>();
    for (const instance of instances.values()) {
      if (excluded.get(instance)) continue; // EXDATE wins over RRULE/RDATE (RFC 5545 §3.8.5.1)
      const override = overrideFor.get(instance);
      if (override) {
        usedOverrides.add(override);
        addSingle(override);
        continue;
      }
      const { first, last } = occurrenceDays(instance, shape);
      if (last < rangeStart || first > rangeEnd) continue;
      addBoundedDays(busy, first, last);
    }
    // Overrides that matched no generated instance (e.g. outside the window) still stand
    // on their own; cancelled ones contribute nothing either way.
    overrides.filter(o => !usedOverrides.has(o)).forEach(addSingle);

    if (truncated) recurrence.truncated++;
    else recurrence.expanded++;
  }

  recurrence.unsupportedReasons = [...reasons].sort();
  recurrence.truncatedReasons = [...truncatedReasons].sort();
  return {
    busyDays: Array.from(busy).sort(),
    eventCount: cappedAt !== null ? cappedAt : eventCount,
    cappedAt,
    skippedRecurring: recurrence.unsupported + recurrence.truncated,
    recurrence,
  };
}

/** Issue 16: one plain sentence whenever repeating events were not fully imported. */
export function incompleteRecurrenceMessage(recurrence: Pick<RecurrenceSummary, 'expanded' | 'unsupported' | 'unsupportedReasons' | 'truncated'>): string | null {
  const parts: string[] = [];
  const events = (n: number) => `${n} repeating event${n === 1 ? '' : 's'}`;
  if (recurrence.unsupported > 0) {
    parts.push(`${events(recurrence.unsupported)} ${recurrence.unsupported === 1 ? 'is' : 'are'} not included (uses ${recurrence.unsupportedReasons.join(', ')}).`);
  }
  if (recurrence.truncated > 0) {
    parts.push(`${events(recurrence.truncated)} ${recurrence.truncated === 1 ? 'was' : 'were'} only partly included (too many repeats).`);
  }
  return parts.length === 0 ? null : `Import incomplete: ${parts.join(' ')} Add those dates by hand.`;
}
