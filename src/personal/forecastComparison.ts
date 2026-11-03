import type { ISODate } from '@daysoff/engine/solver/types';
import type { TimeOffPolicy } from '../policy/model';
import { isValidISODate } from '../ui/urlState';
import { forecastWithRequests, type ForecastScenario } from './forecast';
import {
  calendarCoversRequest, requestDatesForScenario, requestPtoDates, validRequestRange,
  type PtoRequest, type RequestCalendar,
} from './requestLedger';

/**
 * A proposed vacation is a what-if, not an actual ledger mutation.
 * All balance/accrual/carryover arithmetic remains in forecastWithRequests/projectBalance.
 */
export interface VacationForecastDelta {
  before: ForecastScenario;
  after: ForecastScenario;
  /** Native policy units: days or hours. Null means unlimited leave has no banked balance. */
  balanceChange: number | null;
  scheduledChange: number;
  expiredChange: number;
  lostAccrualChange: number;
  unfundedChange: number;
}

export interface VacationForecastComparison {
  through: ISODate;
  proposedStart: ISODate;
  proposedEnd: ISODate;
  /** PTO workdays, excluding employer-observed holidays and off-schedule dates. */
  proposedPtoDates: ISODate[];
  /** Proposed workdays already scheduled in each baseline, never charged twice. */
  overlappingConfirmedDays: number;
  overlappingTentativeDays: number;
  /** Additional workdays the proposal would schedule beyond each baseline. */
  incrementalConfirmedDays: number;
  incrementalTentativeDays: number;
  /** False means the caller has not declared a complete calendar coverage range. */
  employerCalendarCoverageDeclared: boolean;
  confirmed: VacationForecastDelta;
  tentative: VacationForecastDelta;
}

function difference(before: ForecastScenario, after: ForecastScenario): VacationForecastDelta {
  return {
    before,
    after,
    balanceChange: before.balance === null || after.balance === null ? null : after.balance - before.balance,
    scheduledChange: after.scheduled - before.scheduled,
    expiredChange: after.expired - before.expired,
    lostAccrualChange: after.lostAccrual - before.lostAccrual,
    unfundedChange: after.unfunded - before.unfunded,
  };
}

/**
 * Compares a proposed vacation with existing approved/completed leave and a second
 * scenario that also includes planned/requested leave. Does not save or transmit dates.
 *
 * The proposed range must be wholly after the as-of balance and no later than the
 * forecast target. Caller supplies the same employer calendar used by the request ledger.
 * A missing coverage declaration is reported rather than implying calendar completeness.
 */
export function compareVacationForecast(
  policy: TimeOffPolicy,
  through: ISODate,
  requests: readonly PtoRequest[],
  calendar: RequestCalendar,
  proposedStart: ISODate,
  proposedEnd: ISODate,
): VacationForecastComparison | null {
  if (!validRequestRange(proposedStart, proposedEnd)
    || proposedStart <= policy.balanceAsOf || proposedEnd > through
    || !calendarCoversRequest(calendar, proposedStart, proposedEnd)
    || !Array.isArray(calendar.workWeek) || calendar.workWeek.length !== 7
    || !calendar.workWeek.every((day) => typeof day === 'boolean')
    || !Array.isArray(calendar.offDays) || calendar.offDays.length > 4000
    || !calendar.offDays.every((day) => typeof day === 'string' && isValidISODate(day))) return null;

  const baseline = forecastWithRequests(policy, through, requests);
  if (!baseline) return null;

  const proposedPtoDates = requestPtoDates(proposedStart, proposedEnd, calendar);
  const existingConfirmed = new Set([
    ...policy.plannedDays.filter((date) => date > policy.balanceAsOf && date <= through),
    ...requestDatesForScenario(requests, policy.balanceAsOf, through, false),
  ]);
  const existingTentative = new Set([
    ...policy.plannedDays.filter((date) => date > policy.balanceAsOf && date <= through),
    ...requestDatesForScenario(requests, policy.balanceAsOf, through, true),
  ]);
  const overlappingConfirmedDays = proposedPtoDates.filter((date) => existingConfirmed.has(date)).length;
  const overlappingTentativeDays = proposedPtoDates.filter((date) => existingTentative.has(date)).length;

  // Adding hypothetical days to the policy, not to the request ledger, preserves
  // approved/requested status semantics and the projection engine's date deduplication.
  const withVacation = forecastWithRequests({
    ...policy,
    plannedDays: [...new Set([...policy.plannedDays, ...proposedPtoDates])].sort(),
  }, through, requests);
  if (!withVacation) return null;

  return {
    through,
    proposedStart,
    proposedEnd,
    proposedPtoDates,
    overlappingConfirmedDays,
    overlappingTentativeDays,
    incrementalConfirmedDays: proposedPtoDates.length - overlappingConfirmedDays,
    incrementalTentativeDays: proposedPtoDates.length - overlappingTentativeDays,
    employerCalendarCoverageDeclared: calendar.rangeStart !== undefined && calendar.rangeEnd !== undefined,
    confirmed: difference(baseline.confirmed, withVacation.confirmed),
    tentative: difference(baseline.tentative, withVacation.tentative),
  };
}
