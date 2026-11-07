import { isoToSerial, mondayIndexedDow, rangeISO } from '@daysoff/engine/solver/dateUtils';
import type { WorkWeek } from '@daysoff/engine/solver/types';
import { validCalendarDate } from './employerCalendar';

/**
 * Consumer-only schedule adapter. A cycle is explicitly anchored to a date,
 * so its phase does not drift over DST, the new year, or leap days.
 * This models which days need leave, NOT the number of paid working hours.
 */
export interface RepeatingWorkSchedule {
  /** A normal Monday–Sunday pattern, or an explicit repeating shift cycle. */
  kind: 'weekly' | 'cycle';
  weekly?: WorkWeek;
  cycleAnchor?: string;
  /** One full cycle, minimum 1, maximum 28 days. */
  cycleWorking?: readonly boolean[];
}

export interface PersonalDayAvailability {
  date: string;
  workday: boolean;
  /** A scheduled workday that is already an observed employer holiday or approved PTO. */
  alreadyOff: boolean;
  /** Employer-observed holiday, distinct from a submitted/approved leave request. */
  employerHoliday?: boolean;
  /** Explicit approved leave; never inferred from a generic already-off flag. */
  approvedLeave?: boolean;
  /** User explicitly cannot request this working day. */
  hardBlocked: boolean;
  /** An imported busy event or tentative commitment requiring review. */
  reviewNeeded: boolean;
  /** School closure is useful context, never automatically a hard conflict. */
  schoolClosed: boolean;
}

export interface AvailabilityInputs {
  start: string;
  end: string;
  schedule: RepeatingWorkSchedule;
  /** Employer-observed holidays; no assumption that public holidays are observed. */
  employerOffDays?: readonly string[];
  approvedOffDays?: readonly string[];
  hardBlockDays?: readonly string[];
  advisoryBusyDays?: readonly string[];
  schoolOffDays?: readonly string[];
  /** External sources may omit events: lack of a listed event does not prove freedom. */
  calendarPartial?: boolean;
}

export interface AvailabilityWindow {
  days: PersonalDayAvailability[];
  partial: boolean;
  /** Opaque summary suitable for sharing without event titles or personal notes. */
  source: 'explicit-calendar-inputs';
}

export interface JointWindowFeasibility {
  start: string;
  end: string;
  possible: boolean;
  /** PTO cost for each adult, not one combined indistinguishable balance. */
  ptoDaysA: number;
  ptoDaysB: number;
  hardBlockDates: string[];
  reviewDates: string[];
  /** A missing/partial calendar means this is not an assertion of freedom. */
  partial: boolean;
}

const MAX_DAYS = 1096;
const MAX_SOURCE_DATES = 4000;

function uniqueDates(input: readonly string[] | undefined): Set<string> | null {
  if (input === undefined) return new Set();
  if (!Array.isArray(input) || input.length > MAX_SOURCE_DATES
    || !input.every((d) => typeof d === 'string' && validCalendarDate(d))) return null;
  return new Set(input);
}

/** Positive modulo for cycle dates preceding their anchor. */
function cycleIndex(position: number, length: number): number {
  return ((position % length) + length) % length;
}

export function validRepeatingSchedule(schedule: RepeatingWorkSchedule): boolean {
  if (!schedule) return false;
  if (schedule.kind === 'weekly') {
    return Array.isArray(schedule.weekly) && schedule.weekly.length === 7
      && schedule.weekly.every((d) => typeof d === 'boolean');
  }
  return schedule.kind === 'cycle'
    && typeof schedule.cycleAnchor === 'string' && validCalendarDate(schedule.cycleAnchor)
    && Array.isArray(schedule.cycleWorking) && schedule.cycleWorking.length > 0
    && schedule.cycleWorking.length <= 28
    && schedule.cycleWorking.every((d) => typeof d === 'boolean');
}

/** Returns null on invalid dates/schedule, never silently assumes a default workweek. */
export function isScheduledWorkday(schedule: RepeatingWorkSchedule, date: string): boolean | null {
  if (!validRepeatingSchedule(schedule) || !validCalendarDate(date)) return null;
  if (schedule.kind === 'weekly') return schedule.weekly![mondayIndexedDow(date)];
  const index = cycleIndex(isoToSerial(date) - isoToSerial(schedule.cycleAnchor!), schedule.cycleWorking!.length);
  return schedule.cycleWorking![index];
}

export function calendarAvailability(input: AvailabilityInputs): AvailabilityWindow | null {
  if (!input || !validCalendarDate(input.start) || !validCalendarDate(input.end)
    || input.end < input.start || !validRepeatingSchedule(input.schedule)
    || isoToSerial(input.end) - isoToSerial(input.start) >= MAX_DAYS) return null;

  const employer = uniqueDates(input.employerOffDays);
  const approved = uniqueDates(input.approvedOffDays);
  const blocked = uniqueDates(input.hardBlockDays);
  const advisory = uniqueDates(input.advisoryBusyDays);
  const school = uniqueDates(input.schoolOffDays);
  if (!employer || !approved || !blocked || !advisory || !school) return null;

  const days: PersonalDayAvailability[] = rangeISO(input.start, input.end).map((date) => {
    const workday = isScheduledWorkday(input.schedule, date)!;
    return {
      date,
      workday,
      alreadyOff: !workday || employer.has(date) || approved.has(date),
      employerHoliday: employer.has(date),
      approvedLeave: approved.has(date),
      hardBlocked: blocked.has(date),
      reviewNeeded: advisory.has(date),
      schoolClosed: school.has(date),
    };
  });
  return { days, partial: input.calendarPartial !== false, source: 'explicit-calendar-inputs' };
}

/**
 * Evaluate one proposed joint break against independently supplied calendars.
 * A hard block makes it infeasible, but a review-needed event does NOT.
 * No dates, names, titles or notes are exported anywhere.
 */
export function jointWindowFeasibility(
  a: AvailabilityWindow,
  b: AvailabilityWindow,
  budgetA: number,
  budgetB: number,
): JointWindowFeasibility | null {
  if (!a || !b || !Array.isArray(a.days) || !Array.isArray(b.days)
    || a.days.length === 0 || a.days.length !== b.days.length
    || a.days.length > MAX_DAYS || !Number.isInteger(budgetA) || !Number.isInteger(budgetB)
    || budgetA < 0 || budgetB < 0 || budgetA > MAX_DAYS || budgetB > MAX_DAYS
    || a.days.some((day, i) => day.date !== b.days[i].date)) return null;

  let ptoDaysA = 0;
  let ptoDaysB = 0;
  const hardBlockDates: string[] = [];
  const reviewDates: string[] = [];
  for (let i = 0; i < a.days.length; i++) {
    const da = a.days[i];
    const db = b.days[i];
    if (da.hardBlocked || db.hardBlocked) hardBlockDates.push(da.date);
    if (da.reviewNeeded || db.reviewNeeded) reviewDates.push(da.date);
    if (da.workday && !da.alreadyOff) ptoDaysA++;
    if (db.workday && !db.alreadyOff) ptoDaysB++;
  }
  return {
    start: a.days[0].date,
    end: a.days[a.days.length - 1].date,
    possible: hardBlockDates.length === 0 && ptoDaysA <= budgetA && ptoDaysB <= budgetB,
    ptoDaysA, ptoDaysB, hardBlockDates, reviewDates,
    partial: a.partial || b.partial,
  };
}
