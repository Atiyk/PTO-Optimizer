import type { ISODate } from '@daysoff/engine/solver/types';
import { waitingPeriodEnd, type TimeOffPolicy } from '../policy/model';
import type { PolicyEvent } from '../policy/projection';
import { forecastWithRequests } from './forecast';
import type { PtoRequest } from './requestLedger';

/**
 * Consumer-only, deterministic explanations of user-entered policy rules.
 * Every numeric projection is read from the existing policy/ledger forecast.
 * No legal interpretation, handbook parsing, request notes, or new calculator.
 */
export type PolicyRuleId =
  | 'accrual' | 'balance-cap' | 'plan-year' | 'carryover'
  | 'carried-expiration' | 'scheduled-leave' | 'waiting-period'
  | 'negative-balance' | 'departure-payout';

export interface RuleImpact {
  /** observed = calculated within the selected window; configured = rule without a
   * projected numeric effect; not-projected = this engine cannot quantify the rule. */
  kind: 'observed' | 'configured' | 'not-projected';
  /** In the policy's native unit; omitted when no numeric result is justified. */
  amount?: number;
  date?: ISODate;
  detail: string;
}

export interface PolicyRuleExplanation {
  id: PolicyRuleId;
  title: string;
  explanation: string;
  example: string;
  impact: RuleImpact;
  hrQuestion: string;
  guidePath: '/glossary';
}

export interface ConnectedPolicyExplanation {
  asOf: ISODate;
  through: ISODate;
  unit: TimeOffPolicy['unit'];
  currentBalance: number | null;
  confirmedBalance: number | null;
  tentativeBalance: number | null;
  confirmedAccrued: number;
  confirmedScheduled: number;
  tentativeAdditionalScheduled: number;
  confirmedExpired: number;
  confirmedLostAccrual: number;
  confirmedUnfunded: number;
  tentativeUnfunded: number;
  rules: PolicyRuleExplanation[];
  caveats: string[];
}

const n = (value: number): string => new Intl.NumberFormat('en', {
  maximumFractionDigits: 3,
}).format(value);

function eventTotal(events: readonly PolicyEvent[], kind: PolicyEvent['kind']): number {
  return events.reduce((sum, event) => {
    if (event.kind !== kind) return sum;
    if (event.kind === 'accrual-credited' || event.kind === 'forfeited'
      || event.kind === 'carried-days-expiring') return sum + event.amount;
    if (event.kind === 'carryover-applied') return sum + event.carried;
    if (event.kind === 'cap-reached') return sum + event.lost;
    return sum;
  }, 0);
}

function accrualDescription(policy: TimeOffPolicy): string {
  const a = policy.accrual;
  switch (a.kind) {
    case 'front-loaded':
      return n(a.amount) + ' ' + policy.unit + ' are credited on the entered grant date and on future plan-year resets in this model.';
    case 'per-pay-period':
      return n(a.amount) + ' ' + policy.unit + ' are credited per ' + a.frequency
        + ' pay date. Semi-monthly dates are modeled as the 1st and 16th.';
    case 'per-hour-worked':
      return n(a.rate) + ' PTO hours per hour worked, using the entered '
        + n(a.typicalWeeklyHours) + '-hour typical week. This model converts earned hours to days when the policy uses days; actual timesheets are not imported.';
    case 'unlimited':
      return 'Unlimited PTO has no banked balance or accrued cash-like amount in this forecast.';
  }
}

function yearDescription(policy: TimeOffPolicy): string {
  if (policy.planYear.kind === 'calendar') return 'Your modeled plan year resets on January 1.';
  if (policy.planYear.kind === 'anniversary') {
    return 'Your modeled plan year resets annually on the month and day of ' + policy.planYear.startDate + '.';
  }
  return 'Your modeled plan year resets annually on the month and day of ' + policy.planYear.resetDate + '.';
}

function carryoverDescription(policy: TimeOffPolicy): string {
  if (policy.carryover.mode === 'none') return 'At a modeled plan-year reset, unused banked time is not carried forward.';
  if (policy.carryover.mode === 'all') return 'At a modeled plan-year reset, the remaining bank is carried forward.';
  return 'At a modeled plan-year reset, up to ' + n(policy.carryover.cap ?? 0)
    + ' ' + policy.unit + ' of the remaining bank are carried forward.';
}

/**
 * Explains policy inputs and their exact forecast effects. The returned amounts are
 * derived only from forecastWithRequests and its PolicyEvent trace. A null result
 * means the policy/date is invalid, not a zero balance. This is NOT a legal opinion.
 */
