/**
 * Private calendar-feed links, format 2 (`fv=2` for /api/feed, `wv=2` for /api/watch).
 *
 * Format 1 put the plan's or policy's INPUTS in the subscription URL (PTO budget, and for
 * the watch feed the balance, accrual, carryover and expiry settings). That URL is fetched
 * by Google, Apple and Microsoft and written to request logs, and every fetch re-ran the
 * solver. Format 2 carries only the RESULT the person already sees on screen:
 *
 *   plan feed  (/api/feed?fv=2&...): country/region and plan range (to name public
 *              holidays), work week and alternate-Friday anchor (for request-by dates), and
 *              the chosen break dates with a bitmask of which days are PTO. Optional `ho`
 *              (observed holiday dates, opt-in, unlabelled) and `fc` (link creation date).
 *   watch feed (/api/watch?wv=2&...): the expiry reminder dates and suggested days, each
 *              tied to its deadline. No balance, accrual, carryover cap or day counts.
 *
 * The server never solves for a format-2 link, so a fetch costs a holiday-file lookup and
 * string building. Event UIDs are the same as format 1 (`pto-YYYYMMDD@pto-optimizer.app`,
 * `pto-reminder-...`, `holiday-...`, `expiration-...`, `rescue-...`), so a person who
 * resubscribes with a new link keeps the same events. Format-1 links stay accepted
 * (src/autopilot/feed.ts, watchFeed.ts): existing subscriptions keep working.
 */
import type { Break, ISODate } from '@daysoff/engine/solver/types';
import { rangeISO } from '@daysoff/engine/solver/dateUtils';
import { formatShortWithYear } from '@daysoff/engine/calendar/dateFormat';
import { PRODUCT_NAME } from '../brand';
import { isValidISODate } from '../ui/urlState';
import { addOneDayICS, bookByEventLines, escapeText, foldLine, isoToICSDate, ptoDayEventLines } from '../ui/icsExport';
import {
  altFridayOffDatesFor, consumerHolidaysFromSource, effectiveOffDaysFor, holidayEntriesFor, planStateFromSearch,
  stateHolidayCandidatesFor, type HolidayEntry, type HolidaySource, type PlanState,
} from './planFromSearch';
import { FEED_CALENDAR_NAME, feedCreatedOn, feedDtstamp, feedSnapshotNote, holidayEventLines, MAX_FEED_QUERY_LENGTH } from './feed';

export const PLAN_FEED_FORMAT_KEY = 'fv';
export const WATCH_FEED_FORMAT_KEY = 'wv';
/** Every key a format-2 plan feed link may carry. Nothing about balances or policy. */
export const PLAN_FEED_V2_KEYS = ['fv', 'c', 'sd', 's', 'e', 'ww', 'af', 'afs', 'sv', 'ho', 'k', 'fc'] as const;
export const WATCH_FEED_V2_KEYS = ['wv', 'r', 'd', 'fc'] as const;

/** Upper bounds a hand-edited link cannot exceed. */
const MAX_BREAKS = 120;
const MAX_BREAK_DAYS = 120;
const MAX_RANGE_DAYS = 3 * 366;
const MAX_WATCH_ITEMS = 200;

const DAY_MS = 86_400_000;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);

const compact = (iso: string) => iso.replace(/-/g, '');
function expand(ymd: string): string | null {
  if (!/^\d{8}$/.test(ymd)) return null;
  const iso = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
  return isValidISODate(iso) ? iso : null;
}

export function isPlanFeedV2(params: URLSearchParams): boolean {
  return params.get(PLAN_FEED_FORMAT_KEY) === '2';
}
export function isWatchFeedV2(params: URLSearchParams): boolean {
  return params.get(WATCH_FEED_FORMAT_KEY) === '2';
}

// ---------------------------------------------------------------------------------------
// Plan feed
// ---------------------------------------------------------------------------------------

