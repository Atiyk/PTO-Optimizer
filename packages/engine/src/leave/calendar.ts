import { addDays, isoToSerial, parseISO } from '../solver/dateUtils';
import type { ISODate } from '../solver/types';
import type { MonthDay, PlanYear } from './policy';

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  return m === 2 ? (isLeapYear(y) ? 29 : 28) : [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]!;
}

function iso(y: number, m: number, d: number): ISODate {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** month/day in year y; Feb 29 (or any overflow) clamps to the month's last day. */
export function monthDayInYear(y: number, md: MonthDay): ISODate {
  return iso(y, md.month, Math.min(md.day, daysInMonth(y, md.month)));
}

/** Adds whole months, clamping the day (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(date: ISODate, n: number): ISODate {
  const { y, m, d } = parseISO(date);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return iso(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

/** Inclusive day count. */
export function daysBetweenInclusive(start: ISODate, end: ISODate): number {
  return isoToSerial(end) - isoToSerial(start) + 1;
}

export interface DateRange {
  start: ISODate;
  /** Inclusive. */
  end: ISODate;
}

function anchorFor(spec: PlanYear, memberStart: ISODate | null): MonthDay {
  if (spec.type === 'calendar') return { month: 1, day: 1 };
  if (spec.type === 'custom') return { month: spec.month, day: spec.day };
  if (!memberStart) throw new Error('anniversary plan year needs the member start date');
  const { m, d } = parseISO(memberStart);
  return { month: m, day: d };
}

/**
 * The plan year containing `date`. Anniversary years start on the member's start
 * month/day (a Feb 29 start date resets on Feb 28 in non-leap years).
 */
export function planYearContaining(spec: PlanYear, memberStart: ISODate | null, date: ISODate): DateRange {
  const anchor = anchorFor(spec, memberStart);
  const { y } = parseISO(date);
  let start = monthDayInYear(y, anchor);
  if (start > date) start = monthDayInYear(y - 1, anchor);
  const nextStart = monthDayInYear(parseISO(start).y + 1, anchor);
  return { start, end: addDays(nextStart, -1) };
}

/** The plan year after `year`. */
export function nextPlanYear(spec: PlanYear, memberStart: ISODate | null, year: DateRange): DateRange {
  return planYearContaining(spec, memberStart, addDays(year.end, 1));
}

/**
 * First occurrence of `md` on or after the plan-year start: the use-by date for leave
 * carried into that year.
 */
export function useByDate(yearStart: ISODate, md: MonthDay): ISODate {
  const { y } = parseISO(yearStart);
  const same = monthDayInYear(y, md);
  return same >= yearStart ? same : monthDayInYear(y + 1, md);
}
