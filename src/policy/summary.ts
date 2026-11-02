import { validateCurrentCarriedBalance, type TimeOffPolicy } from './model';

const PAY_PERIOD_WORD: Record<'weekly' | 'biweekly' | 'semi-monthly' | 'monthly', string> = {
  weekly: 'every week',
  biweekly: 'every two weeks',
  'semi-monthly': 'twice a month',
  monthly: 'every month',
};

function unitWord(policy: TimeOffPolicy, n: number): string {
  const word = policy.unit === 'hours' ? 'hour' : 'day';
  return n === 1 ? word : `${word}s`;
}

function roundDisplay(n: number): string {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? `${r}` : r.toFixed(2);
}

/**
 * Stage 4B.1: "Your policy, in plain English" — 3-6 generated sentences, built from the
 * policy's own fields (never a template with blanks the user has to decode). Order follows
 * the spec's own worked example: how you earn it, limits, then what happens at reset.
 */
export function generatePolicySummary(policy: TimeOffPolicy): string[] {
  const sentences: string[] = [];
  const u = (n: number) => unitWord(policy, n);

  if (policy.accrual.kind === 'front-loaded') {
    sentences.push(`You get ${roundDisplay(policy.accrual.amount)} ${u(policy.accrual.amount)} all at once, on ${policy.accrual.grantDate}.`);
  } else if (policy.accrual.kind === 'per-pay-period') {
    const freqWord = PAY_PERIOD_WORD[policy.accrual.frequency];
    sentences.push(`You earn about ${roundDisplay(policy.accrual.amount)} ${u(policy.accrual.amount)} ${freqWord}.`);
  } else if (policy.accrual.kind === 'per-hour-worked') {
    // The per-hour rate is hours earned per hour worked even when the projected
    // balance is displayed in days; projection.ts converts using hoursPerDay.
    const hourWord = policy.accrual.rate === 1 ? 'hour' : 'hours';
    sentences.push(`You earn about ${roundDisplay(policy.accrual.rate)} ${hourWord} of PTO for every hour worked.`);
  } else {
    sentences.push(`Your PTO is unlimited — there's no fixed number of days, and no balance to track.`);
  }

  if (policy.accrualCap !== undefined && policy.accrual.kind !== 'unlimited') {
    sentences.push(
      `At a balance of ${roundDisplay(policy.accrualCap)} ${u(policy.accrualCap)}, new PTO accrual pauses until your balance drops below the cap.`,
    );
  }

  if (policy.waitingPeriodDays) {
    sentences.push(`You can't use any of it until ${policy.waitingPeriodDays} days after you start.`);
  }

  if (policy.carryover.mode === 'none' && policy.accrual.kind !== 'unlimited') {
    sentences.push(`Nothing carries over — anything left at reset is lost.`);
  } else if (policy.carryover.mode === 'all' && policy.accrual.kind !== 'unlimited') {
    sentences.push('Everything carries over at your annual reset.');
  } else if (policy.carryover.mode === 'capped' && policy.accrual.kind !== 'unlimited') {
    const cap = policy.carryover.cap ?? 0;
    sentences.push(`On reset, you can bring up to ${roundDisplay(cap)} ${u(cap)} into the new year. Anything above that is lost.`);
  }

  if (policy.accrual.kind !== 'unlimited' && !validateCurrentCarriedBalance(policy)) {
    const carried = policy.currentCarriedBalance ?? 0;
    if (carried > 0) {
      sentences.push(`Your current balance includes ${roundDisplay(carried)} ${u(carried)} of carried PTO.`);
    }
    if (policy.carryover.useByDate && (policy.carryover.mode !== 'none' || (policy.currentCarriedBalance ?? 0) > 0)) {
      sentences.push(`Carried-over PTO must be used by ${policy.carryover.useByDate}, or the remaining carried portion expires.`);
    }
  }

  if (policy.negativeBalanceAllowance > 0 && policy.accrual.kind !== 'unlimited') {
    sentences.push(`You can borrow up to ${roundDisplay(policy.negativeBalanceAllowance)} ${u(policy.negativeBalanceAllowance)} against days you haven't earned yet.`);
  }

  return sentences;
}
