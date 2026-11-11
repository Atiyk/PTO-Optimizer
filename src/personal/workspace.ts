import type { ISODate } from '@daysoff/engine/solver/types';
import { rangeISO } from '@daysoff/engine/solver/dateUtils';
import { isValidISODate } from '../ui/urlState';
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

/** Per-date charge across the whole ledger; a booked charge wins over a tentative one. */
function chargesByDate(requests: readonly PtoRequest[], basis: BalanceBasis, keep: (request: PtoRequest, date: ISODate) => boolean) {
  const charged = new Map<ISODate, 'charge' | 'tentative'>();
  for (const request of requests) {
    for (const date of request.ptoDates) {
      if (!keep(request, date)) continue;
      const charge = requestDateCharge(request, date, basis);
      if (charge === 'charge') charged.set(date, 'charge');
      else if (charge === 'tentative' && !charged.has(date)) charged.set(date, 'tentative');
    }
  }
  // A date booked by one request and already in the balance via another is not re-charged.
  for (const request of requests) {
    if (planningRole(request.status) !== 'booked') continue;
    for (const date of request.ptoDates) if (charged.get(date) === 'tentative' && requestDateCharge(request, date, basis) === 'in-balance') charged.delete(date);
  }
  return charged;
}

/** Dates a forecast must still subtract through `through`, unioned and sorted. */
export function chargeableRequestDates(requests: readonly PtoRequest[], basis: BalanceBasis, through: ISODate, includeTentative: boolean): ISODate[] {
  const charged = chargesByDate(requests, basis, (_request, date) => date <= through);
  return [...charged].filter(([, charge]) => includeTentative || charge === 'charge').map(([date]) => date).sort();
}

export interface PlanningCommitments {
  /** Every calendar day of booked and tentative requests in range: already off, never recommended again. */
  unavailableDates: ISODate[];
  /** Whole-day booked PTO dates after the as-of date in range (shown even if already in the balance). */
  approvedPtoDays: number;
  /** Whole-day tentative PTO dates after the as-of date in range, excluding days already booked. */
  tentativePtoDays: number;
  /** What the planning budget must subtract under the basis: each day once. */
  reservedPtoDays: number;
  /** The planner budgets whole days; hourly bookings stay unavailable without a guessed cost. */
  hasHourlyBookings: boolean;
}

const NO_COMMITMENTS: PlanningCommitments = { unavailableDates: [], approvedPtoDays: 0, tentativePtoDays: 0, reservedPtoDays: 0, hasHourlyBookings: false };

export function planningCommitments(requests: readonly PtoRequest[], range: { start: ISODate; end: ISODate }, basis: BalanceBasis): PlanningCommitments {
  const { start, end } = range;
  if (!isValidISODate(start) || !isValidISODate(end) || start > end) return NO_COMMITMENTS;
  const unavailable = new Set<ISODate>();
  let hasHourlyBookings = false;
  const wholeDay: PtoRequest[] = [];
  for (const request of requests) {
    const role = planningRole(request.status);
    if ((role !== 'booked' && role !== 'tentative') || !validRequestRange(request.start, request.end)) continue;
    const first = request.start > start ? request.start : start;
    const last = request.end < end ? request.end : end;
    if (first > last) continue;
    for (const date of rangeISO(first, last)) unavailable.add(date);
    if (request.ptoMinutes !== undefined) hasHourlyBookings = true;
    else wholeDay.push(request);
  }
  const inRange = (_request: PtoRequest, date: ISODate) => date >= start && date <= end;
  const owed = chargesByDate(wholeDay, basis, inRange);
  // Approved days are counted for display whether or not the balance already holds them.
  const shown = chargesByDate(wholeDay, { ...basis, includesApprovedLeave: false }, inRange);
  const approvedPtoDays = [...shown.values()].filter(charge => charge === 'charge').length;
  const tentativePtoDays = [...shown.values()].filter(charge => charge === 'tentative').length;
  return {
    unavailableDates: [...unavailable].sort(),
    approvedPtoDays,
    tentativePtoDays,
    reservedPtoDays: owed.size,
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

/** Whole committed days after a saved balance, for planners that start from that balance. */
export function committedRequestDays(requests: readonly PtoRequest[], basis: BalanceBasis): { approvedDays: number; tentativeDays: number } {
  const charged = [...chargesByDate(requests, basis, () => true).values()];
  return { approvedDays: charged.filter(c => c === 'charge').length, tentativeDays: charged.filter(c => c === 'tentative').length };
}

/**
 * The one local setting both My PTO and the planner read for "my balance already
 * includes approved leave". Device-local; never placed in a URL.
 */
export const BALANCE_BASIS_STORAGE_KEY = 'gapless.personal.workspace.v1';
export const BALANCE_BASIS_CHANGED = 'gapless:workspace-basis-changed';

export function readBalanceBasisPreference(storage: RequestStorage | null): boolean | undefined {
  if (!storage) return undefined;
  try {
    const raw = storage.getItem(BALANCE_BASIS_STORAGE_KEY);
    if (!raw || raw.length > 1000) return undefined;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1
      || !('balanceIncludesApprovedLeave' in value) || typeof value.balanceIncludesApprovedLeave !== 'boolean') return undefined;
    return value.balanceIncludesApprovedLeave;
  } catch {
    return undefined;
  }
}

export function writeBalanceBasisPreference(includesApprovedLeave: boolean, storage: RequestStorage | null): boolean {
  if (!storage) return false;
  try {
    storage.setItem(BALANCE_BASIS_STORAGE_KEY, JSON.stringify({ version: 1, balanceIncludesApprovedLeave: includesApprovedLeave }));
    return true;
  } catch {
    return false;
  }
}