export interface PlanFeedV2Input {
  /** The public plan query (buildPublicPlanSearch output): only c, sd, s, e, ww, af, afs and ho are read. */
  publicSearch: string;
  breaks: readonly Pick<Break, 'start' | 'end' | 'days' | 'ptoCost'>[];
  isPtoDay: (iso: string) => boolean;
  /** The day the link is made (`fc`). */
  createdOn: string;
}

/** One break: `YYYYMMDD-YYYYMMDD-<mask>[-<ptoCost>]`; mask has one 0/1 per day, 1 = PTO
 * day. The PTO cost is written only when it differs from the mask's count. */
export function encodeBreakToken(brk: Pick<Break, 'start' | 'end' | 'days' | 'ptoCost'>, isPtoDay: (iso: string) => boolean): string {
  const days = rangeISO(brk.start, brk.end);
  const mask = days.map((day) => (isPtoDay(day) && brk.days.includes(day) ? '1' : '0')).join('');
  const count = [...mask].filter((bit) => bit === '1').length;
  return `${compact(brk.start)}-${compact(brk.end)}-${mask}${brk.ptoCost !== count ? `-${brk.ptoCost}` : ''}`;
}

/** The format-2 query (without "?") for the plan the person is looking at. */
export function buildPlanFeedV2Search({ publicSearch, breaks, isPtoDay, createdOn }: PlanFeedV2Input): string {
  const source = new URLSearchParams(publicSearch.replace(/^\?/, ''));
  const params = new URLSearchParams({ fv: '2' });
  for (const key of ['c', 'sd', 's', 'e', 'ww', 'af', 'afs'] as const) {
    const value = source.get(key);
    if (value !== null && value !== '') params.set(key, value);
  }
  if (source.has('ho')) { params.set('sv', '1'); params.set('ho', source.get('ho') ?? ''); }
  params.set('k', [...breaks].sort((a, b) => a.start.localeCompare(b.start)).map((brk) => encodeBreakToken(brk, isPtoDay)).join('_'));
  if (isValidISODate(createdOn)) params.set('fc', createdOn);
  return params.toString();
}

export interface DecodedBreaks { breaks: Break[]; ptoDays: Set<string> }

/** Reads `k`. Null when any token is malformed or out of bounds. */
export function decodeBreakTokens(raw: string | null): DecodedBreaks | null {
  if (raw === null) return null;
  const breaks: Break[] = [];
  const ptoDays = new Set<string>();
  if (raw === '') return { breaks, ptoDays };
  const tokens = raw.split('_');
  if (tokens.length > MAX_BREAKS) return null;
  for (const token of tokens) {
    const match = /^(\d{8})-(\d{8})-([01]{1,120})(?:-(\d{1,3}(?:\.\d{1,2})?))?$/.exec(token);
    if (!match) return null;
    const start = expand(match[1]);
    const end = expand(match[2]);
    if (!start || !end || end < start) return null;
    const length = daysBetween(start, end) + 1;
    if (length > MAX_BREAK_DAYS || match[3].length !== length) return null;
    const days = rangeISO(start, end);
    let count = 0;
    days.forEach((day, index) => { if (match[3][index] === '1') { ptoDays.add(day); count += 1; } });
    const ptoCost = match[4] !== undefined ? Number(match[4]) : count;
    breaks.push({
      id: `${start}|${end}`, start, end, days, totalDaysOff: length, ptoCost,
      multiplier: ptoCost > 0 ? Math.round((length / ptoCost) * 100) / 100 : length,
      tags: [], meanDemand: 1,
    });
  }
  breaks.sort((a, b) => a.start.localeCompare(b.start));
  for (let i = 1; i < breaks.length; i++) if (breaks[i].start <= breaks[i - 1].end) return null;
  return { breaks, ptoDays };
}

/** The public-holiday side of a format-2 plan feed: the same entries the planner shows for
 * a public share link of this country, region and range (or the opted-in `ho` dates). */
