import type { ISODate } from '@daysoff/engine/solver/types';
import { mondayIndexedDow, rangeISO } from '@daysoff/engine/solver/dateUtils';
import { isValidISODate } from '../ui/urlState';
import { guardedWrite, stampRecord } from './storageRecord';
import { validRequestRange, type PtoRequest, type RequestStatus, type RequestStorage } from './requestLedger';

/**
 * The personal workspace: the one derivation that the planner, My PTO forecast, expiry
 * guard and family planner read from the request ledger. Views never re-implement
 * which request days are off or which are still owed against a balance.
 *
 * Planning role per ledger status:
 *   considering                  → idea       (no effect: a saved idea, not time off)
 *   planned, requested           → tentative  (already off for planning; cost reserved, labelled tentative)
 *   approved, completed          → booked     (already off; cost charged per the deduction rule)
 *   canceled, rejected           → inactive   (no effect)
 *
 * Deduction rule. A balance is a number read on `asOf`. For each PTO date of a request:
 *   - date <= asOf: a booked day is already in that balance ('in-balance'); a tentative
 *     day on or before the reading was never taken and is not charged ('none').
 *   - date > asOf, booked: 'in-balance' when the balance already subtracts approved
 *     leave (`includesApprovedLeave`, the My PTO "balance already includes approved
 *     leave" setting), otherwise 'charge' — subtracted exactly once.
 *   - date > asOf, tentative: 'tentative' — never in an employer balance; subtracted
 *     once in tentative scenarios and reserved (labelled) by the planner.
 * Dates are unioned across requests first, so overlapping entries never charge a day twice,
 * and a day both booked and tentative counts as booked.
 */
export type PlanningRole = 'booked' | 'tentative' | 'idea' | 'inactive';
export type DateCharge = 'in-balance' | 'charge' | 'tentative' | 'none';

export interface BalanceBasis {
  /** The date the balance figure was read; days on or before it are already reflected. */
  asOf: ISODate;
  /** The employer balance already subtracts approved future leave. */
  includesApprovedLeave: boolean;
}

export function planningRole(status: RequestStatus): PlanningRole {
  if (status === 'approved' || status === 'completed') return 'booked';
  if (status === 'planned' || status === 'requested') return 'tentative';
  return status === 'considering' ? 'idea' : 'inactive';
}

export function requestDateCharge(request: PtoRequest, date: ISODate, basis: BalanceBasis): DateCharge {
  const role = planningRole(request.status);
  if (role === 'idea' || role === 'inactive') return 'none';
  if (date <= basis.asOf) return role === 'booked' ? 'in-balance' : 'none';
  if (role === 'tentative') return 'tentative';
  return basis.includesApprovedLeave ? 'in-balance' : 'charge';
}

/**
 * The user's working schedule, used only to express an hourly booking as a share of
 * that weekday's shift. `shiftMinutes` is Monday–Sunday; `hoursPerDay` is the fallback.
 */
export interface WorkdaySchedule {
  shiftMinutes?: readonly number[];
  hoursPerDay?: number;
}

/** Scheduled minutes on `date`, or undefined when the schedule does not say. */
export function scheduledMinutesOn(date: ISODate, schedule: WorkdaySchedule | undefined): number | undefined {
  const shift = schedule?.shiftMinutes?.length === 7 ? schedule.shiftMinutes[mondayIndexedDow(date)] : undefined;
  if (typeof shift === 'number' && Number.isFinite(shift) && shift > 0) return shift;
  const hours = schedule?.hoursPerDay;
  return typeof hours === 'number' && Number.isFinite(hours) && hours > 0 ? Math.round(hours * 60) : undefined;
}

/** Day-equivalent totals are rounded once, to the thousandth: 3 × (3h of a 9h shift) is exactly one day. */
export const roundDayEquivalent = (days: number) => Math.round(days * 1000) / 1000;

/**
 * The shift a partial day is measured against: the shift saved with the request when it was
 * priced, else that weekday's shift in `schedule`, else `schedule.hoursPerDay`.
 */
export function partialShiftMinutes(request: PtoRequest, date: ISODate, schedule?: WorkdaySchedule): number | undefined {
  return request.partialShiftMinutes ?? scheduledMinutesOn(date, schedule);
}

