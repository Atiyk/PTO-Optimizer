import type { Break } from '@daysoff/engine/solver/types';
import { parseISO, addDays } from '@daysoff/engine/solver/dateUtils';
import { formatDateRange, formatCardDateRange } from '@daysoff/engine/calendar/dateFormat';
import type { Holiday } from '@daysoff/engine/data/holidays';

/** RFC 5545 TEXT escaping: backslash, comma, semicolon, and newline must be escaped. */
function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
}

/** Folds a content line to at most 75 octets per RFC 5545 §3.1, continuing with CRLF + a
 * single leading space. Our fields are short in practice; this is a correctness guard for
 * unusually long holiday names or break spans, not something normal plans will trigger. */
function foldLine(line: string): string {
  const CRLF = '\r\n';
  if (line.length <= 75) return line;
  let out = line.slice(0, 75);
  let rest = line.slice(75);
  while (rest.length > 0) {
    const chunk = rest.slice(0, 74); // 74, since the continuation's leading space counts too
    out += CRLF + ' ' + chunk;
    rest = rest.slice(74);
  }
  return out;
}

function isoToICSDate(iso: string): string {
  const { y, m, d } = parseISO(iso);
  return `${String(y).padStart(4, '0')}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}`;
}

function addOneDayICS(icsDate: string): string {
  const y = Number(icsDate.slice(0, 4));
  const m = Number(icsDate.slice(4, 6));
  const d = Number(icsDate.slice(6, 8));
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return `${String(next.getUTCFullYear()).padStart(4, '0')}${String(next.getUTCMonth() + 1).padStart(2, '0')}${String(next.getUTCDate()).padStart(2, '0')}`;
}

