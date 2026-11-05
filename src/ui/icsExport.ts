import type { Break } from '@daysoff/engine/solver/types';
import { parseISO, addDays } from '@daysoff/engine/solver/dateUtils';
import { formatDateRange, formatCardDateRange, formatShort } from '@daysoff/engine/calendar/dateFormat';
import type { Holiday } from '@daysoff/engine/data/holidays';
import { PRODUCT_NAME } from '../brand';
import { isValidISODate } from './urlState';

/** RFC 5545 TEXT escaping: backslash, comma, semicolon, and newline must be escaped. */
export function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
}

/** Folds a content line to at most 75 octets per RFC 5545 §3.1, continuing with CRLF + a
 * single leading space. Our fields are short in practice; this is a correctness guard for
 * unusually long holiday names or break spans, not something normal plans will trigger. */
export function foldLine(line: string): string {
  const CRLF = '\r\n';
  // Counted in UTF-8 octets, per the RFC, and never splitting a character: an en dash
  // or an accented holiday name is 2-3 octets, so counting UTF-16 units overran 75.
  // Identical output to the old character count for plain ASCII lines.
  let out = '';
  let lineOctets = 0;
  let limit = 75;
  for (const ch of line) {
    const octets = ch.codePointAt(0)! < 0x80 ? 1 : ch.codePointAt(0)! < 0x800 ? 2 : ch.codePointAt(0)! < 0x10000 ? 3 : 4;
    if (lineOctets + octets > limit) {
      out += CRLF + ' ';
      lineOctets = 0;
      limit = 74; // the continuation's leading space counts too
    }
    out += ch;
    lineOctets += octets;
  }
  return out;
}

export function isoToICSDate(iso: string): string {
  const { y, m, d } = parseISO(iso);
  return `${String(y).padStart(4, '0')}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}`;
}

export function addOneDayICS(icsDate: string): string {
  const y = Number(icsDate.slice(0, 4));
  const m = Number(icsDate.slice(4, 6));
  const d = Number(icsDate.slice(6, 8));
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return `${String(next.getUTCFullYear()).padStart(4, '0')}${String(next.getUTCMonth() + 1).padStart(2, '0')}${String(next.getUTCDate()).padStart(2, '0')}`;
}

