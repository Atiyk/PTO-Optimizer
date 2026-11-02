import type { ISODate } from '@daysoff/engine/solver/types';
import { isoToSerial } from '@daysoff/engine/solver/dateUtils';
import { validateCurrentCarriedBalance, type TimeOffPolicy } from '../policy/model';
import { projectBalance, type BalancePoint, type PolicyEvent } from '../policy/projection';
import { isValidISODate } from '../ui/urlState';
import { requestConflicts, requestDatesForScenario, type PtoRequest } from './requestLedger';

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
  const plannedDays = [...new Set([
    ...policy.plannedDays.filter((date) => isValidISODate(date) && date > policy.balanceAsOf && date <= through),
    ...requestDatesForScenario(requests, policy.balanceAsOf, through, tentative),
  ])].sort();
  const scenarioPolicy = { ...policy, plannedDays };
  const { series, events } = projectBalance(scenarioPolicy, through);
  const spend = policy.unit === 'hours' ? policy.hoursPerDay : 1;
  const accrued = events.reduce((sum, e) => sum + (e.kind === 'accrual-credited' ? e.amount : 0), 0);
  const scheduled = events.filter((e) => e.kind === 'planned-day-taken').length * spend;
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
      if (!daily.some((e) => e.kind === 'planned-day-taken')) continue;
      let before = series[i - 1].balance;
      if (daily.some((e) => e.kind === 'reset')) {
        before = policy.carryover.mode === 'all' ? before
          : policy.carryover.mode === 'capped' ? Math.min(before, policy.carryover.cap ?? 0) : 0;
      }
      before += daily.reduce((sum, e) => sum + (e.kind === 'accrual-credited' ? e.amount : 0), 0);
      unfunded += Math.max(0, spend - before - policy.negativeBalanceAllowance);
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
