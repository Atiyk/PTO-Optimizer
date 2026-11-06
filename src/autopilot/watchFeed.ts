import { COUNTRIES, SUBDIVISION_NAMES } from '@daysoff/engine/data/countries';
import type { Holiday } from '@daysoff/engine/data/holidays';
import { getStateHolidaysFallback } from '@daysoff/engine/data/usStateHolidays';
import { isAlternatingFridayOff } from '@daysoff/engine/calendar/calendarMath';
import { addDays, rangeISO } from '@daysoff/engine/solver/dateUtils';
import { DEFAULT_WORK_WEEK, type ISODate } from '@daysoff/engine/solver/types';
import type { AccrualMethod, CarryoverRule, PlanYear, TimeOffPolicy } from '../policy/model';
import { EXPIRATION_REMINDER_LEADS, expirationReminders, expirationRisks } from '../personal/expiration';
import { rescuePlans, rescueSuggestions, rescueSuggestionText, type RescuePlan } from '../personal/expiryRescue';
import { forecastWithRequests } from '../personal/forecast';
import type { RequestCalendar } from '../personal/requestLedger';
import { readPolicyStateFromURL, type PolicyURLState } from '../ui/policyUrlState';
import { isValidISODate } from '../ui/urlState';
import { addOneDayICS, escapeText, foldLine, isoToICSDate } from '../ui/icsExport';
import { PRODUCT_NAME } from '../brand';

/**
 * F3 "watch" feed: a subscribed calendar built only from the /policy page's URL state.
 * Each fetch recomputes expiration risks and rescue plans against `today`, so the
 * reminders and suggested days follow the calendar date without any stored data.
 * Pure: holidays are injected (the server reads public/holidays/<CC>-<YEAR>.json).
 */

export const WATCH_FEED_MAX_QUERY = 4096;

/** Observed public holidays for one country and year, or null when unavailable. Pass
 * `rawHolidaysToHolidays(json)` output from the committed holiday files. */
export type WatchFeedHolidays = (country: string, year: number) => readonly Holiday[] | null | undefined;

export type WatchFeedResult = { ok: true; ics: string } | { ok: false; status: number; message: string };

const COUNTRY_CODES = new Set(COUNTRIES.map(({ code }) => code));
const US_SUBDIVISIONS = new Set(Object.keys(SUBDIVISION_NAMES).filter((code) => code.startsWith('US-')));
const UID_DOMAIN = 'pto-optimizer.app';

/** The same TimeOffPolicy Policy.tsx builds from its controls, from URL state alone. */
export function policyFromURLState(state: PolicyURLState): TimeOffPolicy {
  const accrual: AccrualMethod = state.accrualKind === 'front-loaded' ? { kind: 'front-loaded', amount: state.amount, grantDate: state.grantDate }
    : state.accrualKind === 'per-pay-period' ? { kind: 'per-pay-period', amount: state.amount, frequency: state.frequency, payDateAnchor: state.payDateAnchor }
      : state.accrualKind === 'per-hour-worked' ? { kind: 'per-hour-worked', rate: state.hourlyRate, typicalWeeklyHours: state.typicalWeeklyHours }
        : { kind: 'unlimited', expectedDaysPerYear: state.expectedDaysPerYear };
  const planYear: PlanYear = state.planYearKind === 'anniversary' ? { kind: 'anniversary', startDate: state.anniversaryStart }
    : state.planYearKind === 'custom' ? { kind: 'custom', resetDate: state.customResetDate } : { kind: 'calendar' };
  const carryover: CarryoverRule = {
    mode: state.carryoverMode,
    cap: state.carryoverMode === 'capped' ? state.carryoverCap : undefined,
    useByDate: state.carryoverUseByEnabled ? state.carryoverUseBy : undefined,
  };
  return {
    unit: state.unit,
    hoursPerDay: state.hoursPerDay,
    accrual,
    planYear,
    accrualCap: state.accrualCapEnabled && state.accrualKind !== 'unlimited' ? state.accrualCap : undefined,
    carryover,
    waitingPeriodDays: state.waitingPeriodEnabled ? state.waitingPeriodDays : undefined,
    negativeBalanceAllowance: state.negativeBalanceAllowance,
    payoutOnLeaving: state.payoutOnLeaving,
    currentBalance: state.currentBalance,
    currentCarriedBalance: state.currentCarriedBalance ?? 0,
    balanceAsOf: state.balanceAsOf,
    plannedDays: state.plannedDays,
  };
}

