import { addDays, isoToSerial, mondayIndexedDow } from '../solver/dateUtils';
import type { ISODate } from '../solver/types';

/**
 * Better dates for a request (pure, D1). Looks at windows within ±N weeks that charge the same
 * number of working days, asks the caller's check for each (hard fails and warnings), and ranks
 * the ones without hard fails:
 *   1. would auto-approve, 2. fewest warnings, 3. most consecutive days off for the leave used
 *   (weekends and holidays either side, the solver's bridge idea), 4. closest to the asked dates,
 *   5. earliest.
 * Never called for health-related or protected leave: sick days are not moved.
 */

export interface AlternativeCheck {
  hardFails: number;
  warnings: number;
  wouldAutoApprove: boolean;
}

export interface AlternativesInput {
  start: ISODate;
  end: ISODate;
  today: ISODate;
  /** Monday-first, true = working day. */
  workWeek: readonly boolean[];
  holidays: ReadonlySet<ISODate>;
  /** Checks one candidate (dates = the working days it charges). Must be pure and cheap. */
  check: (c: { start: ISODate; end: ISODate; dates: ISODate[] }) => AlternativeCheck;
  weeks?: number;
  limit?: number;
}

export interface Alternative {
  start: ISODate;
  end: ISODate;
  workingDays: number;
  /** Consecutive days away, counting the weekends and holidays either side. */
  daysAway: number;
  warnings: number;
  wouldAutoApprove: boolean;
}

export function suggestAlternatives(input: AlternativesInput): Alternative[] {
  const weeks = input.weeks ?? 4;
  const limit = input.limit ?? 3;
  const working = (d: ISODate) => !!input.workWeek[mondayIndexedDow(d)] && !input.holidays.has(d);
  const wanted = chargedIn(input.start, input.end, working).length;
  if (wanted === 0) return [];
  const origin = isoToSerial(input.start);
  const out: (Alternative & { distance: number })[] = [];
  for (let off = -weeks * 7; off <= weeks * 7; off++) {
    if (off === 0) continue;
    const start = addDays(input.start, off);
    if (start <= input.today || !working(start)) continue;
    // Extend to exactly `wanted` working days.
    const dates: ISODate[] = [];
    let d = start;
    for (let guard = 0; dates.length < wanted && guard < 400; guard++, d = addDays(d, 1)) if (working(d)) dates.push(d);
    if (dates.length < wanted) continue;
    const end = dates.at(-1)!;
    const c = input.check({ start, end, dates });
    if (c.hardFails > 0) continue;
    out.push({ start, end, workingDays: wanted, daysAway: span(start, end, working), warnings: c.warnings, wouldAutoApprove: c.wouldAutoApprove, distance: Math.abs(isoToSerial(start) - origin) });
  }
  out.sort(
    (a, b) =>
      Number(b.wouldAutoApprove) - Number(a.wouldAutoApprove) ||
      a.warnings - b.warnings ||
      b.daysAway - a.daysAway ||
      a.distance - b.distance ||
      (a.start < b.start ? -1 : 1),
  );
  return out.slice(0, limit).map(({ distance: _d, ...rest }) => rest);
}

function chargedIn(start: ISODate, end: ISODate, working: (d: ISODate) => boolean): ISODate[] {
  const r: ISODate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) if (working(d)) r.push(d);
  return r;
}

/** Days from the first non-working run before `start` to the last after `end`, inclusive. */
function span(start: ISODate, end: ISODate, working: (d: ISODate) => boolean): number {
  let a = start;
  for (let i = 0; i < 14 && !working(addDays(a, -1)); i++) a = addDays(a, -1);
  let b = end;
  for (let i = 0; i < 14 && !working(addDays(b, 1)); i++) b = addDays(b, 1);
  return isoToSerial(b) - isoToSerial(a) + 1;
}
