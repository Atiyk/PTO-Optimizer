import { addDays } from '@daysoff/engine/solver/dateUtils';
import { waitingPeriodEnd, type TimeOffPolicy } from '../policy/model';
import { generateAlerts, type PolicyAlert } from '../policy/alerts';
import type { CalendarReminder } from '../ui/icsExport';
import { forecastWithRequests } from './forecast';
import { requestDatesForScenario, type PtoRequest } from './requestLedger';

export const EXPIRATION_REMINDER_LEADS = [60, 30, 7] as const;
export type ExpirationReminderLead = typeof EXPIRATION_REMINDER_LEADS[number];

export interface ExpirationRisk extends PolicyAlert {
  deadline: string;
  kind: 'forfeiture' | 'carryover' | 'cap';
  expirationDate: string;
  planningBudget: number;
  canPlan: boolean;
}

export function expirationRisks(policy: TimeOffPolicy, country: string, requests: readonly PtoRequest[], today: string): ExpirationRisk[] {
  const start = today > policy.balanceAsOf ? today : policy.balanceAsOf;
  const forecast = forecastWithRequests(policy, addDays(start, 550), requests);
  if (!forecast || policy.accrual.kind === 'unlimited') return [];
  const alerts = generateAlerts(forecast.confirmed.policy, forecast.confirmed.events, today, country);
  const nearest = new Map<ExpirationRisk['kind'], ExpirationRisk>();
  for (const alert of alerts) {
    const kind = alert.id.startsWith('forfeit-') ? 'forfeiture' : alert.id.startsWith('carried-expiring-') ? 'carryover'
      : alert.id.startsWith('cap-') ? 'cap' : null;
    if (!kind || !alert.deadline || alert.deadline < today) continue;
    const current = nearest.get(kind);
    if (!current || alert.deadline < current.deadline) nearest.set(kind, { ...alert, deadline: alert.deadline, expirationDate: alert.eventDate ?? alert.deadline, kind, planningBudget: 0, canPlan: false });
  }
  return [...nearest.values()].map((risk) => {
    const perDay = policy.unit === 'hours' ? policy.hoursPerDay : 1;
    const wanted = risk.kind === 'cap' ? Math.max(1, Math.ceil(risk.daysAtStake)) : Math.floor(risk.daysAtStake);
    let earliest = start;
    const waitingEnds = waitingPeriodEnd(policy);
    if (waitingEnds && waitingEnds > earliest) earliest = waitingEnds;
    if (risk.kind === 'carryover') {
      // Spending before the reset can leave the carried portion unchanged. Start only
      // after the reset that creates the carried bank this alert is about.
      const carried = forecast.confirmed.events.filter((event) => event.kind === 'carryover-applied' && event.date <= risk.expirationDate).at(-1);
      if (carried && carried.date > earliest) earliest = carried.date;
    }
    const riskProjection = forecastWithRequests(policy, risk.deadline, requests)?.confirmed;
    const futurePlanned = [...new Set([
      ...policy.plannedDays.filter((date) => date >= start && date <= risk.deadline),
      ...requestDatesForScenario(requests, addDays(start, -1), risk.deadline),
    ])].sort();
    let bestBudget = 0;
    let planningStart = earliest;
    if (riskProjection && riskProjection.unfunded < 1e-9) {
      for (const point of riskProjection.series) {
        if (point.date < earliest || point.date > risk.deadline) continue;
        const reserve = futurePlanned.filter((date) => date > point.date).length * perDay;
        const available = Math.min(wanted, Math.max(0, Math.floor((point.balance - reserve) / perDay + 1e-9)));
        if (available > bestBudget) { bestBudget = available; planningStart = point.date; }
        if (bestBudget >= wanted) break;
      }
    }
    const params = new URLSearchParams(risk.ptoHref.split('?')[1]);
    params.set('s', planningStart);
    params.set('b', String(bestBudget));
    params.set('rv', '0');
    // The budget is already earned at planningStart under the exact pay schedule.
    // No monthly approximation or second accrual stream is needed in the optimizer.
    for (const key of ['ac', 'am', 'ex', 'xd', 'cc']) params.delete(key);
    if (futurePlanned.length) params.set('bo', [...new Set(futurePlanned)].sort().join(','));
    return { ...risk, planningBudget: bestBudget, canPlan: bestBudget > 0, ptoHref: `/pto?${params.toString()}` };
  }).sort((a, b) => a.deadline.localeCompare(b.deadline) || b.daysAtStake - a.daysAtStake);
}

/** Reminders are calendar events, never promises of email or background push delivery. */
export function expirationReminders(risks: readonly ExpirationRisk[], leads: readonly ExpirationReminderLead[], today: string): CalendarReminder[] {
  const result: CalendarReminder[] = [];
  for (const risk of risks) {
    if (risk.kind === 'cap') continue;
    for (const lead of [...new Set(leads)].filter((value) => EXPIRATION_REMINDER_LEADS.includes(value))) {
      const date = addDays(risk.expirationDate, -lead);
      if (date < today) continue;
      result.push({
        id: `expiration-${risk.id}-${lead}`, date,
        title: `Use PTO by ${risk.deadline}: ${lead}-day reminder`,
        description: `${risk.text} Last day to use it: ${risk.deadline}. Based on your entered policy and approved leave when exported. Recheck your balance and employer policy in Gapless; this calendar file does not update automatically.`,
      });
    }
  }
  return result.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}