function dtstampNow(now: Date): string {
  return now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

/** `now` as a UTC calendar-date ISO string, same convention as the rest of the date
 * arithmetic in this file (never the viewer's local date). */
function nowToISO(now: Date): string {
  return `${String(now.getUTCFullYear()).padStart(4, '0')}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
}

export interface ReminderOptions {
  enabled: boolean;
  /** Phase 4: used to be a fixed 7|14|30 choice local to this export panel; now always the
   * same number as the user's own `noticePeriodDays` setting (see useAppState.ts), so the
   * .ics reminder can never land on a different date than the "Request by" date shown on
   * each break card - "the request-by date must match the .ics reminder dates" per spec. */
  leadDays: number;
}

/** Disabled by default at this level, deliberately - the product default (on, 14 days) is a
 * UI-level choice (ExportBar's own initial state), not something this pure function should
 * assume. Every existing call site that omits this argument keeps exporting PTO-day events
 * only, unchanged. */
const DEFAULT_REMINDER_OPTIONS: ReminderOptions = { enabled: false, leadDays: 14 };

/**
 * One all-day VEVENT per suggested-PTO day (not per break - a break's weekends/holidays
 * aren't PTO and get no event), titled "PTO" plus that day's break's overall date range so
 * every event in a multi-day break reads the same, recognisable title. All-day events use
 * DTEND exclusive (the day after), per RFC 5545.
 *
 * Optionally, one additional reminder VEVENT per break: `leadDays` before its start date,
 * titled "Request time off: <range>" with a VALARM attached so it actually notifies, not
 * just sits silently on the calendar. A break that's already started (or passed) gets no
 * reminder - there's nothing left to request. A break that hasn't started yet but is closer
 * than `leadDays` away gets its reminder clamped to today, never placed in the past.
 */
export function generateICS(
  breaks: Break[],
  isPtoDay: (iso: string) => boolean,
  now: Date = new Date(),
  reminderOptions: ReminderOptions = DEFAULT_REMINDER_OPTIONS,
): string {
  const lines: string[] = [];
  lines.push('BEGIN:VCALENDAR');
  lines.push('VERSION:2.0');
  lines.push('PRODID:-//PTO Optimizer//EN');
  lines.push('CALSCALE:GREGORIAN');

  const dtstamp = dtstampNow(now);

  for (const brk of breaks) {
    const title = `PTO (${formatDateRange(brk.start, brk.end)})`;
    for (const day of brk.days) {
      if (!isPtoDay(day)) continue;
      const dateStart = isoToICSDate(day);
      const dateEnd = addOneDayICS(dateStart);
      lines.push('BEGIN:VEVENT');
      lines.push(foldLine(`UID:pto-${dateStart}@pto-optimizer.app`));
      lines.push(`DTSTAMP:${dtstamp}`);
      lines.push(`DTSTART;VALUE=DATE:${dateStart}`);
      lines.push(`DTEND;VALUE=DATE:${dateEnd}`);
      lines.push(foldLine(`SUMMARY:${escapeText(title)}`));
      lines.push('TRANSP:TRANSPARENT');
      lines.push('END:VEVENT');
    }
  }

  if (reminderOptions.enabled) {
    const todayIso = nowToISO(now);
    for (const brk of breaks) {
      if (brk.start <= todayIso) continue; // already underway or past - nothing left to request
      let reminderIso = addDays(brk.start, -reminderOptions.leadDays);
      if (reminderIso < todayIso) reminderIso = todayIso; // never place a reminder in the past
      const dateStart = isoToICSDate(reminderIso);
      const dateEnd = addOneDayICS(dateStart);
      const title = `Request time off: ${formatCardDateRange(brk.start, brk.end)}`;
      const dayWord = brk.totalDaysOff === 1 ? 'day' : 'days';
      const ptoWord = brk.ptoCost === 1 ? 'day' : 'days';
      const description = `${brk.ptoCost} PTO ${ptoWord} -> ${brk.totalDaysOff} ${dayWord} off (${brk.multiplier.toFixed(2)}x).`;
      lines.push('BEGIN:VEVENT');
      lines.push(foldLine(`UID:pto-reminder-${dateStart}-${isoToICSDate(brk.start)}@pto-optimizer.app`));
      lines.push(`DTSTAMP:${dtstamp}`);
      lines.push(`DTSTART;VALUE=DATE:${dateStart}`);
      lines.push(`DTEND;VALUE=DATE:${dateEnd}`);
      lines.push(foldLine(`SUMMARY:${escapeText(title)}`));
      lines.push(foldLine(`DESCRIPTION:${escapeText(description)}`));
      lines.push('TRANSP:TRANSPARENT');
      lines.push('BEGIN:VALARM');
      lines.push('ACTION:DISPLAY');
      lines.push(foldLine(`DESCRIPTION:${escapeText(title)}`));
      lines.push('TRIGGER:PT0S');
      lines.push('END:VALARM');
      lines.push('END:VEVENT');
    }
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

export function downloadICS(
  breaks: Break[],
  isPtoDay: (iso: string) => boolean,
  reminderOptions: ReminderOptions = DEFAULT_REMINDER_OPTIONS,
  filename = 'pto-plan.ics',
): void {
  const content = generateICS(breaks, isPtoDay, new Date(), reminderOptions);
  downloadICSContent(content, filename);
}

/**
 * Landing page export: "Download all holidays (.ics)" - one all-day VEVENT per public
 * holiday, titled with its real name. Reuses this file's own RFC 5545 helpers
 * (escapeText/foldLine/isoToICSDate/addOneDayICS/dtstampNow) rather than a second ICS
 * writer - a holiday is a different kind of event than a PTO-break (no reminder, no tie to
 * a solved plan), but the file format underneath it is the one this module already owns.
 */
export function generateHolidaysICS(holidays: Holiday[], now: Date = new Date()): string {
  const lines: string[] = [];
  lines.push('BEGIN:VCALENDAR');
  lines.push('VERSION:2.0');
  lines.push('PRODID:-//PTO Optimizer//EN');
  lines.push('CALSCALE:GREGORIAN');

  const dtstamp = dtstampNow(now);
  for (const holiday of holidays) {
    const dateStart = isoToICSDate(holiday.date);
    const dateEnd = addOneDayICS(dateStart);
    lines.push('BEGIN:VEVENT');
    lines.push(foldLine(`UID:holiday-${dateStart}-${encodeURIComponent(holiday.countryCode)}@pto-optimizer.app`));
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART;VALUE=DATE:${dateStart}`);
    lines.push(`DTEND;VALUE=DATE:${dateEnd}`);
    lines.push(foldLine(`SUMMARY:${escapeText(holiday.name)}`));
    lines.push('TRANSP:TRANSPARENT');
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

export function downloadHolidaysICS(holidays: Holiday[], filename = 'holidays.ics'): void {
  downloadICSContent(generateHolidaysICS(holidays), filename);
}

function downloadICSContent(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