/**
 * THE per-date charge rule. Every planner, the forecast and the family planner use it.
 *
 * For the requests that cover one date:
 *   - A whole-day request takes the whole day. That covers a legacy request with no
 *     recorded minutes, and an hourly request priced at the full shift (a 10h day on a
 *     4x10 schedule is one day). Any number of whole-day requests on a date still cost
 *     one day (P0: never charge a day twice).
 *   - Otherwise the partial days' minutes are SUMMED and capped at the shift. Requests
 *     record minutes, not times of day, so distinct requests on one date are assumed not
 *     to overlap: 4h + 4h on an 8h day is the whole day.
 *   - With no known shift, a partial day costs a whole day (never under-reserves).
 * `days` is the day-equivalent; `minutes` is the native-hours amount (undefined when only
 * a legacy whole-day request covers the date, whose hours are that day's scheduled hours).
 */
export function combinedDateCost(requests: readonly PtoRequest[], date: ISODate, schedule?: WorkdaySchedule): { days: number; minutes?: number; legacyWholeDay: boolean; shiftUnknown?: boolean } {
  let legacyWholeDay = false;
  let wholeMinutes: number | undefined;
  let partialSum = 0;
  let shift: number | undefined;
  let partials = 0;
  for (const request of requests) {
    const minutes = request.ptoMinutes?.[date];
    if (minutes === undefined) legacyWholeDay = true;
    else if (request.partialMinutes === undefined) wholeMinutes = Math.max(wholeMinutes ?? 0, minutes);
    else {
      partials++;
      partialSum += minutes;
      const own = partialShiftMinutes(request, date, schedule);
      if (own !== undefined) shift = Math.max(shift ?? 0, own);
    }
  }
  if (legacyWholeDay || wholeMinutes !== undefined) return { days: 1, minutes: wholeMinutes, legacyWholeDay };
  if (partials === 0) return { days: 0, minutes: 0, legacyWholeDay };
  if (shift === undefined) return { days: 1, minutes: partialSum, legacyWholeDay, shiftUnknown: true };
  return { days: Math.min(1, partialSum / shift), minutes: Math.min(partialSum, shift), legacyWholeDay };
}

/** One request's day-equivalent on `date` under the shared rule. */
export function requestDayEquivalent(request: PtoRequest, date: ISODate, schedule?: WorkdaySchedule): number {
  return roundDayEquivalent(combinedDateCost([request], date, schedule).days);
}

/**
 * What a date costs under a basis, split by role. `booked` is the booked requests' combined
 * cost (`bookedCharged` false when the balance already holds it); `tentative` is only what
 * tentative requests add on top, so a booked partial inside a tentative full day leaves the
 * day costing one in total (the booked part + the tentative rest), never less.
 */
export interface DateChargeSplit<T> {
  booked: T | undefined;
  bookedCharged: boolean;
  /** Booked and tentative requests together. */
  total: T;
}

export function chargeSplitByDate<T>(
  requests: readonly PtoRequest[], basis: BalanceBasis, keep: (request: PtoRequest, date: ISODate) => boolean,
  measure: (onDate: readonly PtoRequest[], date: ISODate) => T,
): Map<ISODate, DateChargeSplit<T>> {
  const groups = new Map<ISODate, { booked: PtoRequest[]; tentative: PtoRequest[]; charged: boolean }>();
  for (const request of requests) {
    for (const date of new Set(request.ptoDates)) {
      if (!keep(request, date)) continue;
      const charge = requestDateCharge(request, date, basis);
      if (charge === 'none') continue;
      const group = groups.get(date) ?? { booked: [], tentative: [], charged: false };
      if (charge === 'tentative') group.tentative.push(request);
      else { group.booked.push(request); if (charge === 'charge') group.charged = true; }
      groups.set(date, group);
    }
  }
  const result = new Map<ISODate, DateChargeSplit<T>>();
  for (const [date, group] of groups) {
    result.set(date, {
      booked: group.booked.length ? measure(group.booked, date) : undefined,
      bookedCharged: group.charged,
      total: measure([...group.booked, ...group.tentative], date),
    });
  }
  return result;
}