/** readPolicyStateFromURL fills a missing date with the server clock's today. A feed must
 * be deterministic for its `today`, so those defaults are pinned to `today` first. */
function pinnedDefaults(search: string, today: ISODate): string {
  const params = new URLSearchParams(search);
  const year = today.slice(0, 4);
  const defaults: Record<string, string> = { pda: today, gd: today, as: today, crd: `${year}-12-31`, cub: `${year}-03-31`, bao: today };
  for (const [key, value] of Object.entries(defaults)) {
    const current = params.get(key);
    if (!current || !isValidISODate(current)) params.set(key, value);
  }
  return params.toString();
}

/** The employer calendar the /policy page builds (useRequestCalendar), from injected data:
 * national plus regional holidays, US state fallbacks, and alternating Fridays. Saved
 * employer holiday edits live in the browser and are not available to a feed. */
function feedCalendar(state: PolicyURLState, start: ISODate, end: ISODate, holidays: WatchFeedHolidays): { calendar: RequestCalendar & { subdivision?: string }; missingYears: number[] } {
  const subdivision = state.subdivision && state.subdivision.startsWith(`${state.country}-`) ? state.subdivision : undefined;
  const offDays = new Set<ISODate>();
  const missingYears: number[] = [];
  for (let year = Number(start.slice(0, 4)); year <= Number(end.slice(0, 4)); year++) {
    let list: readonly Holiday[] | null | undefined;
    try { list = holidays(state.country, year); } catch { list = null; }
    if (!Array.isArray(list)) { missingYears.push(year); list = []; }
    for (const holiday of list) {
      if (!holiday || typeof holiday.date !== 'string' || !isValidISODate(holiday.date) || holiday.countryCode !== state.country) continue;
      if (holiday.counties && !(subdivision && holiday.counties.includes(subdivision))) continue;
      offDays.add(holiday.date);
    }
    if (state.country === 'US' && subdivision && US_SUBDIVISIONS.has(subdivision)) {
      for (const fallback of getStateHolidaysFallback(subdivision, year)) offDays.add(fallback.date);
    }
  }
  if (state.altFridayStart) {
    for (const date of rangeISO(start, end)) if (isAlternatingFridayOff(date, state.altFridayStart)) offDays.add(date);
  }
  return {
    calendar: {
      workWeek: state.workWeek ?? DEFAULT_WORK_WEEK,
      offDays: [...offDays].filter((date) => date >= start && date <= end).sort(),
      rangeStart: start, rangeEnd: end, ...(subdivision ? { subdivision } : {}),
    },
    missingYears,
  };
}

function ascii(text: string): string {
  // Plain ASCII keeps foldLine's 75-character limit a 75-octet limit too.
  return text.replace(/[–—]/g, '-').replace(/…/g, '...').replace(/[^\x20-\x7e\n]/g, '');
}

