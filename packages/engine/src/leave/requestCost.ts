import { mondayIndexedDow, rangeISO } from '../solver/dateUtils';
import type { ISODate, WorkWeek } from '../solver/types';
import { fromUnits, toUnits } from '../ledger/fixedPoint';
import type { LeaveUnit } from './policy';

export type RequestPart = 'full' | 'am' | 'pm' | 'hours';

export interface RequestShape {
  start: ISODate;
  end: ISODate;
  part: RequestPart;
  /** Only for part = 'hours'. */
  hours?: number;
}

export interface WorkSchedule {
  workWeek: WorkWeek;
  hoursPerDay: number;
  /** Public holidays and org closures in force for this member: date → name. */
  holidays: ReadonlyMap<ISODate, string>;
}

export interface ExcludedDay {
  date: ISODate;
  reason: 'holiday' | 'non_working';
  name?: string;
}

export interface RequestCost {
  /** What the request deducts, in `unit`. */
  amount: number;
  unit: LeaveUnit;
  /** Working days the request actually covers (full or partial). */
  chargedDates: ISODate[];
  /** Days inside the range that cost nothing, and why. */
  excluded: ExcludedDay[];
  problems: string[];
}

/**
 * What a request costs: working days only. Holidays and non-working days inside the range
 * are listed but never deducted (SPEC §6).
 */
export function requestCost(req: RequestShape, schedule: WorkSchedule, unit: LeaveUnit): RequestCost {
  const problems: string[] = [];
  if (req.end < req.start) problems.push('end date is before start date');
  if (req.part !== 'full' && req.start !== req.end) problems.push(`a ${req.part === 'hours' ? 'by-hours' : 'half-day'} request must be a single day`);
  if (req.part === 'hours' && !(typeof req.hours === 'number' && req.hours > 0 && req.hours <= schedule.hoursPerDay)) {
    problems.push(`hours must be more than 0 and at most ${schedule.hoursPerDay}`);
  }
  if (problems.length) return { amount: 0, unit, chargedDates: [], excluded: [], problems };

  const charged: ISODate[] = [];
  const excluded: ExcludedDay[] = [];
  for (const date of rangeISO(req.start, req.end)) {
    const holiday = schedule.holidays.get(date);
    if (!schedule.workWeek[mondayIndexedDow(date)]) excluded.push({ date, reason: 'non_working' });
    else if (holiday !== undefined) excluded.push({ date, reason: 'holiday', name: holiday });
    else charged.push(date);
  }

  // Per charged day, in fixed-point units of `unit`.
  const hpd = toUnits(schedule.hoursPerDay);
  let perDayUnits: number;
  switch (req.part) {
    case 'full':
      perDayUnits = unit === 'days' ? toUnits(1) : hpd;
      break;
    case 'am':
    case 'pm':
      perDayUnits = unit === 'days' ? toUnits(0.5) : Math.round(hpd / 2);
      break;
    case 'hours':
      perDayUnits = unit === 'hours' ? toUnits(req.hours!) : Math.round((toUnits(req.hours!) * 10_000) / hpd);
      break;
  }
  return { amount: fromUnits(perDayUnits * charged.length), unit, chargedDates: charged, excluded, problems };
}