export function dtstampNow(now: Date): string {
  return now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

/** `now` as a UTC calendar-date ISO string, same convention as the rest of the date
 * arithmetic in this file (never the viewer's local date). */
export function nowToISO(now: Date): string {
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

/** The per-PTO-day VEVENTs, shared by the downloaded .ics and the live feed (F1) so a
 * subscribed calendar and a downloaded one carry byte-identical events for the same day. */
export function ptoDayEventLines(breaks: Break[], isPtoDay: (iso: string) => boolean, dtstamp: string): string[] {
  const lines: string[] = [];
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
  return lines;
}

/** 7 days before an all-day event at 09:00 local: the trigger is relative to the event's
 * floating midnight start, so -7 days + 9 hours. Same form Apple Calendar writes. */
const ALARM_WEEK_BEFORE_9AM = '-P6DT15H';
/** 09:00 local on the day of an all-day event. */
const ALARM_ON_DAY_9AM = 'PT9H';

function displayAlarm(trigger: string, text: string): string[] {
  return ['BEGIN:VALARM', 'ACTION:DISPLAY', foldLine(`DESCRIPTION:${escapeText(text)}`), `TRIGGER:${trigger}`, 'END:VALARM'];
}

/**
 * F2 book-by nudges, shared by the download and the feed: one all-day event per future
 * break on its book-by date (break start minus the notice period, the same subtraction as
 * before), with display alarms 7 days before (only while that is still ahead of today) and
 * at 9:00 on the day. A break that hasn't started but whose book-by date has passed gets
 * its event on today, titled "book now". The title keeps the "Request time off: <range>"
 * lead so month views, which truncate, still say what to do.
 */
export function bookByEventLines(breaks: Break[], todayIso: string, leadDays: number, dtstamp: string): string[] {
  const lines: string[] = [];
  for (const brk of breaks) {
    if (brk.start <= todayIso) continue; // already underway or past - nothing left to request
    const bookBy = addDays(brk.start, -leadDays);
    const late = bookBy < todayIso;
    const eventIso = late ? todayIso : bookBy; // never place a reminder in the past
    const dateStart = isoToICSDate(eventIso);
    const dateEnd = addOneDayICS(dateStart);
    const title = `Request time off: ${formatCardDateRange(brk.start, brk.end)} (${late ? 'book now' : `book by ${formatShort(bookBy)}`})`;
    const dayWord = brk.totalDaysOff === 1 ? 'day' : 'days';
    const ptoWord = brk.ptoCost === 1 ? 'day' : 'days';
    const noticeWord = leadDays === 1 ? 'day' : 'days';
    const timing = late
      ? `Your ${leadDays}-day notice window has started. Book it now.`
      : `Book by ${formatShort(bookBy)} to give ${leadDays} ${noticeWord} of notice.`;
    const description = `${brk.ptoCost} PTO ${ptoWord} -> ${brk.totalDaysOff} ${dayWord} off (${brk.multiplier.toFixed(2)}x). ${timing}`;
    lines.push('BEGIN:VEVENT');
    lines.push(foldLine(`UID:pto-reminder-${dateStart}-${isoToICSDate(brk.start)}@pto-optimizer.app`));
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART;VALUE=DATE:${dateStart}`);
    lines.push(`DTEND;VALUE=DATE:${dateEnd}`);
    lines.push(foldLine(`SUMMARY:${escapeText(title)}`));
    lines.push(foldLine(`DESCRIPTION:${escapeText(description)}`));
    lines.push('TRANSP:TRANSPARENT');
    if (addDays(eventIso, -7) >= todayIso) lines.push(...displayAlarm(ALARM_WEEK_BEFORE_9AM, title));
    lines.push(...displayAlarm(ALARM_ON_DAY_9AM, title));
    lines.push('END:VEVENT');
  }
  return lines;
}

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
  lines.push(`PRODID:-//${PRODUCT_NAME}//EN`);
  lines.push('CALSCALE:GREGORIAN');
  lines.push(foldLine(`X-WR-CALNAME:${PRODUCT_NAME} - PTO plan`));

  const dtstamp = dtstampNow(now);
  lines.push(...ptoDayEventLines(breaks, isPtoDay, dtstamp));
  if (reminderOptions.enabled) lines.push(...bookByEventLines(breaks, nowToISO(now), reminderOptions.leadDays, dtstamp));

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
  lines.push(`PRODID:-//${PRODUCT_NAME}//EN`);
  lines.push('CALSCALE:GREGORIAN');
  lines.push(foldLine(`X-WR-CALNAME:${PRODUCT_NAME} - Public holidays`));

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

/**
 * Phase 4B /sabbatical export row: one all-day VEVENT spanning the whole trip
 * (extendedStart..extendedEnd inclusive - DTEND exclusive per RFC 5545, same as every
 * other event this file writes), not one event per day - a sabbatical is booked as a
 * single block on a real calendar, unlike /pto's per-day PTO events. Reuses this file's
 * own RFC 5545 helpers, same as generateHolidaysICS does, rather than a third writer.
 */
export function generateSabbaticalICS(extendedStart: string, extendedEnd: string, summary: string, description: string, now: Date = new Date()): string {
  const lines: string[] = [];
  lines.push('BEGIN:VCALENDAR');
  lines.push('VERSION:2.0');
  lines.push(`PRODID:-//${PRODUCT_NAME}//EN`);
  lines.push('CALSCALE:GREGORIAN');
  lines.push(foldLine(`X-WR-CALNAME:${PRODUCT_NAME} - Sabbatical`));

  const dtstamp = dtstampNow(now);
  const dateStart = isoToICSDate(extendedStart);
  const dateEnd = addOneDayICS(isoToICSDate(extendedEnd));
  lines.push('BEGIN:VEVENT');
  lines.push(foldLine(`UID:sabbatical-${dateStart}-${dateEnd}@pto-optimizer.app`));
  lines.push(`DTSTAMP:${dtstamp}`);
  lines.push(`DTSTART;VALUE=DATE:${dateStart}`);
  lines.push(`DTEND;VALUE=DATE:${dateEnd}`);
  lines.push(foldLine(`SUMMARY:${escapeText(summary)}`));
  lines.push(foldLine(`DESCRIPTION:${escapeText(description)}`));
  lines.push('TRANSP:TRANSPARENT');
  lines.push('END:VEVENT');

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

export function downloadSabbaticalICS(extendedStart: string, extendedEnd: string, summary: string, description: string, filename = 'sabbatical.ics'): void {
  downloadICSContent(generateSabbaticalICS(extendedStart, extendedEnd, summary, description), filename);
}

export interface CalendarReminder {
  id: string;
  date: string;
  title: string;
  description: string;
}

/** Uses the same all-day dates, escaping, exclusive DTEND and display alarms as plan exports. */
export function generateReminderICS(reminders: readonly CalendarReminder[], now: Date = new Date()): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${PRODUCT_NAME}//EN`, 'CALSCALE:GREGORIAN', foldLine(`X-WR-CALNAME:${PRODUCT_NAME} - PTO reminders`)];
  const seen = new Set<string>();
  for (const reminder of reminders) {
    if (!isValidISODate(reminder.date) || !reminder.id || seen.has(reminder.id)) continue;
    seen.add(reminder.id);
    const start = isoToICSDate(reminder.date);
    lines.push('BEGIN:VEVENT', foldLine(`UID:${encodeURIComponent(reminder.id)}@pto-optimizer.app`), `DTSTAMP:${dtstampNow(now)}`,
      `DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${addOneDayICS(start)}`,
      foldLine(`SUMMARY:${escapeText(reminder.title)}`), foldLine(`DESCRIPTION:${escapeText(reminder.description)}`),
      'TRANSP:TRANSPARENT', 'BEGIN:VALARM', 'ACTION:DISPLAY', foldLine(`DESCRIPTION:${escapeText(reminder.title)}`),
      'TRIGGER:PT0S', 'END:VALARM', 'END:VEVENT');
  }
  return [...lines, 'END:VCALENDAR', ''].join('\r\n');
}

export function downloadReminderICS(reminders: readonly CalendarReminder[], filename = 'pto-expiration-reminders.ics'): void {
  downloadICSContent(generateReminderICS(reminders), filename);
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

export interface OutOfOfficeBlock {
  /** Stable per tracked request, so downloading again updates the same event. */
  requestId: string;
  start: string;
  end: string;
  /** Plain text for the event's notes; never the user's private request note. */
  description?: string;
}

/**
 * F4: one all-day "Out of office" event over an approved request (DTEND exclusive), shown
 * as busy (TRANSP:OPAQUE) and as Outlook's "Out of office" status
 * (X-MICROSOFT-CDO-BUSYSTATUS:OOF), unlike the plan's transparent PTO-day events. The UID
 * comes from the request id and dates, so it is unique per request and stable across
 * downloads. Reuses this file's RFC 5545 helpers; carriage returns become newlines before
 * escaping so text can never start a new content line.
 */
export function generateOutOfOfficeICS(block: OutOfOfficeBlock, now: Date = new Date()): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${PRODUCT_NAME}//EN`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    foldLine(`X-WR-CALNAME:${PRODUCT_NAME} - Out of office`)];
  if (isValidISODate(block.start) && isValidISODate(block.end) && block.end >= block.start) {
    const start = isoToICSDate(block.start);
    const end = isoToICSDate(block.end);
    const id = block.requestId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 100) || 'request';
    const description = (block.description ?? '').replace(/\r\n?/g, '\n').slice(0, 2000);
    lines.push('BEGIN:VEVENT', foldLine(`UID:ooo-${id}-${start}-${end}@pto-optimizer.app`), `DTSTAMP:${dtstampNow(now)}`,
      `DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${addOneDayICS(end)}`, 'SUMMARY:Out of office');
    if (description) lines.push(foldLine(`DESCRIPTION:${escapeText(description)}`));
    lines.push('TRANSP:OPAQUE', 'X-MICROSOFT-CDO-BUSYSTATUS:OOF', 'X-MICROSOFT-CDO-INTENDEDSTATUS:OOF', 'X-MICROSOFT-CDO-ALLDAYEVENT:TRUE', 'END:VEVENT');
  }
  return [...lines, 'END:VCALENDAR', ''].join('\r\n');
}

export function downloadOutOfOfficeICS(block: OutOfOfficeBlock, filename = 'out-of-office.ics'): void {
  downloadICSContent(generateOutOfOfficeICS(block), filename);
}