export function planFeedV2Holidays(state: PlanState, holidays: HolidaySource): { entries: HolidayEntry[]; offDays: string[] } {
  const { country, subdivision, rangeStart, rangeEnd } = state;
  const national = consumerHolidaysFromSource(holidays, country, rangeStart, rangeEnd);
  const stateCandidates = subdivision
    ? stateHolidayCandidatesFor(consumerHolidaysFromSource(holidays, country, rangeStart, rangeEnd, subdivision), country, subdivision, rangeStart, rangeEnd)
    : [];
  const entries = holidayEntriesFor(national, stateCandidates, state.employerCalendar, rangeStart, rangeEnd, state.sharedObservedHolidays);
  return { entries, offDays: effectiveOffDaysFor(entries, altFridayOffDatesFor(state.altFridayEnabled, state.altFridayStart, rangeStart, rangeEnd)) };
}

/** The search planStateFromSearch reads for a format-2 link: only the allowlisted keys. */
export function planFeedV2StateSearch(params: URLSearchParams): string {
  const out = new URLSearchParams();
  for (const key of ['c', 'sd', 's', 'e', 'ww', 'af', 'afs', 'sv', 'ho'] as const) {
    const value = params.get(key);
    if (value !== null) out.set(key, value);
  }
  return out.toString();
}

export type PlanFeedV2Result = { ok: true; ics: string; state: PlanState } | { ok: false; status: number; message: string };

export function buildPlanFeedV2ICS(search: string, today: string, holidays: HolidaySource): PlanFeedV2Result {
  const query = search.replace(/^\?/, '');
  if (query.length > MAX_FEED_QUERY_LENGTH) {
    return { ok: false, status: 400, message: 'This plan link is too long for a calendar feed. Download the .ics file instead.' };
  }
  if (!isValidISODate(today)) return { ok: false, status: 400, message: 'Invalid date.' };
  const params = new URLSearchParams(query);
  for (const key of ['s', 'e', 'afs', 'fc']) {
    const value = params.get(key);
    if (value !== null && !isValidISODate(value)) return { ok: false, status: 400, message: 'The plan link has an invalid date.' };
  }
  const state = planStateFromSearch(planFeedV2StateSearch(params), today);
  const span = daysBetween(state.rangeStart, state.rangeEnd) + 1;
  if (!(span >= 1 && span <= MAX_RANGE_DAYS)) return { ok: false, status: 400, message: 'This plan is too large for a calendar feed. Download the .ics file instead.' };
  const decoded = decodeBreakTokens(params.get('k'));
  if (!decoded) return { ok: false, status: 400, message: 'The plan link has invalid break dates. Open your plan in Timebower and subscribe again.' };

  const { entries, offDays } = planFeedV2Holidays(state, holidays);
  const dtstamp = feedDtstamp(today);
  const note = feedSnapshotNote(feedCreatedOn(params.get('fc'), today));
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${PRODUCT_NAME}//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    foldLine(`X-WR-CALNAME:${escapeText(FEED_CALENDAR_NAME)}`),
    foldLine(`X-WR-CALDESC:${escapeText(note)}`),
    'REFRESH-INTERVAL;VALUE=DURATION:PT12H',
    'X-PUBLISHED-TTL:PT12H',
    ...ptoDayEventLines(decoded.breaks, (iso) => decoded.ptoDays.has(iso), dtstamp, note),
    ...bookByEventLines(decoded.breaks, today, state.noticePeriodDays, dtstamp, state.workWeek, offDays, state.noticeUnit, note),
    ...holidayEventLines(entries.map((entry) => entry.source === 'custom' ? { ...entry, name: 'Employer-observed day off' } : entry), state.country, dtstamp),
    'END:VCALENDAR',
  ];
  return { ok: true, ics: lines.join('\r\n') + '\r\n', state };
}

// ---------------------------------------------------------------------------------------
// Expiry watch feed
// ---------------------------------------------------------------------------------------

const RISK_KINDS = { forfeit: 'f', 'carried-expiring': 'c', cap: 'a' } as const;
type RiskPrefix = keyof typeof RISK_KINDS;
const KIND_TO_PREFIX: Record<string, RiskPrefix> = { f: 'forfeit', c: 'carried-expiring', a: 'cap' };

