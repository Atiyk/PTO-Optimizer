import type { ISODate } from '../solver/types';
import { addDays, isoToSerial } from '../solver/dateUtils';
import { payDatesInRange, resetDatesInRange, waitingPeriodEnd, type TimeOffPolicy } from './model';

export interface BalancePoint {
  date: ISODate;
  balance: number;
}

export type PolicyEvent =
  | { kind: 'accrual-credited'; date: ISODate; amount: number }
  | { kind: 'cap-reached'; date: ISODate; lost: number }
  | { kind: 'reset'; date: ISODate }
  | { kind: 'carryover-applied'; date: ISODate; carried: number }
  | { kind: 'forfeited'; date: ISODate; amount: number }
  | { kind: 'carried-days-expiring'; date: ISODate; amount: number }
  | { kind: 'waiting-period-ended'; date: ISODate }
  | { kind: 'planned-day-taken'; date: ISODate };

/**
 * Projects a policy's balance day by day from `balanceAsOf` through `horizonEnd` (Stage 2B).
 * Everything stays in the policy's own native unit (hours stay hours when unit === 'hours');
 * rounding for display happens in the UI layer, never here. `unlimited` policies have no
 * balance to project — callers show narrative copy instead (acceptance scenario S5).
 */
export function projectBalance(policy: TimeOffPolicy, horizonEnd: ISODate): { series: BalancePoint[]; events: PolicyEvent[] } {
  if (policy.accrual.kind === 'unlimited') return { series: [], events: [] };

  const series: BalancePoint[] = [{ date: policy.balanceAsOf, balance: policy.currentBalance }];
  const events: PolicyEvent[] = [];
  let balance = policy.currentBalance;
  // The portion of `balance` that was carried over at the most recent reset and is subject
  // to its own use-by deadline (only tracked while carryover.useByDate is set).
  let carriedAmount = 0;
  let carriedExpiry: ISODate | undefined;

  const plannedSet = new Set(policy.plannedDays);
  const resets = new Set(resetDatesInRange(policy.planYear, policy.balanceAsOf, horizonEnd));
  const payDates = policy.accrual.kind === 'per-pay-period' ? new Set(payDatesInRange(policy.accrual, policy.balanceAsOf, horizonEnd)) : undefined;
  const wpEnd = waitingPeriodEnd(policy);
  const balanceAsOfSerial = isoToSerial(policy.balanceAsOf);

  function credit(date: ISODate, amount: number): void {
    const capped = policy.accrualCap !== undefined ? Math.min(balance + amount, policy.accrualCap) : balance + amount;
    const lost = balance + amount - capped;
    if (lost > 1e-9) events.push({ kind: 'cap-reached', date, lost });
    const actuallyCredited = amount - Math.max(0, lost);
    if (actuallyCredited > 1e-9) events.push({ kind: 'accrual-credited', date, amount: actuallyCredited });
    balance = capped;
  }

  let d = policy.balanceAsOf;
  while (d < horizonEnd) {
    d = addDays(d, 1);

    if (resets.has(d)) {
      events.push({ kind: 'reset', date: d });
      const allowed =
        policy.carryover.mode === 'all' ? balance : policy.carryover.mode === 'capped' ? Math.min(balance, policy.carryover.cap ?? 0) : 0;
      const forfeited = Math.max(0, balance - allowed);
      if (forfeited > 1e-9) events.push({ kind: 'forfeited', date: d, amount: forfeited });
      if (allowed > 1e-9) events.push({ kind: 'carryover-applied', date: d, carried: allowed });
      balance = allowed;
      carriedAmount = policy.carryover.useByDate && allowed > 1e-9 ? allowed : 0;
      carriedExpiry = carriedAmount > 0 ? policy.carryover.useByDate : undefined;
      if (policy.accrual.kind === 'front-loaded') credit(d, policy.accrual.amount);
    } else if (policy.accrual.kind === 'front-loaded' && d === policy.accrual.grantDate) {
      credit(d, policy.accrual.amount);
    }

    if (payDates?.has(d) && policy.accrual.kind === 'per-pay-period') {
      credit(d, policy.accrual.amount);
    }

    if (policy.accrual.kind === 'per-hour-worked' && (isoToSerial(d) - balanceAsOfSerial) % 7 === 0) {
      const weeklyHours = policy.accrual.rate * policy.accrual.typicalWeeklyHours;
      credit(d, policy.unit === 'hours' ? weeklyHours : weeklyHours / policy.hoursPerDay);
    }

    if (plannedSet.has(d)) {
      const spend = policy.unit === 'hours' ? policy.hoursPerDay : 1;
      carriedAmount = Math.max(0, carriedAmount - spend);
      balance = Math.max(balance - spend, -policy.negativeBalanceAllowance);
      events.push({ kind: 'planned-day-taken', date: d });
    }

    if (carriedExpiry === d && carriedAmount > 1e-9) {
      events.push({ kind: 'carried-days-expiring', date: d, amount: carriedAmount });
      balance = Math.max(0, balance - carriedAmount);
      carriedAmount = 0;
      carriedExpiry = undefined;
    }

    if (wpEnd === d) events.push({ kind: 'waiting-period-ended', date: d });

    series.push({ date: d, balance });
  }

  return { series, events };
}