type DatedCharge = { charge: number; tentative: number };

/** Day-equivalents each date still owes: the booked charge, and what tentative requests add. */
function chargesByDate(requests: readonly PtoRequest[], basis: BalanceBasis, keep: (request: PtoRequest, date: ISODate) => boolean, schedule?: WorkdaySchedule) {
  const charged = new Map<ISODate, DatedCharge>();
  for (const [date, split] of chargeSplitByDate(requests, basis, keep, (onDate, day) => combinedDateCost(onDate, day, schedule).days)) {
    const booked = split.booked ?? 0;
    const entry = { charge: split.bookedCharged ? booked : 0, tentative: Math.max(0, split.total - booked) };
    if (entry.charge > 0 || entry.tentative > 0) charged.set(date, entry);
  }
  return charged;
}

const sumDays = (charges: Iterable<DatedCharge>, kind: 'charge' | 'tentative' | 'any') => {
  let total = 0;
  for (const entry of charges) total += kind === 'charge' ? entry.charge : kind === 'tentative' ? entry.tentative : entry.charge + entry.tentative;
  return roundDayEquivalent(total);
};

/** Dates a forecast must still subtract through `through`, unioned and sorted. */
export function chargeableRequestDates(requests: readonly PtoRequest[], basis: BalanceBasis, through: ISODate, includeTentative: boolean): ISODate[] {
  const charged = chargesByDate(requests, basis, (_request, date) => date <= through);
  return [...charged].filter(([, entry]) => entry.charge > 0 || includeTentative).map(([date]) => date).sort();
}

export interface PlanningCommitments {
  /** Every calendar day of booked and tentative requests in range: already off, never recommended again. */
  unavailableDates: ISODate[];
  /** Booked PTO day-equivalents after the as-of date in range (shown even if already in the balance). */
  approvedPtoDays: number;
  /** Tentative PTO day-equivalents after the as-of date in range, excluding days already booked. */
  tentativePtoDays: number;
  /** Exact day-equivalents the budget owes under the basis (hourly partial days are fractions). */
  reservedPtoDayEquivalent: number;
  /** Whole days the planning budget subtracts: the exact owed amount rounded UP, each day once. */
  reservedPtoDays: number;
  /** At least one booked or tentative request in range was recorded in hours. */
  hasHourlyBookings: boolean;
}

const NO_COMMITMENTS: PlanningCommitments = { unavailableDates: [], approvedPtoDays: 0, tentativePtoDays: 0, reservedPtoDayEquivalent: 0, reservedPtoDays: 0, hasHourlyBookings: false };

/**
 * Rounding: day-equivalents are summed exactly (to the thousandth), then the budget
 * reservation is rounded up to a whole day because the planner recommends whole days.
 * Rounding up is deliberate: a half day booked never lets the planner spend that half twice.
 */
export function planningCommitments(
  requests: readonly PtoRequest[], range: { start: ISODate; end: ISODate }, basis: BalanceBasis, schedule?: WorkdaySchedule,
): PlanningCommitments {
  const { start, end } = range;
  if (!isValidISODate(start) || !isValidISODate(end) || start > end) return NO_COMMITMENTS;
  const unavailable = new Set<ISODate>();
  let hasHourlyBookings = false;
  const committed: PtoRequest[] = [];
  for (const request of requests) {
    const role = planningRole(request.status);
    if ((role !== 'booked' && role !== 'tentative') || !validRequestRange(request.start, request.end)) continue;
    const first = request.start > start ? request.start : start;
    const last = request.end < end ? request.end : end;
    if (first > last) continue;
    for (const date of rangeISO(first, last)) unavailable.add(date);
    if (request.ptoMinutes !== undefined) hasHourlyBookings = true;
    committed.push(request);
  }
  const inRange = (_request: PtoRequest, date: ISODate) => date >= start && date <= end;
  const owed = chargesByDate(committed, basis, inRange, schedule);
  // Approved days are counted for display whether or not the balance already holds them.
  const shown = chargesByDate(committed, { ...basis, includesApprovedLeave: false }, inRange, schedule);
  const reservedPtoDayEquivalent = sumDays(owed.values(), 'any');
  return {
    unavailableDates: [...unavailable].sort(),
    approvedPtoDays: sumDays(shown.values(), 'charge'),
    tentativePtoDays: sumDays(shown.values(), 'tentative'),
    reservedPtoDayEquivalent,
    reservedPtoDays: Math.ceil(reservedPtoDayEquivalent),
    hasHourlyBookings,
  };
}