function riskToken(riskId: string): string | null {
  const match = /^(forfeit|carried-expiring|cap)-(\d{4}-\d{2}-\d{2})$/.exec(riskId);
  return match && isValidISODate(match[2]) ? `${RISK_KINDS[match[1] as RiskPrefix]}${compact(match[2])}` : null;
}
function riskIdFrom(token: string): string | null {
  const prefix = KIND_TO_PREFIX[token[0]];
  const date = expand(token.slice(1));
  return prefix && date ? `${prefix}-${date}` : null;
}

export interface WatchFeedV2Reminder { id: string; date: string; riskId: string; deadline: string; lead: number }
export interface WatchFeedV2Rescue { riskId: string; deadline: string; dates: readonly string[] }

/**
 * Reminder `r` items: `<risk><lead>.<eventYMD>.<deadlineYMD>`, e.g. `f20270101-60.20261102.20261231`
 * becomes UID `expiration-forfeit-2027-01-01-60`. Suggested-day `d` items:
 * `<risk>.<deadlineYMD>.<YMD>.<YMD>...`. Items are joined with `_`.
 */
export function buildWatchFeedV2Search(reminders: readonly WatchFeedV2Reminder[], rescues: readonly WatchFeedV2Rescue[], createdOn: string): string {
  const r: string[] = [];
  for (const reminder of reminders) {
    const risk = riskToken(reminder.riskId);
    if (!risk || reminder.id !== `expiration-${reminder.riskId}-${reminder.lead}` || !isValidISODate(reminder.date) || !isValidISODate(reminder.deadline)) continue;
    r.push(`${risk}-${reminder.lead}.${compact(reminder.date)}.${compact(reminder.deadline)}`);
  }
  const d: string[] = [];
  for (const rescue of rescues) {
    const risk = riskToken(rescue.riskId);
    const dates = [...new Set(rescue.dates.filter(isValidISODate))].sort();
    if (!risk || !isValidISODate(rescue.deadline) || dates.length === 0) continue;
    d.push([risk, compact(rescue.deadline), ...dates.map(compact)].join('.'));
  }
  const params = new URLSearchParams({ wv: '2', r: r.join('_'), d: d.join('_') });
  if (isValidISODate(createdOn)) params.set('fc', createdOn);
  return params.toString();
}

export type WatchFeedV2Result = { ok: true; ics: string } | { ok: false; status: number; message: string };

function ascii(text: string): string {
  return text.replace(/[–—]/g, '-').replace(/…/g, '...').replace(/[^\x20-\x7e\n]/g, '');
}

function watchSnapshotNote(createdOn: string | undefined): string {
  const [year, month, day] = (createdOn ?? '').split('-').map(Number);
  const origin = createdOn ? `Made from your policy in ${PRODUCT_NAME} on ${formatShortWithYear(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)}.` : `Made from your policy in ${PRODUCT_NAME}.`;
  return `${origin} This calendar does not hold your balance and is not recalculated: after changes, open ${PRODUCT_NAME}, check your balance and subscribe again.`;
}

