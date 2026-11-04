import type { ISODate } from '@daysoff/engine/solver/types';
import { addDays } from '@daysoff/engine/solver/dateUtils';
import { resetDatesInRange, type TimeOffPolicy } from '../policy/model';
import type { PolicyEvent } from '../policy/projection';
import { forecastWithRequests, type ForecastScenario } from './forecast';
import type { PtoRequest } from './requestLedger';

/**
 * Read-only expiration/carryover snapshot for a consumer policy.
 * This is a view of the existing projection events, NOT another accrual engine.
 * Amounts always remain in the policy's native unit (days or hours).
 */
export interface CarryoverScenario {
  beforeResetBalance: number;
  afterResetBalance: number;
  carriedAtReset: number;
  forfeitedAtReset: number;
  creditedOnReset: number;
  accruedThroughReset: number;
  scheduledThroughReset: number;
  carriedExpiredBeforeReset: number;
  lostAccrualThroughReset: number;
  unfundedThroughReset: number;
}

export interface CarryoverSnapshot {
  unit: TimeOffPolicy['unit'];
  balanceAsOf: ISODate;
  resetDate: ISODate;
  lastUseDateBeforeReset: ISODate;
  confirmed: CarryoverScenario;
  tentative: CarryoverScenario;
  /** Only present for an entered deadline after this reset and before the next reset. */
  carriedUseByDate?: ISODate;
  /** Actual projected forfeiture at the entered carried-bank deadline, not the whole carryover bank. */
  carriedExpiry?: { confirmed: number; tentative: number };
  /** A configured deadline outside the projected carried bank's cycle cannot be interpreted safely. */
  deadlineNeedsReview: boolean;
}

function amount(events: readonly PolicyEvent[], kind: PolicyEvent['kind'], date?: ISODate): number {
  return events.reduce((sum, event) => {
    if (event.kind !== kind || (date && event.date !== date)) return sum;
    if (event.kind === 'cap-reached') return sum + event.lost;
    if ('amount' in event) return sum + event.amount;
    if (event.kind === 'carryover-applied') return sum + event.carried;
    return sum;
  }, 0);
}

function summarize(scenario: ForecastScenario, resetDate: ISODate, lastUseDate: ISODate): CarryoverScenario {
  const before = scenario.series.find((point) => point.date === lastUseDate);
  const after = scenario.series.find((point) => point.date === resetDate);
  return {
    beforeResetBalance: before?.balance ?? scenario.policy.currentBalance,
    afterResetBalance: after?.balance ?? scenario.policy.currentBalance,
    carriedAtReset: amount(scenario.events, 'carryover-applied', resetDate),
    forfeitedAtReset: amount(scenario.events, 'forfeited', resetDate),
    creditedOnReset: amount(scenario.events, 'accrual-credited', resetDate),
    accruedThroughReset: scenario.accrued,
    scheduledThroughReset: scenario.scheduled,
    carriedExpiredBeforeReset: scenario.events
      .filter((event) => event.kind === 'carried-days-expiring' && event.date < resetDate)
      .reduce((sum, event) => sum + (event.kind === 'carried-days-expiring' ? event.amount : 0), 0),
    lostAccrualThroughReset: scenario.lostAccrual,
    unfundedThroughReset: scenario.unfunded,
  };
}

/**
 * Projects the next annual/custom/anniversary reset and, when meaningful, the
 * subsequent carried-bank deadline. Approved and completed leave is charged once;
 * requested/planned leave is kept in a separate tentative scenario.
 *
 * Returns null for invalid inputs and unlimited PTO, where a cash-like bank
 * or forfeiture number would be misleading.
 */
export function carryoverSnapshot(policy: TimeOffPolicy, requests: readonly PtoRequest[] = []): CarryoverSnapshot | null {
  if (policy.accrual.kind === 'unlimited') return null;
  const resetDate = resetDatesInRange(policy.planYear, policy.balanceAsOf, addDays(policy.balanceAsOf, 370))[0];
  if (!resetDate) return null;
  const reset = forecastWithRequests(policy, resetDate, requests);
  if (!reset || reset.confirmed.balance === null || reset.tentative.balance === null) return null;
  const lastUseDateBeforeReset = addDays(resetDate, -1);
  const nextReset = resetDatesInRange(policy.planYear, resetDate, addDays(resetDate, 370))[0];
  const deadline = policy.carryover.useByDate;
  const deadlineNeedsReview = Boolean(deadline && (deadline <= resetDate || !nextReset || deadline >= nextReset));
  const validDeadline = deadline && !deadlineNeedsReview && policy.carryover.mode !== 'none' ? deadline : undefined;
  const deadlineForecast = validDeadline ? forecastWithRequests(policy, validDeadline, requests) : null;

  return {
    unit: policy.unit,
    balanceAsOf: policy.balanceAsOf,
    resetDate,
    lastUseDateBeforeReset,
    confirmed: summarize(reset.confirmed, resetDate, lastUseDateBeforeReset),
    tentative: summarize(reset.tentative, resetDate, lastUseDateBeforeReset),
    ...(validDeadline ? { carriedUseByDate: validDeadline } : {}),
    ...(validDeadline && deadlineForecast ? {
      carriedExpiry: {
        confirmed: amount(deadlineForecast.confirmed.events, 'carried-days-expiring', validDeadline),
        tentative: amount(deadlineForecast.tentative.events, 'carried-days-expiring', validDeadline),
      },
    } : {}),
    deadlineNeedsReview,
  };
}
