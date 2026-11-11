import type { ISODate } from '@daysoff/engine/solver/types';
import { isoToSerial } from '@daysoff/engine/solver/dateUtils';
import { validateCurrentCarriedBalance, type TimeOffPolicy } from '../policy/model';
import { projectBalance, type BalancePoint, type PolicyEvent } from '../policy/projection';
import { isValidISODate } from '../ui/urlState';
import { isScheduledRequest, requestConflicts, type PtoRequest } from './requestLedger';
import { chargeableRequestDates, requestDateCharge, type BalanceBasis } from './workspace';

export interface ForecastScenario {
  balance: number | null;
  accrued: number;
  scheduled: number;
  expired: number;
  lostAccrual: number;
  /** Requested consumption beyond available balance and the permitted borrowing limit. */
  unfunded: number;
  series: BalancePoint[];
  events: PolicyEvent[];
  policy: TimeOffPolicy;
}

export function validForecastDate(date: string, asOf: string): boolean {
  return isValidISODate(date) && isValidISODate(asOf) && date >= asOf
    && isoToSerial(date) - isoToSerial(asOf) <= 3660;
}

function validPolicy(policy: TimeOffPolicy): boolean {
  const accrual = policy.accrual;
  const numbers = [policy.currentBalance, policy.hoursPerDay, policy.negativeBalanceAllowance,
    ...(policy.waitingPeriodDays === undefined ? [] : [policy.waitingPeriodDays]),
    ...(policy.accrualCap === undefined ? [] : [policy.accrualCap]),
    ...(policy.carryover.cap === undefined ? [] : [policy.carryover.cap]),
    ...(accrual.kind === 'per-hour-worked' ? [accrual.rate, accrual.typicalWeeklyHours]
      : accrual.kind === 'unlimited' ? [accrual.expectedDaysPerYear] : [accrual.amount])];
  return (accrual.kind === 'unlimited' || !validateCurrentCarriedBalance(policy))
    && numbers.every(Number.isFinite) && policy.hoursPerDay > 0 && policy.negativeBalanceAllowance >= 0
    && (policy.waitingPeriodDays === undefined || policy.waitingPeriodDays >= 0)
    && (policy.accrualCap === undefined || policy.accrualCap >= 0)
    && (policy.carryover.cap === undefined || policy.carryover.cap >= 0)
    && (accrual.kind === 'per-hour-worked' ? accrual.rate >= 0 && accrual.typicalWeeklyHours >= 0
      : accrual.kind === 'unlimited' ? accrual.expectedDaysPerYear >= 0 : accrual.amount >= 0)
    && (accrual.kind !== 'per-pay-period' || isValidISODate(accrual.payDateAnchor))
    && (accrual.kind !== 'front-loaded' || isValidISODate(accrual.grantDate))
    && (policy.planYear.kind !== 'anniversary' || isValidISODate(policy.planYear.startDate))
    && (policy.planYear.kind !== 'custom' || isValidISODate(policy.planYear.resetDate))
    && (!policy.carryover.useByDate || isValidISODate(policy.carryover.useByDate));
}

function scenario(policy: TimeOffPolicy, through: ISODate, requests: readonly PtoRequest[], tentative: boolean): ForecastScenario {
  // The shared workspace rule decides which request days this balance still owes.
  const basis: BalanceBasis = { asOf: policy.balanceAsOf, includesApprovedLeave: policy.balanceIncludesApprovedLeave === true };
  const charged = new Set(chargeableRequestDates(requests, basis, through, tentative));
  const alreadyInBalance = new Set(requests.flatMap(request => request.ptoDates
    .filter(date => date > policy.balanceAsOf && requestDateCharge(request, date, basis) === 'in-balance')));
  const inForecast = (date: ISODate) => isValidISODate(date) && date > policy.balanceAsOf
    && date <= through && !alreadyInBalance.has(date);
  const bookedHours = new Map<ISODate, number>();
  for (const date of policy.plannedDays.filter(inForecast)) bookedHours.set(date, policy.hoursPerDay);
  for (const request of requests) {
    if (!isScheduledRequest(request, tentative)) continue;
    for (const date of request.ptoDates.filter(date => charged.has(date))) {
      const minutes = request.ptoMinutes?.[date];
      const amount = minutes !== undefined && Number.isInteger(minutes) && minutes > 0 && minutes <= 1440
        ? minutes / 60 : policy.hoursPerDay;
      // No time-of-day overlap is stored. Treat overlapping records as one booking
      // at the larger recorded amount rather than consuming both in full.
      bookedHours.set(date, Math.max(bookedHours.get(date) ?? 0, amount));
    }
  }
  const scenarioPolicy = { ...policy, plannedDays: [...bookedHours.keys()].sort() };
  const { series, events } = projectBalance(scenarioPolicy, through, bookedHours);
  const accrued = events.reduce((sum, e) => sum + (e.kind === 'accrual-credited' ? e.amount : 0), 0);
  const scheduled = events.reduce((sum, e) => sum + (e.kind === 'planned-day-taken' ? e.amount : 0), 0);
  const expired = events.reduce((sum, e) => sum + (e.kind === 'forfeited' || e.kind === 'carried-days-expiring' ? e.amount : 0), 0);
  const lostAccrual = events.reduce((sum, e) => sum + (e.kind === 'cap-reached' ? e.lost : 0), 0);
  const projected = series[series.length - 1]?.balance ?? policy.currentBalance;
  const balance = policy.accrual.kind === 'unlimited' ? null : projected === 0 ? 0 : projected;
  // The existing projection caps withdrawals at the allowed negative balance. Account
  // for the amount it could not deduct, day by day, including resets that clear debt.
  let unfunded = 0;
  if (balance !== null) {
    const eventsByDay = new Map<ISODate, PolicyEvent[]>();
    for (const event of events) eventsByDay.set(event.date, [...(eventsByDay.get(event.date) ?? []), event]);
    for (let i = 1; i < series.length; i++) {
      const daily = eventsByDay.get(series[i].date) ?? [];
      const debit = daily.find((e) => e.kind === 'planned-day-taken');
      if (!debit) continue;
      let before = series[i - 1].balance;
      if (daily.some((e) => e.kind === 'reset')) {
        before = policy.carryover.mode === 'all' ? before
          : policy.carryover.mode === 'capped' ? Math.min(before, policy.carryover.cap ?? 0) : 0;
      }
      before += daily.reduce((sum, e) => sum + (e.kind === 'accrual-credited' ? e.amount : 0), 0);
      unfunded += Math.max(0, debit.amount - before - policy.negativeBalanceAllowance);
    }
  }
  return { balance, accrued, scheduled, expired, lostAccrual, unfunded, series, events, policy: scenarioPolicy };
}

/** Reuses the policy projection for each scenario; never charges dates already in the as-of balance. */
export function forecastWithRequests(policy: TimeOffPolicy, through: ISODate, requests: readonly PtoRequest[] = []) {
  if (!validForecastDate(through, policy.balanceAsOf) || !validPolicy(policy)) return null;
  return {
    confirmed: scenario(policy, through, requests, false),
    tentative: scenario(policy, through, requests, true),
    conflicts: requestConflicts(requests),
  };
}