export function explainConnectedPolicy(
  policy: TimeOffPolicy,
  through: ISODate,
  requests: readonly PtoRequest[] = [],
): ConnectedPolicyExplanation | null {
  const forecast = forecastWithRequests(policy, through, requests);
  if (!forecast) return null;
  const confirmed = forecast.confirmed;
  const tentative = forecast.tentative;
  const unlimited = policy.accrual.kind === 'unlimited';
  const events = confirmed.events;
  const reset = events.find((event) => event.kind === 'reset');
  const carried = eventTotal(events, 'carryover-applied');
  const forfeited = eventTotal(events, 'forfeited');
  const carriedExpired = eventTotal(events, 'carried-days-expiring');
  const extraTentative = Math.max(0, tentative.scheduled - confirmed.scheduled);
  const waitingEnd = waitingPeriodEnd(policy);
  const deadlineInWindow = Boolean(policy.carryover.useByDate
    && policy.carryover.useByDate > policy.balanceAsOf && policy.carryover.useByDate <= through);
  const guidePath = '/glossary' as const;
  const rules: PolicyRuleExplanation[] = [
    {
      id: 'accrual', title: 'How time is earned',
      explanation: accrualDescription(policy),
      example: unlimited ? 'No earned balance is projected for unlimited PTO.'
        : 'From ' + policy.balanceAsOf + ' through ' + through + ', the existing forecast credits '
          + n(confirmed.accrued) + ' ' + policy.unit + '.',
      impact: unlimited
        ? { kind: 'not-projected', detail: 'No banked balance for unlimited PTO.' }
        : { kind: 'observed', amount: confirmed.accrued, detail: 'Credited within the selected dates.' },
      hrQuestion: 'When is earned time actually credited, and does the rate change during the year?',
      guidePath,
    },
    {
      id: 'balance-cap', title: 'Maximum balance',
      explanation: policy.accrualCap === undefined
        ? 'No maximum banked balance has been entered.'
        : 'New credits stop or shrink when the modeled bank reaches ' + n(policy.accrualCap) + ' ' + policy.unit + '.',
      example: unlimited ? 'A cap is not applied to an unlimited bank.'
        : n(confirmed.lostAccrual) + ' ' + policy.unit + ' of modeled credits were blocked by the cap through ' + through + '.',
      impact: unlimited
        ? { kind: 'not-projected', detail: 'No banked balance for unlimited PTO.' }
        : policy.accrualCap === undefined
          ? { kind: 'configured', detail: 'No cap entered; no cap effect to report.' }
          : { kind: 'observed', amount: confirmed.lostAccrual, detail: 'Accrual credits not added due to the entered cap.' },
      hrQuestion: 'Does the balance cap pause future accrual, and when can accrual resume?',
      guidePath,
    },
    {
      id: 'plan-year', title: 'When the year resets',
      explanation: yearDescription(policy),
      example: reset ? 'A modeled reset occurs on ' + reset.date + '.'
        : 'No plan-year reset occurs between ' + policy.balanceAsOf + ' and ' + through + '.',
      impact: reset
        ? { kind: 'observed', date: reset.date, detail: 'Reset occurs within the forecast window.' }
        : { kind: 'configured', detail: 'Reset falls outside the forecast window.' },
      hrQuestion: 'What is the exact plan-year start date, including anniversary exceptions?',
      guidePath,
    },
    {
      id: 'carryover', title: 'What survives a reset',
      explanation: carryoverDescription(policy),
      example: reset ? 'The trace carried ' + n(carried) + ' and forfeited ' + n(forfeited)
        + ' ' + policy.unit + ' at modeled resets in this window.'
        : 'No reset occurs in this window, so carryover has not yet been applied.',
      impact: unlimited
        ? { kind: 'not-projected', detail: 'Unlimited PTO has no carryover bank.' }
        : reset
          ? { kind: 'observed', amount: carried, date: reset.date, detail: 'Total carried at modeled resets; separately forfeited: ' + n(forfeited) + ' ' + policy.unit + '.' }
          : { kind: 'configured', detail: 'No reset occurs in the selected window.' },
      hrQuestion: 'Is carryover automatic, capped, or subject to a special approval?',
      guidePath,
    },
    {
      id: 'carried-expiration', title: 'Deadline for carried time',
      explanation: policy.carryover.useByDate
        ? 'The entered use-by date for the carried portion is ' + policy.carryover.useByDate + '.'
        : 'No separate carried-time use-by date has been entered.',
      example: unlimited ? 'No carried bank is projected.'
        : n(carriedExpired) + ' ' + policy.unit + ' expired from the modeled carried portion in this window.',
      impact: unlimited
        ? { kind: 'not-projected', detail: 'No carried bank for unlimited PTO.' }
        : deadlineInWindow
          ? { kind: 'observed', amount: carriedExpired, date: policy.carryover.useByDate, detail: 'Carried units expired within the forecast window.' }
          : { kind: 'configured', detail: policy.carryover.useByDate
            ? 'The entered carried-bank deadline falls outside this forecast window.'
            : 'No separate carried-bank deadline entered.' },
      hrQuestion: 'Do carried days expire on a different date from the plan-year reset?',
      guidePath,
    },
    {
      id: 'scheduled-leave', title: 'Time already planned',
      explanation: 'Approved/completed requests and policy-planned dates are counted once after the as-of date. Requested/planned ledger entries appear only in the tentative scenario.',
      example: unlimited ? 'No banked units are deducted for unlimited PTO.'
        : 'Confirmed scenario schedules ' + n(confirmed.scheduled) + ' ' + policy.unit
          + '; tentative requests add ' + n(extraTentative) + ' ' + policy.unit + ' without double counting overlaps.',
      impact: unlimited
        ? { kind: 'not-projected', detail: 'No banked balance for unlimited PTO.' }
        : { kind: 'observed', amount: confirmed.scheduled, detail: 'Confirmed scheduled units, including policy-planned dates; tentative additional units: ' + n(extraTentative) + '.' },
      hrQuestion: 'Are approved days already deducted from the balance HR displays?',
      guidePath,
    },
    {
      id: 'waiting-period', title: 'When time can be used',
      explanation: waitingEnd
        ? 'The entered waiting period ends on ' + waitingEnd + '. This forecast does not block spending before that date.'
        : 'No waiting period has been entered.',
      example: waitingEnd ? 'Confirm whether requests before ' + waitingEnd + ' can be approved.'
        : 'No waiting-period end is modeled.',
      impact: { kind: 'configured', ...(waitingEnd ? { date: waitingEnd } : {}), detail: 'Informational only; no spending restriction enforced by this engine.' },
      hrQuestion: 'When may I first request time, and is it different from when time accrues?',
      guidePath,
    },
    {
      id: 'negative-balance', title: 'Borrowing future time',
      explanation: 'The modeled bank may fall as low as -' + n(policy.negativeBalanceAllowance)
        + ' ' + policy.unit + '; the projection clips deductions at that limit.',
      example: unlimited ? 'No cash-like bank is projected.'
        : n(confirmed.unfunded) + ' ' + policy.unit + ' of confirmed scheduled time could not be funded in this window.',
      impact: unlimited
        ? { kind: 'not-projected', detail: 'Unlimited PTO does not use a banked borrowing limit.' }
        : { kind: 'observed', amount: confirmed.unfunded, detail: 'Unfunded confirmed units; tentative scenario unfunded: ' + n(tentative.unfunded) + '.' },
      hrQuestion: 'Can my PTO balance go negative, and what happens to an advance when I leave?',
      guidePath,
    },
    {
      id: 'departure-payout', title: 'Unused time when leaving',
      explanation: policy.payoutOnLeaving === 'pays'
        ? 'You entered that your employer pays unused PTO. This is an employer-policy assumption, not a legal conclusion.'
        : policy.payoutOnLeaving === 'doesnt'
          ? 'You entered that your employer does not pay unused PTO. This is an assumption, not a legal conclusion.'
          : 'The employer payout rule is unknown. No payout entitlement is inferred.',
      example: 'This policy explanation does not calculate a departure payout or legal entitlement.',
      impact: { kind: 'not-projected', detail: 'Payout depends on verified rules, leave type, departure date and compensation inputs.' },
      hrQuestion: 'Which leave categories are paid at departure, and where is the written rule?',
      guidePath,
    },
  ];

  return {
    asOf: policy.balanceAsOf,
    through,
    unit: policy.unit,
    currentBalance: unlimited ? null : policy.currentBalance,
    confirmedBalance: confirmed.balance,
    tentativeBalance: tentative.balance,
    confirmedAccrued: confirmed.accrued,
    confirmedScheduled: confirmed.scheduled,
    tentativeAdditionalScheduled: extraTentative,
    confirmedExpired: confirmed.expired,
    confirmedLostAccrual: confirmed.lostAccrual,
    confirmedUnfunded: confirmed.unfunded,
    tentativeUnfunded: tentative.unfunded,
    rules,
    caveats: [
      'These are projections from the policy values you entered, not verified employer rules or legal entitlements.',
      'Only dates after the as-of balance are deducted. Confirm whether that balance already reflects earlier leave.',
      'Scheduled units can exceed funded units when borrowing is limited; use the unfunded field rather than subtracting every requested unit.',
      ...(unlimited ? ['Unlimited PTO has no banked monetary or time balance to forecast.'] : []),
      ...(waitingEnd ? ['Waiting periods are described but not enforced by this projection.'] : []),
    ],
  };
}
