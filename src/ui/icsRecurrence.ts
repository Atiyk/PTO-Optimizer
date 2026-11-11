import { isoToSerial, serialToISO, mondayIndexedDow } from '@daysoff/engine/solver/dateUtils';

/**
 * Issue 16: a deliberately BOUNDED RFC 5545 §3.3.10 RRULE subset - the shapes school and
 * personal calendars actually export - working on whole dates only (the time of day is
 * carried by the caller, from DTSTART). Anything outside this subset is returned as an
 * explicit unsupported reason so the import can say it is incomplete instead of silently
 * dropping or mis-expanding a series.
 *
 * Supported: FREQ=DAILY/WEEKLY/MONTHLY/YEARLY, INTERVAL, COUNT, UNTIL, WKST, BYMONTH,
 * BYDAY (plain weekdays; +n/-n ordinals for MONTHLY, and for YEARLY together with BYMONTH),
 * BYMONTHDAY (DAILY limit, MONTHLY/YEARLY expand; not combined with BYDAY).
 * Unsupported (reported): BYSETPOS, BYWEEKNO, BYYEARDAY, BYHOUR, BYMINUTE, BYSECOND,
 * FREQ=HOURLY/MINUTELY/SECONDLY, BYDAY+BYMONTHDAY together, YEARLY ordinal BYDAY without
 * BYMONTH, any unknown or malformed part.
 *
 * Parsing is split/compare only (no backtracking regex over unbounded input), the rule
 * text and every list are length-capped, and expansion stops at the caller's end date.
 */

export type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface WeekdaySpec {
  /** null = every such weekday in the period; otherwise 1..n from the start or -1..-n from the end. */
  ord: number | null;
  /** 0 = Monday .. 6 = Sunday */
  dow: number;
}

export interface RecurrenceRule {
  freq: Freq;
  interval: number;
  count: number | null;
  /** Raw UNTIL text (YYYYMMDD or YYYYMMDDTHHMMSS[Z]); resolved against DTSTART by the caller. */
  until: string | null;
  byDay: WeekdaySpec[] | null;
  byMonthDay: number[] | null;
  byMonth: number[] | null;
  wkst: number;
}

export type RuleParseResult = { ok: true; rule: RecurrenceRule } | { ok: false; reason: string };

export const MAX_RRULE_CHARS = 1000;
const MAX_LIST_ENTRIES = 62;
const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const UNSUPPORTED_PARTS = new Set(['BYSETPOS', 'BYWEEKNO', 'BYYEARDAY', 'BYHOUR', 'BYMINUTE', 'BYSECOND']);
const UNSUPPORTED_FREQS = new Set(['HOURLY', 'MINUTELY', 'SECONDLY']);

function isDigits(text: string, maxLen: number): boolean {
  if (text.length === 0 || text.length > maxLen) return false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 48 || c > 57) return false;
  }
  return true;
}

function signedInt(text: string, maxDigits: number): number | null {
  const sign = text.startsWith('-') ? -1 : 1;
  const body = text.startsWith('-') || text.startsWith('+') ? text.slice(1) : text;
  return isDigits(body, maxDigits) ? sign * Number(body) : null;
}

function list(value: string): string[] | null {
  const parts = value.split(',');
  return parts.length > MAX_LIST_ENTRIES || parts.some(p => p.length === 0) ? null : parts;
}

