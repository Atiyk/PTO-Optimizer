import { isValidWorkWeek, type Break, type WorkWeek } from '../solver/types';
import { addDays, isoToSerial, mondayIndexedDow, serialToISO } from '../solver/dateUtils';
import { formatShort } from './dateFormat';
import { MAX_WORKDAY_SEARCH_DAYS, searchWorkday } from './workdaySearch';

const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * Phase 4.1: a deadline landing on a day off is useless ("a deadline on a Saturday is
 * useless", per spec) - shifted back to the nearest working day per the user's own
 * workWeek and observed days off. Returns null if the schedule has no working day within
 * MAX_WORKDAY_SEARCH_DAYS (see workdaySearch.ts).
 */
export function nearestPrecedingWorkday(date: string, workWeek: WorkWeek, offDays: readonly string[] = []): string | null {
  if (!isValidWorkWeek(workWeek) || serialToISO(isoToSerial(date)) !== date) return null;
  const off = new Set(offDays);
  // Bounded (MAX_WORKDAY_SEARCH_DAYS): a schedule whose working days are all off for years
  // has no usable deadline, so it reports none rather than a date decades back.
  return searchWorkday(date, -1, (day) => workWeek[mondayIndexedDow(day)] && !off.has(day));
}

/**
 * How a notice period is counted.
 *  - 'calendar': N calendar days before the break starts.
 *  - 'working': N of the user's own working days before the break starts (their workweek,
 *    alternate Fridays and employer-observed days off all excluded).
 */
export type NoticeUnit = 'calendar' | 'working';

/** Whole days of notice: fractions round UP, so a deadline is never later than the policy. */
function wholeNoticeDays(noticeDays: number): number | null {
  return Number.isFinite(noticeDays) && noticeDays >= 0 ? Math.ceil(noticeDays) : null;
}

/**
 * THE request-by date - the one canonical deadline every surface uses (break card, email
 * draft, PTO tracker "Submit by", .ics/feed "book by" reminders and reminder emails), so
 * they cannot disagree for the same inputs. Per spec, "the request-by date must match the
 * .ics reminder dates, not contradict them."
 *
 * Rule:
 *  - calendar notice: break start minus N calendar days; when that day is not a working day
 *    (non-working weekday or an employer/observed day off) it rolls BACK to the previous
 *    working day - a deadline on a day nobody is at work is useless.
 *  - working notice: the Nth working day strictly before the break start. N = 0 is the start
 *    day itself if worked, else the previous working day (same as calendar N = 0).
 * Returns null for an invalid date/notice, or when no working day is found within the
 * bounded search (MAX_WORKDAY_SEARCH_DAYS per step, see workdaySearch.ts).
 */
export function requestByDate(breakStart: string, noticePeriodDays: number, workWeek: WorkWeek, offDays: readonly string[] = [], unit: NoticeUnit = 'calendar'): string | null {
  const days = wholeNoticeDays(noticePeriodDays);
  if (serialToISO(isoToSerial(breakStart)) !== breakStart || days === null) return null;
  if (unit !== 'working') return nearestPrecedingWorkday(addDays(breakStart, -days), workWeek, offDays);
  // A working-day notice longer than the search horizon has no meaningful answer, and an
  // unbounded count would freeze the page on a hostile link.
  if (days > MAX_WORKDAY_SEARCH_DAYS || !isValidWorkWeek(workWeek)) return null;
  let date = nearestPrecedingWorkday(breakStart, workWeek, offDays);
  if (date === null) return null;
  // Already on/before the start; when the start itself is a working day it is day zero,
  // not one of the N notice days.
  let counted = date === breakStart ? 0 : 1;
  if (days === 0) return date;
  while (counted < days) {
    date = nearestPrecedingWorkday(addDays(date, -1), workWeek, offDays);
    if (date === null) return null;
    counted++;
  }
  return date;
}

/** The notice period as an adjective: "14-day", "5-working-day". */
export function noticePhrase(noticeDays: number, unit: NoticeUnit = 'calendar'): string {
  return unit === 'working' ? `${noticeDays}-working-day` : `${noticeDays}-day`;
}

/** Exported (landing page): the countdown and holiday list both need a full weekday name -
 * reused rather than a second WEEKDAY_NAMES table somewhere else. */
export function weekdayName(iso: string): string {
  return WEEKDAY_NAMES[mondayIndexedDow(iso)];
}

/**
 * The line shown on each break card. Three cases:
 *  - deadline already passed (or is today): nothing to count down to - just says so.
 *  - deadline within a week: urgency wording naming the closing weekday, per spec's own
 *    example ("Request this week - the notice window closes Friday").
 *  - otherwise: the plain "Request by <date> - N days from now" countdown.
 */
export function requestByText(breakStart: string, noticePeriodDays: number, workWeek: WorkWeek, today: string, offDays: readonly string[] = [], unit: NoticeUnit = 'calendar'): string {
  const deadline = requestByDate(breakStart, noticePeriodDays, workWeek, offDays, unit);
  if (!deadline) return 'Request deadline is unavailable for these dates and work schedule.';
  const daysUntil = isoToSerial(deadline) - isoToSerial(today);
  if (daysUntil <= 0) {
    return 'Request now — the notice window has already started.';
  }
  if (daysUntil <= 7) {
    return `Request this week — the notice window closes ${weekdayName(deadline)}.`;
  }
  const dayWord = daysUntil === 1 ? 'day' : 'days';
  return `Request by ${formatShort(deadline)} — ${daysUntil} ${dayWord} from now.`;
}

/**
 * Phase 4.2: "popular dates" / "most contested" labeling is about CALENDAR demand, not the
 * user's own travel-cost preference - unlike solve.ts's 'Peak travel' tag, this must work
 * regardless of the weighting slider (that tag is gated off entirely at w=0, see solve.ts's
 * demandTag). Same threshold value as solve.ts's HIGH_DEMAND_THRESHOLD/LOW_DEMAND_THRESHOLD
 * (kept as separate local constants rather than importing solve.ts's private ones, since
 * this is a distinct, w-independent concept even though the number happens to match).
 */
const CONTESTED_DEMAND_THRESHOLD = 1.25;
const QUIET_DEMAND_THRESHOLD = 0.85;

export function isContested(brk: Break): boolean {
  return brk.meanDemand >= CONTESTED_DEMAND_THRESHOLD;
}

export function isQuietWindow(brk: Break): boolean {
  return brk.meanDemand <= QUIET_DEMAND_THRESHOLD;
}

/** The single most-contested break in the plan (highest mean demand; earliest start breaks
 * a tie) - or undefined for an empty plan. Always resolves to some break regardless of
 * whether it crosses the "contested" threshold, since "the most contested week in YOUR
 * plan" is a relative statement about this plan, not an absolute claim every plan has one. */
export function mostContestedBreakId(breaks: Break[]): string | undefined {
  if (breaks.length === 0) return undefined;
  let best = breaks[0];
  for (const b of breaks.slice(1)) {
    if (b.meanDemand > best.meanDemand || (b.meanDemand === best.meanDemand && b.start < best.start)) {
      best = b;
    }
  }
  return best.id;
}
