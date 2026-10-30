import { policySchema, type PolicyInput } from '@/domain/policySchema';
import { HANDBOOK_FIELDS, type HandbookField, type HandbookProposal } from './tasks/importHandbook';

export type FieldStatus = 'verified' | 'not_stated' | 'rejected';
export interface VerifiedField {
  value: string | number | null;
  quote: string | null;
  status: FieldStatus;
  reason: string | null;
}

export interface VerifiedHandbook {
  fields: Record<HandbookField, VerifiedField>;
  /** A policy built only from verified values plus the listed assumptions; null if too little was stated. */
  policy: PolicyInput | null;
  citations: Record<string, string>;
  assumptions: string[];
  questions: string[];
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const NUMBER_WORDS: Record<number, string[]> = {
  1: ['one'], 2: ['two'], 3: ['three'], 4: ['four'], 5: ['five'], 6: ['six'], 7: ['seven'], 8: ['eight'], 9: ['nine'],
  10: ['ten'], 12: ['twelve'], 15: ['fifteen'], 20: ['twenty'], 25: ['twenty-five', 'twenty five'], 30: ['thirty'],
};

function mentionsNumber(quote: string, n: number): boolean {
  const q = norm(quote);
  if (new RegExp(`(^|[^\\d.])${String(n).replace('.', '\\.')}([^\\d]|$)`).test(q)) return true;
  return (NUMBER_WORDS[n] ?? []).some((w) => q.includes(w));
}

/** Text that reads like an instruction to a model rather than policy (R5 defence in depth). */
const INSTRUCTION_LIKE = /\b(ignore (all |any |the )?(previous|prior|above)|disregard|system prompt|you are an? |as an ai|assistant:|system:|override|instructions?)\b/i;

/** Sanity bounds: values outside them are not saved without a human typing them in. */
const BOUNDS: Partial<Record<HandbookField, (v: number, unit: string) => boolean>> = {
  annualAllowance: (v, unit) => v > 0 && v <= (unit === 'hours' ? 480 : 60),
  carryoverMax: (v, unit) => v >= 0 && v <= (unit === 'hours' ? 480 : 60),
  accrualCap: (v, unit) => v > 0 && v <= (unit === 'hours' ? 960 : 120),
  waitingPeriodDays: (v) => v >= 0 && v <= 365,
  hoursWorkedPerHourAccrued: (v) => v >= 10 && v <= 200,
};
/** Fields whose number must literally appear in the quote (others are derived, e.g. months → days). */
const LITERAL_NUMBER: HandbookField[] = ['annualAllowance', 'carryoverMax', 'accrualCap'];

const LABELS: Record<HandbookField, string> = {
  unit: 'Unit', accrualMethod: 'How it is earned', annualAllowance: 'Yearly allowance', payPeriod: 'Pay period',
  hoursWorkedPerHourAccrued: 'Hours worked per hour earned', planYear: 'Leave year', planYearStart: 'Leave year starts',
  carryover: 'Carry-over', carryoverMax: 'Carry-over limit', carryoverUseBy: 'Carried leave must be used by',
  accrualCap: 'Balance cap', waitingPeriodDays: 'Waiting period (days)',
};
export const handbookFieldLabel = (f: HandbookField) => LABELS[f];

/**
 * Every value the model proposes must quote the handbook verbatim, mention its number, and sit
 * inside sane bounds. Anything else is dropped and turned into a question for the admin.
 */
export function verifyHandbookProposal(handbookText: string, p: HandbookProposal): VerifiedHandbook {
  const doc = norm(handbookText);
  const questions = [...p.questions];
  const unit = p.unit.value ?? 'days';
  const fields = {} as Record<HandbookField, VerifiedField>;

  for (const f of HANDBOOK_FIELDS) {
    const { value, quote } = p[f];
    if (value == null) {
      fields[f] = { value: null, quote: null, status: 'not_stated', reason: null };
      continue;
    }
    let reason: string | null = null;
    if (!quote || norm(quote).length < 8 || !doc.includes(norm(quote))) reason = 'The quoted sentence is not in the handbook.';
    else if (INSTRUCTION_LIKE.test(quote)) reason = 'The quote reads like an instruction, not a policy.';
    else if (typeof value === 'number') {
      if (LITERAL_NUMBER.includes(f) && !mentionsNumber(quote, value)) reason = `The quote does not mention ${value}.`;
      else if (BOUNDS[f] && !BOUNDS[f]!(value, unit)) reason = `${value} is outside the usual range; enter it by hand if it is right.`;
    }
    fields[f] = reason ? { value, quote, status: 'rejected', reason } : { value, quote, status: 'verified', reason: null };
    if (reason) questions.push(`${LABELS[f]}: please confirm. ${reason}`);
  }

  const v = <T,>(f: HandbookField) => (fields[f].status === 'verified' ? (fields[f].value as T) : null);
  const assumptions: string[] = [];
  const citations: Record<string, string> = {};
  for (const f of HANDBOOK_FIELDS) if (fields[f].status === 'verified') citations[f] = fields[f].quote!;

  const method = v<'front_loaded' | 'per_pay_period' | 'per_hour_worked' | 'unlimited'>('accrualMethod');
  const md = (s: string | null) => (s ? { month: Number(s.slice(0, 2)), day: Number(s.slice(3, 5)) } : undefined);
  let policy: PolicyInput | null = null;
  const allowance = v<number>('annualAllowance');
  const payPeriod = v<'weekly' | 'biweekly' | 'semimonthly' | 'monthly'>('payPeriod');
  const perHour = v<number>('hoursWorkedPerHourAccrued');

  let accrual: PolicyInput['accrual'] | null = null;
  if (method === 'unlimited') accrual = { method: 'unlimited' };
  else if (method === 'front_loaded' && allowance != null) accrual = { method, annualAllowance: allowance };
  else if (method === 'per_pay_period' && allowance != null) {
    if (!payPeriod) assumptions.push('Pay period not stated: assumed monthly.');
    accrual = { method, annualAllowance: allowance, payPeriod: payPeriod ?? 'monthly' };
  } else if (method === 'per_hour_worked' && perHour != null) {
    if (!payPeriod) assumptions.push('Pay period not stated: assumed biweekly.');
    accrual = { method, ratePerHour: Math.round((1 / perHour) * 1e6) / 1e6, payPeriod: payPeriod ?? 'biweekly' };
  }

  if (accrual) {
    const py = v<'calendar' | 'anniversary' | 'custom'>('planYear');
    if (!py) assumptions.push('Leave year not stated: assumed the calendar year.');
    const start = md(v<string>('planYearStart'));
    const planYear: PolicyInput['planYear'] =
      py === 'anniversary' ? { type: 'anniversary' } : py === 'custom' && start ? { type: 'custom', ...start } : { type: 'calendar' };
    const carry = v<'none' | 'all' | 'upTo'>('carryover');
    const useBy = md(v<string>('carryoverUseBy'));
    if (!carry && method !== 'unlimited') assumptions.push('Carry-over not stated: assumed none (nothing carries) until you decide.');
    const carryMax = v<number>('carryoverMax');
    const carryover: PolicyInput['carryover'] =
      carry === 'all' ? { type: 'all', useBy } : carry === 'upTo' && carryMax != null ? { type: 'upTo', max: carryMax, useBy } : { type: 'none' };
    if (carry === 'upTo' && carryMax == null) assumptions.push('Carry-over limit not stated: assumed none until you decide.');
    const wait = v<number>('waitingPeriodDays');
    const candidate = {
      unit: v<'days' | 'hours'>('unit') ?? (method === 'per_hour_worked' ? 'hours' : 'days'),
      accrual,
      planYear,
      accrualCap: v<number>('accrualCap'),
      carryover,
      waitingPeriod: wait ? { days: wait, mode: 'locked' as const } : null,
      negativeAllowance: 0,
    };
    if (wait) assumptions.push('Waiting period: leave accrues but cannot be booked until it ends (change to "no accrual" if the handbook means that).');
    const parsed = policySchema.safeParse(candidate);
    if (parsed.success) policy = parsed.data;
    else questions.push(`The stated values do not form a valid policy: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
  }
  return { fields, policy, citations, assumptions, questions: [...new Set(questions)] };
}
