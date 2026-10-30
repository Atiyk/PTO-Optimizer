import type { TimeOffPolicy } from './model';

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
    sentences.push(`You earn ${roundDisplay(policy.accrual.rate)} ${u(policy.accrual.rate)} for every hour worked.`);
  } else {
    sentences.push(`Your PTO is unlimited — there's no fixed number of days, and no balance to track.`);
  }

  if (policy.accrualCap !== undefined && policy.accrual.kind !== 'unlimited') {
    sentences.push(
      `Your balance can't go above ${roundDisplay(policy.accrualCap)} ${u(policy.accrualCap)}; once it's there, you stop earning until you take some.`,
    );
  }

  if (policy.waitingPeriodDays) {
    sentences.push(`You can't use any of it until ${policy.waitingPeriodDays} days after you start.`);
  }

  if (policy.carryover.mode === 'none' && policy.accrual.kind !== 'unlimited') {
    sentences.push(`Nothing carries over — anything left at reset is lost.`);
  } else if (policy.carryover.mode === 'all') {
    sentences.push(`Everything carries over — your balance never resets to zero.`);
  } else if (policy.carryover.mode === 'capped') {
    const cap = policy.carryover.cap ?? 0;
    sentences.push(`On reset, you can bring up to ${roundDisplay(cap)} ${u(cap)} into the new year. Anything above that is lost.`);
    if (policy.carryover.useByDate) {
      sentences.push(`Carried-over days must be used by ${policy.carryover.useByDate}, or they're lost too.`);
    }
  }

  if (policy.negativeBalanceAllowance > 0) {
    sentences.push(`You can borrow up to ${roundDisplay(policy.negativeBalanceAllowance)} ${u(policy.negativeBalanceAllowance)} against days you haven't earned yet.`);
  }

  return sentences;
}
