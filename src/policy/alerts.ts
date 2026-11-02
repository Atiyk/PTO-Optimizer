import type { ISODate } from '@daysoff/engine/solver/types';
import { addDays } from '@daysoff/engine/solver/dateUtils';
import type { PolicyEvent } from './projection';
import { toLegacySolverFields, type TimeOffPolicy } from './model';

export interface PolicyAlert {
  id: string;
  text: string;
  /** What this alert is ranked by - the thing actually at stake. */
  daysAtStake: number;
  /** /pto hand-off: the exact days-at-risk budget and a deadline-bounded range, so the
   * optimizer shows the best way to use exactly the days this alert is about. */
  ptoHref: string;
  /** Last date on which using PTO can help; separate from a reset that happens next day. */
  deadline?: ISODate;
  eventDate?: ISODate;
}

function buildPtoHref(policy: TimeOffPolicy, today: ISODate, deadline: ISODate, budget: number, country: string): string {
  const params = new URLSearchParams();
  params.set('c', country);
  params.set('s', today);
  params.set('e', deadline);
  // The optimizer plans whole days. A native-hour balance must first be converted;
  // rounding up could spend PTO the user does not have.
  params.set('b', String(Math.max(0, Math.floor(budget))));
  if (policy.accrual.kind === 'per-pay-period' || policy.accrual.kind === 'per-hour-worked') {
    const monthlyNative = toLegacySolverFields(policy, today).accrualPerMonth ?? 0;
    const monthlyDays = policy.unit === 'hours' && policy.accrual.kind === 'per-pay-period'
      ? monthlyNative / policy.hoursPerDay : monthlyNative;
    params.set('ac', '1');
    params.set('am', String(monthlyDays));
  }
  if (policy.planYear.kind === 'custom') {
    params.set('ex', '1');
    params.set('xd', policy.planYear.resetDate);
    if (policy.carryover.mode === 'capped') params.set('cc', String(toDays(policy.carryover.cap ?? 0, policy)));
  }
  return `/pto?${params.toString()}`;
}

/**
 * Stage 4B: turns projection events into the ranked alert list, "ranked by days at stake"
 * per the run prompt - the biggest number always surfaces first, since that's the single
 * most useful thing to know about a policy at a glance.
 */
export function generateAlerts(policy: TimeOffPolicy, events: PolicyEvent[], today: ISODate, country: string): PolicyAlert[] {
  const alerts: PolicyAlert[] = [];

  for (const e of events) {
    if (e.date < today) continue;
    if (e.kind === 'forfeited' && e.amount > 0.05) {
      const unitWord = policy.unit === 'hours' ? (e.amount === 1 ? 'hour' : 'hours') : (e.amount === 1 ? 'day' : 'days');
      // The deadline to actually USE these days is the day before the reset itself (the
      // reset day is when they're already gone) - so the /pto hand-off plans a range
      // ending there, not on the reset date.
      const useByDeadline = addDays(e.date, -1);
      if (useByDeadline < today) continue;
      alerts.push({
        id: `forfeit-${e.date}`,
        text: `You could lose ${roundForDisplay(e.amount, policy)} ${unitWord} on ${e.date}.`,
        daysAtStake: toDays(e.amount, policy),
        ptoHref: buildPtoHref(policy, today, useByDeadline, toDays(e.amount, policy), country),
        deadline: useByDeadline,
        eventDate: e.date,
      });
    }
    if (e.kind === 'carried-days-expiring' && e.amount > 0.05) {
      const unitWord = policy.unit === 'hours' ? (e.amount === 1 ? 'hour' : 'hours') : (e.amount === 1 ? 'day' : 'days');
      // projectBalance spends planned PTO before expiring the carried remainder at
      // the end of this date, so the entered use-by date itself is still usable.
      const useByDeadline = e.date;
      if (useByDeadline < today) continue;
      alerts.push({
        id: `carried-expiring-${e.date}`,
        text: `Carried PTO could expire ${e.date} — ${roundForDisplay(e.amount, policy)} ${unitWord} at stake.`,
        daysAtStake: toDays(e.amount, policy),
        ptoHref: buildPtoHref(policy, today, useByDeadline, toDays(e.amount, policy), country),
        deadline: useByDeadline,
        eventDate: e.date,
      });
    }
    if (e.kind === 'cap-reached' && e.lost > 0.05) {
      const useByDeadline = addDays(e.date, -1);
      if (useByDeadline < today) continue;
      alerts.push({
        id: `cap-${e.date}`,
        text: `You could reach your accrual cap on ${e.date} and miss out on future PTO.`,
        daysAtStake: toDays(e.lost, policy),
        ptoHref: buildPtoHref(policy, today, useByDeadline, Math.max(1, Math.ceil(toDays(e.lost, policy))), country),
        deadline: useByDeadline,
        eventDate: e.date,
      });
    }
    if (e.kind === 'waiting-period-ended') {
      alerts.push({
        id: `waiting-period-${e.date}`,
        text: `You can't use days until ${e.date} (waiting period).`,
        daysAtStake: 0,
        ptoHref: buildPtoHref(policy, e.date, e.date, 1, country),
      });
    }
  }

  // Only the first (nearest) cap-reached alert is useful — repeated pause/resume cycles
  // would otherwise spam the list with the same message.
  const seenCap = new Set<string>();
  const deduped = alerts.filter((a) => {
    if (!a.id.startsWith('cap-')) return true;
    if (seenCap.size > 0) return false;
    seenCap.add(a.id);
    return true;
  });

  return deduped.sort((a, b) => b.daysAtStake - a.daysAtStake);
}

function toDays(amount: number, policy: TimeOffPolicy): number {
  return policy.unit === 'hours' ? amount / policy.hoursPerDay : amount;
}

function roundForDisplay(amount: number, policy: TimeOffPolicy): string {
  const rounded = Math.round(amount * 100) / 100;
  return policy.unit === 'hours' ? `${rounded}` : Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
}
