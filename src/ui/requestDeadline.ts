import type { Break, WorkWeek } from '../solver/types';
import { addDays, isoToSerial, mondayIndexedDow } from '../solver/dateUtils';
import { formatShort } from './dateFormat';

const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * Phase 4.1: a deadline landing on a day off is useless ("a deadline on a Saturday is
 * useless", per spec) - shifted back to the nearest working day per the user's own
 * workWeek. Already a working day -> returned unchanged.
 */
export function nearestPrecedingWorkday(date: string, workWeek: WorkWeek): string {
  let d = date;
  while (!workWeek[mondayIndexedDow(d)]) {
    d = addDays(d, -1);
  }
  return d;
}

/**
 * The request-by date: `noticePeriodDays` before the break starts, shifted to a working
 * day. Deliberately the exact same subtraction icsExport.ts's reminder uses - per spec,
 * "the request-by date must match the .ics reminder dates, not contradict them." Both read
 * from the SAME noticePeriodDays number (see useAppState.ts), which is what makes
 * agreement structural rather than something that could drift apart.
 */
export function requestByDate(breakStart: string, noticePeriodDays: number, workWeek: WorkWeek): string {
  const raw = addDays(breakStart, -noticePeriodDays);
  return nearestPrecedingWorkday(raw, workWeek);
}

function weekdayName(iso: string): string {
  return WEEKDAY_NAMES[mondayIndexedDow(iso)];
}

/**
 * The line shown on each break card. Three cases:
 *  - deadline already passed (or is today): nothing to count down to - just says so.
 *  - deadline within a week: urgency wording naming the closing weekday, per spec's own
 *    example ("Request this week - the notice window closes Friday").
 *  - otherwise: the plain "Request by <date> - N days from now" countdown.
 */
export function requestByText(breakStart: string, noticePeriodDays: number, workWeek: WorkWeek, today: string): string {
  const deadline = requestByDate(breakStart, noticePeriodDays, workWeek);
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

/** Phase 4.2: "Order the break cards so the most contested break appears FIRST, not
 * chronologically." Deliberately returns a NEW order for rendering only - the 1-based
 * numbers on each card/calendar badge stay keyed to chronological order (orderedBreaks in
 * useAppState), so a card's own number never changes just because of where it's drawn. */
export function sortByContestedness(breaks: Break[]): Break[] {
  return [...breaks].sort((a, b) => {
    if (b.meanDemand !== a.meanDemand) return b.meanDemand - a.meanDemand;
    return a.start < b.start ? -1 : a.start > b.start ? 1 : 0;
  });
}
