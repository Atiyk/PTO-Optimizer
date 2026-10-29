import type { ISODate } from '../solver/types';
import { addDays } from '../solver/dateUtils';
import type { PolicyEvent } from './projection';
import type { TimeOffPolicy } from './model';

export interface PolicyAlert {
  id: string;
  text: string;
  /** What this alert is ranked by - the thing actually at stake. */
  daysAtStake: number;
  /** /pto hand-off: the exact days-at-risk budget and a deadline-bounded range, so the
   * optimizer shows the best way to use exactly the days this alert is about. */
  ptoHref: string;
}

function buildPtoHref(policy: TimeOffPolicy, today: ISODate, deadline: ISODate, budget: number, country: string): string {
  const params = new URLSearchParams();
  params.set('c', country);
  params.set('s', today);
  params.set('e', deadline);
  params.set('b', String(Math.max(1, Math.round(budget))));
  if (policy.accrual.kind === 'per-pay-period') {
    params.set('ac', '1');
    params.set('am', String(policy.accrual.amount));
  }
  if (policy.planYear.kind === 'custom') {
    params.set('ex', '1');
    params.set('xd', policy.planYear.resetDate);
    if (policy.carryover.mode === 'capped') params.set('cc', String(policy.carryover.cap ?? 0));
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
    if (e.kind === 'forfeited' && e.amount > 0.05) {
      const dayWord = e.amount === 1 ? 'day' : 'days';
      // The deadline to actually USE these days is the day before the reset itself (the
      // reset day is when they're already gone) - so the /pto hand-off plans a range
      // ending there, not on the reset date.
      const useByDeadline = addDays(e.date, -1);
      alerts.push({
        id: `forfeit-${e.date}`,
        text: `You'll lose ${roundForDisplay(e.amount, policy)} ${dayWord} on ${e.date} unless you take them.`,
        daysAtStake: e.amount,
        ptoHref: buildPtoHref(policy, today, useByDeadline, e.amount, country),
      });
    }
    if (e.kind === 'carried-days-expiring' && e.amount > 0.05) {
      const dayWord = e.amount === 1 ? 'day' : 'days';
      const useByDeadline = addDays(e.date, -1);
      alerts.push({
        id: `carried-expiring-${e.date}`,
        text: `Carried days expire ${e.date} — ${roundForDisplay(e.amount, policy)} ${dayWord} at stake.`,
        daysAtStake: e.amount,
        ptoHref: buildPtoHref(policy, today, useByDeadline, e.amount, country),
      });
    }
    if (e.kind === 'cap-reached' && e.lost > 0.05) {
      alerts.push({
        id: `cap-${e.date}`,
        text: `You'll hit your cap on ${e.date} and stop earning until you take some days.`,
        daysAtStake: e.lost,
        ptoHref: buildPtoHref(policy, today, e.date, Math.max(1, Math.round(policy.accrualCap ?? 1)), country),
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

function roundForDisplay(amount: number, policy: TimeOffPolicy): string {
  const rounded = Math.round(amount * 100) / 100;
  return policy.unit === 'hours' ? `${rounded}` : Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
}
