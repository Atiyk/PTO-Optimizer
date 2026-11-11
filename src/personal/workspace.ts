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
 * Hours → day-equivalents, the one conversion every planner uses.
 *   - A whole-day request (no recorded minutes) costs 1 day per PTO date: legacy data is unchanged.
 *   - An hourly request priced at the full shift costs 1 day: it takes that whole workday,
 *     whatever the shift length (a 10h day on a 4x10 schedule is one planner day).
 *   - A partial day costs its recorded minutes ÷ that weekday's scheduled minutes, at most 1.
 *     When the shift is unknown it costs a whole day, so a planner never under-reserves.
 */
export function requestDayEquivalent(request: PtoRequest, date: ISODate, schedule?: WorkdaySchedule): number {
  return roundDayEquivalent(exactDayEquivalent(request, date, schedule));
}

/** Unrounded, so sums are rounded once rather than accumulating per-date rounding. */
function exactDayEquivalent(request: PtoRequest, date: ISODate, schedule?: WorkdaySchedule): number {
  const minutes = request.ptoMinutes?.[date];
  if (minutes === undefined || request.partialMinutes === undefined) return 1;
  const scheduled = scheduledMinutesOn(date, schedule);
  return scheduled === undefined ? 1 : Math.min(1, minutes / scheduled);
}

type DatedCharge = { charge: 'charge' | 'tentative'; days: number };

/**
 * Per-date charge across the whole ledger; a booked charge wins over a tentative one.
 * Overlapping requests on one date charge that date once, at the larger day-equivalent.
 */
function chargesByDate(requests: readonly PtoRequest[], basis: BalanceBasis, keep: (request: PtoRequest, date: ISODate) => boolean, schedule?: WorkdaySchedule) {
  const charged = new Map<ISODate, DatedCharge>();
  for (const request of requests) {
    for (const date of request.ptoDates) {
      if (!keep(request, date)) continue;
      const charge = requestDateCharge(request, date, basis);
      if (charge !== 'charge' && charge !== 'tentative') continue;
      const days = exactDayEquivalent(request, date, schedule);
      const current = charged.get(date);
      if (!current || (charge === 'charge' && current.charge === 'tentative')) charged.set(date, { charge, days });
      else if (current.charge === charge) current.days = Math.max(current.days, days);
    }
  }
  // A date booked by one request and already in the balance via another is not re-charged.
  for (const request of requests) {
    if (planningRole(request.status) !== 'booked') continue;
    for (const date of request.ptoDates) if (charged.get(date)?.charge === 'tentative' && requestDateCharge(request, date, basis) === 'in-balance') charged.delete(date);
  }
  return charged;
}

const sumDays = (charges: Iterable<DatedCharge>, kind: 'charge' | 'tentative' | 'any') => {
  let total = 0;
  for (const entry of charges) if (kind === 'any' || entry.charge === kind) total += entry.days;
  return roundDayEquivalent(total);
};

/** Dates a forecast must still subtract through `through`, unioned and sorted. */
export function chargeableRequestDates(requests: readonly PtoRequest[], basis: BalanceBasis, through: ISODate, includeTentative: boolean): ISODate[] {
  const charged = chargesByDate(requests, basis, (_request, date) => date <= through);
  return [...charged].filter(([, entry]) => includeTentative || entry.charge === 'charge').map(([date]) => date).sort();
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