export function buildWatchFeedV2ICS(search: string, today: string): WatchFeedV2Result {
  const query = search.replace(/^\?/, '');
  if (query.length > MAX_FEED_QUERY_LENGTH) return { ok: false, status: 414, message: 'The reminder link is too long for a calendar feed.' };
  if (!isValidISODate(today)) return { ok: false, status: 400, message: 'Invalid date.' };
  const params = new URLSearchParams(query);
  const bad = { ok: false as const, status: 400, message: 'This reminder link is not valid. Open your policy in Timebower and subscribe again.' };
  const reminders: { uid: string; date: string; deadline: string; lead: number }[] = [];
  const rescues: { uid: string; date: string; deadline: string }[] = [];
  const rawR = params.get('r') ?? '';
  const rawD = params.get('d') ?? '';
  const rItems = rawR ? rawR.split('_') : [];
  const dItems = rawD ? rawD.split('_') : [];
  if (rItems.length > MAX_WATCH_ITEMS || dItems.length > MAX_WATCH_ITEMS) return bad;
  for (const item of rItems) {
    const match = /^([fca]\d{8})-(\d{1,3})\.(\d{8})\.(\d{8})$/.exec(item);
    const riskId = match && riskIdFrom(match[1]);
    const date = match && expand(match[3]);
    const deadline = match && expand(match[4]);
    if (!match || !riskId || !date || !deadline) return bad;
    reminders.push({ uid: `expiration-${riskId}-${Number(match[2])}`, date, deadline, lead: Number(match[2]) });
  }
  for (const item of dItems) {
    const parts = item.split('.');
    const riskId = riskIdFrom(parts[0] ?? '');
    const deadline = expand(parts[1] ?? '');
    if (!riskId || !deadline || parts.length < 3 || parts.length > 2 + MAX_BREAK_DAYS * 4) return bad;
    for (const part of parts.slice(2)) {
      const date = expand(part);
      if (!date) return bad;
      rescues.push({ uid: `rescue-${encodeURIComponent(riskId)}-${part}`, date, deadline });
    }
  }
  const note = watchSnapshotNote(feedCreatedOn(params.get('fc'), today));
  const dtstamp = `${isoToICSDate(today)}T000000Z`;
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${PRODUCT_NAME}//EN`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    foldLine(`X-WR-CALNAME:${escapeText(ascii(`${PRODUCT_NAME} - PTO expiry watch`))}`),
    foldLine(`X-WR-CALDESC:${escapeText(ascii(`Reminders before PTO expires and suggested days to use it. ${note}`))}`),
    'REFRESH-INTERVAL;VALUE=DURATION:PT12H', 'X-PUBLISHED-TTL:PT12H',
  ];
  const seen = new Set<string>();
  const event = (uid: string, date: ISODate, summary: string, description: string, alarm: boolean) => {
    if (seen.has(uid) || date < today) return;
    seen.add(uid);
    const start = isoToICSDate(date);
    lines.push('BEGIN:VEVENT', foldLine(`UID:${uid}@pto-optimizer.app`), `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${addOneDayICS(start)}`,
      foldLine(`SUMMARY:${escapeText(ascii(summary))}`), foldLine(`DESCRIPTION:${escapeText(ascii(description))}`), 'TRANSP:TRANSPARENT');
    if (alarm) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', foldLine(`DESCRIPTION:${escapeText(ascii(summary))}`), 'TRIGGER:PT0S', 'END:VALARM');
    lines.push('END:VEVENT');
  };
  for (const reminder of reminders.sort((a, b) => a.date.localeCompare(b.date) || a.uid.localeCompare(b.uid))) {
    const deadline = formatShortWithYear(reminder.deadline);
    event(reminder.uid, reminder.date, `Use PTO by ${deadline}: ${reminder.lead}-day reminder`,
      `Some of your PTO may expire. Last day to use it: ${deadline}. Suggested days, if any, are marked "Suggested: use expiring PTO" in this calendar. ${note}`, true);
  }
  for (const rescue of rescues.sort((a, b) => a.deadline.localeCompare(b.deadline) || a.date.localeCompare(b.date))) {
    event(rescue.uid, rescue.date, 'Suggested: use expiring PTO',
      `A suggested day to use PTO before ${formatShortWithYear(rescue.deadline)}. This is a suggestion, not booked leave: request it with your employer. ${note}`, false);
  }
  lines.push('END:VCALENDAR');
  return { ok: true, ics: lines.join('\r\n') + '\r\n' };
}

/** Reminder events for the watch feed: every lead, from the same risks the page shows. */
export function watchFeedV2Reminders(reminders: readonly { id: string; date: string }[], risks: readonly { id: string; deadline: string }[]): WatchFeedV2Reminder[] {
  const out: WatchFeedV2Reminder[] = [];
  for (const reminder of reminders) {
    const risk = risks.find((candidate) => reminder.id.startsWith(`expiration-${candidate.id}-`));
    const lead = risk ? Number(reminder.id.slice(`expiration-${risk.id}-`.length)) : NaN;
    if (risk && Number.isInteger(lead)) out.push({ id: reminder.id, date: reminder.date, riskId: risk.id, deadline: risk.deadline, lead });
  }
  return out;
}

