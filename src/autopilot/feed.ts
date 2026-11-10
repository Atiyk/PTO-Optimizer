/**
 * F1 live plan feed + F2 book-by nudges: the /pto plan as a subscribable calendar.
 *
 * Pure: the same query string, `today` and holiday data always give the same bytes, so a
 * CDN can cache it and tests can pin it. Events are written by the same helpers as the
 * downloaded .ics (src/ui/icsExport.ts), so a subscribed calendar and a download made on
 * the same day carry byte-identical PTO-day and book-by events.
 *
 * Client behaviour this is written for (checked November 2026, see the run report):
 * - Google Calendar ignores VALARMs in calendars added "From URL" and refreshes on its own
 *   schedule (several hours up to about a day), ignoring REFRESH-INTERVAL. The book-by
 *   event itself is the nudge there, so it's titled to be read in a month view.
 * - Apple Calendar strips alerts from a new subscription by default ("Remove: Alerts"),
 *   and lets the person turn them on; it honours its own auto-refresh setting.
 * - Outlook subscriptions are read-only and reminders from the feed are not reliable.
 */
import { PRODUCT_NAME } from '../brand';
import { isValidISODate } from '../ui/urlState';
import {
  addOneDayICS, bookByEventLines, dtstampNow, escapeText, foldLine, isoToICSDate, ptoDayEventLines,
} from '../ui/icsExport';
import { planFromSearch, type HolidayEntry, type HolidaySource, type SolvedPlan } from './planFromSearch';

/** Longest query string the feed accepts (F1 bound). Longer plan links (large employer
 * calendars) can still be downloaded as .ics. */
export const MAX_FEED_QUERY_LENGTH = 4096;

export const FEED_CALENDAR_NAME = `${PRODUCT_NAME} - PTO plan`;

export type FeedResult = { ok: true; ics: string; plan: SolvedPlan } | { ok: false; status: number; message: string };

function stripQuestionMark(search: string): string {
  return search.startsWith('?') ? search.slice(1) : search;
}

/** One all-day event per date that the plan counts as a day off for a holiday (public,
 * regional or company). Same UID scheme as the landing page's holiday download; two
 * holidays on one date share one event so UIDs stay unique. */
export function holidayEventLines(entries: HolidayEntry[], country: string, dtstamp: string): string[] {
  const byDate = new Map<string, string[]>();
  for (const entry of entries) {
    if (!entry.checked) continue;
    const names = byDate.get(entry.date) ?? [];
    if (!names.includes(entry.name)) names.push(entry.name);
    byDate.set(entry.date, names);
  }
  const lines: string[] = [];
  for (const [date, names] of [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const dateStart = isoToICSDate(date);
    lines.push('BEGIN:VEVENT');
    lines.push(foldLine(`UID:holiday-${dateStart}-${encodeURIComponent(country)}@pto-optimizer.app`));
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART;VALUE=DATE:${dateStart}`);
    lines.push(`DTEND;VALUE=DATE:${addOneDayICS(dateStart)}`);
    lines.push(foldLine(`SUMMARY:${escapeText(names.join(' / '))}`));
    lines.push('TRANSP:TRANSPARENT');
    lines.push('END:VEVENT');
  }
  return lines;
}

/** Deterministic DTSTAMP: midnight UTC of `today`. */
export function feedDtstamp(today: string): string {
  return dtstampNow(new Date(`${today}T00:00:00Z`));
}

export function buildPlanFeedICS(search: string, today: string, holidays: HolidaySource): FeedResult {
  const query = stripQuestionMark(search);
  if (query.length > MAX_FEED_QUERY_LENGTH) {
    return { ok: false, status: 400, message: 'This plan link is too long for a calendar feed. Download the .ics file instead.' };
  }
  if (!isValidISODate(today)) return { ok: false, status: 400, message: 'Invalid date.' };
  const params = new URLSearchParams(query);
  for (const key of ['s', 'e', 'xd', 'afs', 'pcs', 'pce']) {
    const value = params.get(key);
    if (value !== null && !isValidISODate(value)) return { ok: false, status: 400, message: 'The plan link has an invalid date.' };
  }

  const plan = planFromSearch(query, today, holidays);
  if (!plan.ok) return { ok: false, status: 400, message: plan.issues.join(' ') };

  const dtstamp = feedDtstamp(today);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${PRODUCT_NAME}//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    foldLine(`X-WR-CALNAME:${escapeText(FEED_CALENDAR_NAME)}`),
    'REFRESH-INTERVAL;VALUE=DURATION:PT12H',
    'X-PUBLISHED-TTL:PT12H',
    ...ptoDayEventLines(plan.breaks, plan.isPtoDay, dtstamp),
    ...bookByEventLines(plan.breaks, today, plan.state.noticePeriodDays, dtstamp, plan.state.workWeek, plan.solveInput.offDays),
    ...holidayEventLines(plan.holidayEntries.map((entry) => entry.source === 'custom'
      ? { ...entry, name: 'Employer-observed day off' }
      : entry), plan.state.country, dtstamp),
    'END:VCALENDAR',
  ];
  return { ok: true, ics: lines.join('\r\n') + '\r\n', plan };
}