/**
 * The dates in `range` the person is off for the whole day because of approved or tentative
 * leave. `planningCommitments().unavailableDates` also holds partly booked days (an hourly
 * appointment), which no planner may book again but on which the person still works, so a
 * coverage question (is anyone with the kids?) must use this narrower list. Hours on a
 * date count as a whole day when they fill that weekday's scheduled shift, summed across
 * requests; with no known shift, a recorded partial day stays partial.
 */
export function fullDayLeaveDates(
  requests: readonly PtoRequest[], range: { start: ISODate; end: ISODate }, schedule?: WorkdaySchedule,
): ISODate[] {
  const { start, end } = range;
  if (!isValidISODate(start) || !isValidISODate(end) || start > end) return [];
  const whole = new Set<ISODate>();
  const hourly = new Map<ISODate, PtoRequest[]>();
  for (const request of requests) {
    const role = planningRole(request.status);
    if ((role !== 'booked' && role !== 'tentative') || !validRequestRange(request.start, request.end)) continue;
    const first = request.start > start ? request.start : start;
    const last = request.end < end ? request.end : end;
    if (first > last) continue;
    for (const date of rangeISO(first, last)) {
      // A date in the span with no hours recorded is not a workday of the request: off anyway.
      if (request.ptoMinutes?.[date] === undefined) whole.add(date);
      else hourly.set(date, [...(hourly.get(date) ?? []), request]);
    }
  }
  // Same rule as the cost (combinedDateCost): whole-shift requests fill the day, partial
  // minutes are summed against the shift; a partial day with no known shift stays partial.
  for (const [date, onDate] of hourly) {
    const cost = combinedDateCost(onDate, date, schedule);
    if (cost.days >= 1 && !cost.shiftUnknown) whole.add(date);
  }
  return [...whole].sort();
}

export interface CommittedPlanEntry {
  id: string;
  role: 'booked' | 'tentative';
  status: RequestStatus;
  start: ISODate;
  end: ISODate;
  ptoDates: readonly ISODate[];
  /** The cost saved with the request, never recomputed from the span. */
  ptoDays: number;
  /** Native recorded minutes when the request was priced hourly. */
  ptoMinutes?: number;
}

/**
 * Booked and tentative requests overlapping a planning window, in date order, so the
 * planner can keep them visible beside new recommendations. Display only: their
 * days and costs are already excluded/reserved by planningCommitments.
 */
export function committedPlanEntries(requests: readonly PtoRequest[], range: { start: ISODate; end: ISODate }): CommittedPlanEntry[] {
  if (!isValidISODate(range.start) || !isValidISODate(range.end) || range.start > range.end) return [];
  const entries: CommittedPlanEntry[] = [];
  for (const request of requests) {
    const role = planningRole(request.status);
    if ((role !== 'booked' && role !== 'tentative') || !validRequestRange(request.start, request.end)) continue;
    if (request.end < range.start || request.start > range.end) continue;
    entries.push({
      id: request.id, role, status: request.status, start: request.start, end: request.end,
      ptoDates: request.ptoDates, ptoDays: request.ptoDays,
      ...(request.ptoMinutes ? { ptoMinutes: Object.values(request.ptoMinutes).reduce((sum, minutes) => sum + minutes, 0) } : {}),
    });
  }
  return entries.sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end) || a.id.localeCompare(b.id));
}

/** Committed day-equivalents after a saved balance, for planners that start from that balance. */
export function committedRequestDays(requests: readonly PtoRequest[], basis: BalanceBasis, schedule?: WorkdaySchedule): { approvedDays: number; tentativeDays: number } {
  const charged = [...chargesByDate(requests, basis, () => true, schedule).values()];
  return { approvedDays: sumDays(charged, 'charge'), tentativeDays: sumDays(charged, 'tentative') };
}