function compact(iso: ISODate): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${d}, ${y}`;
}

function compactIn(text: string): string {
  return text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, (iso) => (isValidISODate(iso) ? compact(iso) : iso));
}

function rescueDayDescription(plan: RescuePlan, holidayNote: string): string {
  const keep = plan.kind === 'cap' ? 'It makes room under your accrual cap'
    : plan.daysStillAtRisk > 0 ? `It keeps ${round(plan.daysRescued)} of ${round(plan.daysAtRisk)} days at risk`
      : `It keeps all ${round(plan.daysAtRisk)} days at risk`;
  return `${rescueSuggestionText(plan)} ${keep} before ${compact(plan.deadline)}. This is a suggestion, not booked leave: request it with your employer.${holidayNote} Requests you track in Gapless on your device are not included.`;
}

function round(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** Far above any real PTO bank (in days); only a hand-edited link reaches it. */
export const WATCH_FEED_MAX_DAYS_AT_STAKE = 1000;

export function buildWatchFeedICS(policySearch: string, today: string, holidays: WatchFeedHolidays): WatchFeedResult {
  if (typeof policySearch !== 'string' || policySearch.length > WATCH_FEED_MAX_QUERY) {
    return { ok: false, status: 414, message: `The policy link is too long for a calendar feed (over ${WATCH_FEED_MAX_QUERY} characters).` };
  }
  if (typeof today !== 'string' || !isValidISODate(today)) return { ok: false, status: 400, message: 'Invalid date.' };
  const search = policySearch.startsWith('?') ? policySearch.slice(1) : policySearch;
  const params = new URLSearchParams(search);
  if (!params.has('cb')) return { ok: false, status: 400, message: 'This link has no PTO balance. Open your policy in Gapless and copy the link again.' };
  const country = params.get('c') ?? '';
  if (!COUNTRY_CODES.has(country)) return { ok: false, status: 400, message: 'This link has no supported country.' };
  const state = readPolicyStateFromURL(pinnedDefaults(search, today), country);
  const policy = policyFromURLState(state);
  if (forecastWithRequests(policy, policy.balanceAsOf) === null) {
    return { ok: false, status: 400, message: 'This policy link has values Gapless cannot forecast. Open it in Gapless to fix them.' };
  }

  const risks = expirationRisks(policy, country, [], today);
  // A hand-edited link (cb=1e308) forecasts, but no real balance is that large; refuse it
  // rather than print "Infinity days" into someone's calendar.
  if (risks.some((risk) => !Number.isFinite(risk.daysAtStake) || risk.daysAtStake > WATCH_FEED_MAX_DAYS_AT_STAKE)) {
    return { ok: false, status: 400, message: 'This policy link has values Gapless cannot forecast. Open it in Gapless to fix them.' };
  }
  const horizon = risks.reduce((latest, risk) => (risk.deadline > latest ? risk.deadline : latest), today);
  const { calendar, missingYears } = feedCalendar(state, today, horizon, holidays);
  const plans = rescuePlans(risks, { policy, country, requests: [], calendar, today });
  const holidayNote = missingYears.length ? ` Public holidays for ${missingYears.join(', ')} were not available, so a suggested day may fall on a holiday.` : '';
  const reminders = expirationReminders(risks, EXPIRATION_REMINDER_LEADS, today, rescueSuggestions(plans), 'feed');

  const dtstamp = `${isoToICSDate(today)}T000000Z`;
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${PRODUCT_NAME}//EN`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    foldLine(`X-WR-CALNAME:${escapeText(ascii(`${PRODUCT_NAME} - PTO expiry watch`))}`),
    foldLine(`X-WR-CALDESC:${escapeText(ascii(`Reminders before PTO expires and suggested days to use it, recomputed from your ${PRODUCT_NAME} policy link each time this calendar refreshes. Requests you track in ${PRODUCT_NAME} are stored on your device and are not included; add approved leave to your policy's planned days to count it.${holidayNote}`))}`),
    'REFRESH-INTERVAL;VALUE=DURATION:PT12H', 'X-PUBLISHED-TTL:PT12H',
  ];
  const seen = new Set<string>();
  const event = (uid: string, date: ISODate, summary: string, description: string, alarm: boolean) => {
    if (!isValidISODate(date) || seen.has(uid)) return;
    seen.add(uid);
    const start = isoToICSDate(date);
    lines.push('BEGIN:VEVENT', foldLine(`UID:${uid}@${UID_DOMAIN}`), `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${addOneDayICS(start)}`,
      foldLine(`SUMMARY:${escapeText(ascii(summary))}`), foldLine(`DESCRIPTION:${escapeText(ascii(description))}`), 'TRANSP:TRANSPARENT');
    if (alarm) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', foldLine(`DESCRIPTION:${escapeText(ascii(summary))}`), 'TRIGGER:PT0S', 'END:VALARM');
    lines.push('END:VEVENT');
  };
  for (const reminder of reminders) {
    const deadline = reminder.title.match(/\d{4}-\d{2}-\d{2}/)?.[0];
    event(encodeURIComponent(reminder.id), reminder.date, deadline ? reminder.title.replace(deadline, compact(deadline)) : reminder.title, compactIn(reminder.description) + holidayNote, true);
  }
  for (const plan of [...plans.values()].sort((a, b) => a.deadline.localeCompare(b.deadline))) {
    for (const date of plan.ptoDates) {
      if (date < today) continue;
      event(`rescue-${encodeURIComponent(plan.riskId)}-${isoToICSDate(date)}`, date, 'Suggested: use expiring PTO', rescueDayDescription(plan, holidayNote), false);
    }
  }
  lines.push('END:VCALENDAR');
  return { ok: true, ics: lines.join('\r\n') + '\r\n' };
}

/** Calendar years a feed computed on `today` can ask holidays for (risks look 550 days ahead). */
export function watchFeedHolidayYears(today: ISODate): number[] {
  const first = Number(today.slice(0, 4));
  const last = Number(addDays(today, 550).slice(0, 4));
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}