export function parseRRule(value: string): RuleParseResult {
  if (value.length > MAX_RRULE_CHARS) return { ok: false, reason: 'RRULE too long' };
  const parts = new Map<string, string>();
  for (const part of value.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) return { ok: false, reason: 'malformed RRULE' };
    const key = part.slice(0, eq).toUpperCase();
    if (parts.has(key)) return { ok: false, reason: `duplicate ${key}` };
    parts.set(key, part.slice(eq + 1).toUpperCase());
  }
  for (const key of parts.keys()) {
    if (UNSUPPORTED_PARTS.has(key)) return { ok: false, reason: key };
    if (!['FREQ', 'INTERVAL', 'COUNT', 'UNTIL', 'BYDAY', 'BYMONTHDAY', 'BYMONTH', 'WKST'].includes(key)) {
      return { ok: false, reason: key.startsWith('X-') ? 'X- rule part' : `unknown ${key}` };
    }
  }

  const freqText = parts.get('FREQ');
  if (!freqText) return { ok: false, reason: 'FREQ' };
  if (UNSUPPORTED_FREQS.has(freqText)) return { ok: false, reason: `FREQ=${freqText}` };
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freqText)) return { ok: false, reason: 'FREQ' };
  const freq = freqText as Freq;

  let interval = 1;
  const intervalText = parts.get('INTERVAL');
  if (intervalText !== undefined) {
    if (!isDigits(intervalText, 4) || Number(intervalText) < 1) return { ok: false, reason: 'INTERVAL' };
    interval = Number(intervalText);
  }

  let count: number | null = null;
  const countText = parts.get('COUNT');
  if (countText !== undefined) {
    if (!isDigits(countText, 6) || Number(countText) < 1) return { ok: false, reason: 'COUNT' };
    count = Number(countText);
  }

  const until = parts.get('UNTIL') ?? null;
  if (until !== null) {
    const datePart = until.slice(0, 8);
    const timePart = until.slice(8);
    const timeOk = timePart === '' || (timePart.length >= 7 && timePart.length <= 8 && timePart[0] === 'T'
      && isDigits(timePart.slice(1, 7), 6) && (timePart.length === 7 || timePart[7] === 'Z'));
    if (!isDigits(datePart, 8) || !timeOk) return { ok: false, reason: 'UNTIL' };
  }
  // RFC 5545 §3.3.10: UNTIL and COUNT MUST NOT occur in the same rule.
  if (count !== null && until !== null) return { ok: false, reason: 'COUNT+UNTIL' };

  let wkst = 0;
  const wkstText = parts.get('WKST');
  if (wkstText !== undefined) {
    wkst = WEEKDAYS.indexOf(wkstText);
    if (wkst < 0) return { ok: false, reason: 'WKST' };
  }

  let byMonth: number[] | null = null;
  const byMonthText = parts.get('BYMONTH');
  if (byMonthText !== undefined) {
    const items = list(byMonthText);
    if (!items || !items.every(m => isDigits(m, 2) && Number(m) >= 1 && Number(m) <= 12)) return { ok: false, reason: 'BYMONTH' };
    byMonth = [...new Set(items.map(Number))].sort((a, b) => a - b);
  }

  let byMonthDay: number[] | null = null;
  const byMonthDayText = parts.get('BYMONTHDAY');
  if (byMonthDayText !== undefined) {
    const items = list(byMonthDayText);
    const values = items?.map(v => signedInt(v, 2));
    if (!values || !values.every(v => v !== null && v !== 0 && Math.abs(v) <= 31)) return { ok: false, reason: 'BYMONTHDAY' };
    byMonthDay = [...new Set(values as number[])];
  }

  let byDay: WeekdaySpec[] | null = null;
  const byDayText = parts.get('BYDAY');
  if (byDayText !== undefined) {
    const items = list(byDayText);
    if (!items) return { ok: false, reason: 'BYDAY' };
    byDay = [];
    for (const item of items) {
      const dow = WEEKDAYS.indexOf(item.slice(-2));
      const ordText = item.slice(0, -2);
      const ord = ordText === '' ? null : signedInt(ordText, 2);
      if (dow < 0 || (ordText !== '' && (ord === null || ord === 0 || Math.abs(ord) > 53))) return { ok: false, reason: 'BYDAY' };
      byDay.push({ ord, dow });
    }
    // RFC 5545 §3.3.10: numeric BYDAY only with MONTHLY or YEARLY.
    if ((freq === 'DAILY' || freq === 'WEEKLY') && byDay.some(d => d.ord !== null)) return { ok: false, reason: 'BYDAY ordinal' };
  }

  // RFC 5545 §3.3.10: BYMONTHDAY MUST NOT be specified with WEEKLY.
  if (freq === 'WEEKLY' && byMonthDay) return { ok: false, reason: 'BYMONTHDAY with WEEKLY' };
  if (byDay && byMonthDay && freq !== 'DAILY') return { ok: false, reason: 'BYDAY+BYMONTHDAY' };
  if (freq === 'YEARLY' && byDay && !byMonth) return { ok: false, reason: 'YEARLY BYDAY without BYMONTH' };

  return { ok: true, rule: { freq, interval, count, until, byDay, byMonthDay, byMonth, wkst } };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function ymd(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Candidate dates inside one month, sorted, for MONTHLY and YEARLY periods. */
function monthCandidates(rule: RecurrenceRule, year: number, month: number, dtstartDay: number): string[] {
  const dim = daysInMonth(year, month);
  const days = new Set<number>();
  if (rule.byMonthDay) {
    for (const d of rule.byMonthDay) {
      const day = d > 0 ? d : dim + d + 1;
      if (day >= 1 && day <= dim) days.add(day); // invalid dates are ignored (RFC 5545 §3.3.10)
    }
  } else if (rule.byDay) {
    const firstDow = mondayIndexedDow(ymd(year, month, 1));
    for (const { ord, dow } of rule.byDay) {
      const first = 1 + ((dow - firstDow + 7) % 7);
      const all: number[] = [];
      for (let day = first; day <= dim; day += 7) all.push(day);
      if (ord === null) all.forEach(day => days.add(day));
      else {
        const day = ord > 0 ? all[ord - 1] : all[all.length + ord];
        if (day !== undefined) days.add(day);
      }
    }
  } else if (dtstartDay <= dim) {
    days.add(dtstartDay);
  }
  return [...days].sort((a, b) => a - b).map(day => ymd(year, month, day));
}

function passesLimits(rule: RecurrenceRule, iso: string): boolean {
  const month = Number(iso.slice(5, 7));
  if (rule.byMonth && rule.freq !== 'YEARLY' && !rule.byMonth.includes(month)) return false;
  if (rule.freq === 'DAILY') {
    if (rule.byDay && !rule.byDay.some(d => d.dow === mondayIndexedDow(iso))) return false;
    if (rule.byMonthDay) {
      const day = Number(iso.slice(8, 10));
      const dim = daysInMonth(Number(iso.slice(0, 4)), month);
      if (!rule.byMonthDay.some(d => (d > 0 ? d : dim + d + 1) === day)) return false;
    }
  }
  return true;
}

/**
 * Yields the rule's candidate dates in chronological order, strictly after DTSTART's date
 * (DTSTART itself is always the first instance and is added by the caller), and stops once
 * a period starts after `endDate`. When `fastForwardTo` is given the iteration may skip
 * whole periods that end before it - only valid when the rule has no COUNT, because
 * skipped periods would otherwise have to be counted.
 */
export function* ruleDates(rule: RecurrenceRule, dtstart: string, endDate: string, fastForwardTo?: string): Generator<string> {
  const startSerial = isoToSerial(dtstart);
  const endSerial = isoToSerial(endDate);
  const sy = Number(dtstart.slice(0, 4));
  const sm = Number(dtstart.slice(5, 7));
  const sd = Number(dtstart.slice(8, 10));
  const ff = fastForwardTo && rule.count === null && fastForwardTo > dtstart ? fastForwardTo : null;

  if (rule.freq === 'DAILY' || rule.freq === 'WEEKLY') {
    const periodDays = rule.freq === 'DAILY' ? 1 : 7;
    const firstPeriod = rule.freq === 'DAILY' ? startSerial : startSerial - ((mondayIndexedDow(dtstart) - rule.wkst + 7) % 7);
    const step = periodDays * rule.interval;
    let k = ff ? Math.max(0, Math.floor((isoToSerial(ff) - firstPeriod) / step) - 1) : 0;
    for (; firstPeriod + k * step <= endSerial; k++) {
      const periodStart = firstPeriod + k * step;
      const candidates: number[] = [];
      if (rule.freq === 'DAILY') candidates.push(periodStart);
      else if (rule.byDay) {
        for (const { dow } of rule.byDay) candidates.push(periodStart + ((dow - rule.wkst + 7) % 7));
        candidates.sort((a, b) => a - b);
      } else candidates.push(periodStart + ((mondayIndexedDow(dtstart) - rule.wkst + 7) % 7));
      let last = -Infinity;
      for (const serial of candidates) {
        if (serial === last) continue;
        last = serial;
        if (serial <= startSerial) continue;
        const iso = serialToISO(serial);
        if (passesLimits(rule, iso)) yield iso;
      }
    }
    return;
  }

  const endYear = Number(endDate.slice(0, 4));
  const endMonthIndex = endYear * 12 + Number(endDate.slice(5, 7)) - 1;
  if (rule.freq === 'MONTHLY') {
    const firstIndex = sy * 12 + sm - 1;
    let k = ff ? Math.max(0, Math.floor(((Number(ff.slice(0, 4)) * 12 + Number(ff.slice(5, 7)) - 1) - firstIndex) / rule.interval) - 1) : 0;
    for (; firstIndex + k * rule.interval <= endMonthIndex; k++) {
      const index = firstIndex + k * rule.interval;
      const year = Math.floor(index / 12);
      const month = (index % 12) + 1;
      if (rule.byMonth && !rule.byMonth.includes(month)) continue;
      for (const iso of monthCandidates(rule, year, month, sd)) {
        if (iso > dtstart) yield iso;
      }
    }
    return;
  }

  // YEARLY
  let k = ff ? Math.max(0, Math.floor((Number(ff.slice(0, 4)) - sy) / rule.interval) - 1) : 0;
  for (; sy + k * rule.interval <= endYear; k++) {
    const year = sy + k * rule.interval;
    const months = rule.byMonth ?? [sm];
    for (const month of months) {
      // Without BYMONTHDAY/BYDAY, a YEARLY rule keeps DTSTART's day-of-month (RFC 5545 §3.3.10).
      for (const iso of monthCandidates(rule, year, month, sd)) {
        if (iso > dtstart) yield iso;
      }
    }
  }
}