/**
 * The one local setting both My PTO and the planner read for "my balance already
 * includes approved leave". Device-local; never placed in a URL.
 */
export const BALANCE_BASIS_STORAGE_KEY = 'gapless.personal.workspace.v1';
export const BALANCE_BASIS_CHANGED = 'gapless:workspace-basis-changed';

interface WorkspaceRecord {
  version: 1;
  balanceIncludesApprovedLeave?: boolean;
  workdaySchedule?: WorkdaySchedule;
}
// Stored with the shared revision + updatedAt stamp (src/personal/storageRecord.ts).

function validSchedule(value: unknown): WorkdaySchedule | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const { shiftMinutes, hoursPerDay } = value as Record<string, unknown>;
  const shiftsOk = shiftMinutes === undefined || (Array.isArray(shiftMinutes) && shiftMinutes.length === 7
    && shiftMinutes.every(m => typeof m === 'number' && Number.isInteger(m) && m >= 0 && m <= 1440) && shiftMinutes.some(m => m > 0));
  const hoursOk = hoursPerDay === undefined || (typeof hoursPerDay === 'number' && Number.isFinite(hoursPerDay) && hoursPerDay > 0 && hoursPerDay <= 24);
  if (!shiftsOk || !hoursOk || (shiftMinutes === undefined && hoursPerDay === undefined)) return undefined;
  return { ...(shiftMinutes ? { shiftMinutes: [...shiftMinutes as number[]] } : {}), ...(hoursPerDay !== undefined ? { hoursPerDay } : {}) };
}

function readWorkspaceRecord(storage: RequestStorage | null): WorkspaceRecord | undefined {
  if (!storage) return undefined;
  try {
    const raw = storage.getItem(BALANCE_BASIS_STORAGE_KEY);
    if (!raw || raw.length > 1000) return undefined;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1) return undefined;
    const record = value as Record<string, unknown>;
    return {
      version: 1,
      ...(typeof record.balanceIncludesApprovedLeave === 'boolean' ? { balanceIncludesApprovedLeave: record.balanceIncludesApprovedLeave } : {}),
      ...(validSchedule(record.workdaySchedule) ? { workdaySchedule: validSchedule(record.workdaySchedule) } : {}),
    };
  } catch {
    return undefined;
  }
}

/** Read-modify-write so the basis and the schedule never overwrite each other. */
function updateWorkspaceRecord(patch: Partial<WorkspaceRecord>, storage: RequestStorage | null): boolean {
  if (!storage) return false;
  try {
    const next = { ...(readWorkspaceRecord(storage) ?? {}), ...patch, version: 1 as const };
    return guardedWrite(storage, BALANCE_BASIS_STORAGE_KEY, stampRecord(next), {
      isClean: raw => workspaceRecordVersion(raw) === 1,
      isNewer: raw => (workspaceRecordVersion(raw) ?? 0) > 1,
      migrates: false,
    }).status === 'saved';
  } catch {
    return false;
  }
}

function workspaceRecordVersion(raw: string): number | undefined {
  try {
    const value: unknown = JSON.parse(raw);
    const version = value && typeof value === 'object' ? (value as Record<string, unknown>).version : undefined;
    return typeof version === 'number' ? version : undefined;
  } catch {
    return undefined;
  }
}

export function readBalanceBasisPreference(storage: RequestStorage | null): boolean | undefined {
  return readWorkspaceRecord(storage)?.balanceIncludesApprovedLeave;
}

export function writeBalanceBasisPreference(includesApprovedLeave: boolean, storage: RequestStorage | null): boolean {
  return updateWorkspaceRecord({ balanceIncludesApprovedLeave: includesApprovedLeave }, storage);
}

/** The hourly schedule My PTO priced requests with; device-local, never placed in a URL. */
export function readWorkdaySchedulePreference(storage: RequestStorage | null): WorkdaySchedule | undefined {
  return readWorkspaceRecord(storage)?.workdaySchedule;
}

export function writeWorkdaySchedulePreference(schedule: WorkdaySchedule, storage: RequestStorage | null): boolean {
  const valid = validSchedule(schedule);
  return valid ? updateWorkspaceRecord({ workdaySchedule: valid }, storage) : false;
}
