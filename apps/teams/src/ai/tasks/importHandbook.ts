import { z } from 'zod';
import { asData, DATA_RULE, defineAiTask } from '../task';

/**
 * 3B: read a leave handbook and propose the vacation policy, every value with a verbatim quote.
 * The model only proposes; verifyHandbookProposal() checks each quote against the document and
 * an admin confirms before anything is saved (R2).
 */
export interface HandbookInput {
  text: string;
}

const cited = <T extends z.ZodType>(value: T) =>
  z.object({
    value: value.nullable().describe('null when the handbook does not say.'),
    quote: z.string().nullable().describe('The exact sentence from the handbook that states it, copied verbatim; null when not stated.'),
  });

const monthDay = z.string().regex(/^\d{2}-\d{2}$/).describe('MM-DD');

export const handbookProposalSchema = z.object({
  unit: cited(z.enum(['days', 'hours'])),
  accrualMethod: cited(z.enum(['front_loaded', 'per_pay_period', 'per_hour_worked', 'unlimited'])),
  annualAllowance: cited(z.number()).describe('Days or hours per year (not for per_hour_worked).'),
  payPeriod: cited(z.enum(['weekly', 'biweekly', 'semimonthly', 'monthly'])),
  hoursWorkedPerHourAccrued: cited(z.number()).describe('For per_hour_worked: "1 hour per 30 worked" → 30.'),
  planYear: cited(z.enum(['calendar', 'anniversary', 'custom'])),
  planYearStart: cited(monthDay).describe('Only for a custom plan year, e.g. April 1 → "04-01".'),
  carryover: cited(z.enum(['none', 'all', 'upTo'])),
  carryoverMax: cited(z.number()),
  carryoverUseBy: cited(monthDay).describe('Date carried leave must be used by, e.g. March 31 → "03-31".'),
  accrualCap: cited(z.number()).describe('Maximum balance, if any.'),
  waitingPeriodDays: cited(z.number()).describe('Days after the start date before leave can be taken or accrues.'),
  questions: z.array(z.string()).describe('Things an admin must decide because the handbook is silent or unclear.'),
});
export type HandbookProposal = z.infer<typeof handbookProposalSchema>;
export type HandbookField = Exclude<keyof HandbookProposal, 'questions'>;
export const HANDBOOK_FIELDS = Object.keys(handbookProposalSchema.shape).filter((k) => k !== 'questions') as HandbookField[];

const WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  fifteen: 15, twenty: 20, 'twenty-five': 25, thirty: 30, forty: 40, sixty: 60, ninety: 90,
};
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const NUM = `(\\d+(?:\\.\\d+)?|${Object.keys(WORDS).sort((a, b) => b.length - a.length).join('|')})(?: \\(\\d+\\))?`;
const num = (s: string) => (/^\d/.test(s) ? Number(s) : WORDS[s]!);

/** Splits into sentences so quotes are whole, verbatim sentences. */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function find(text: string, re: RegExp): { m: RegExpMatchArray; quote: string } | null {
  for (const s of sentences(text)) {
    const m = s.toLowerCase().match(re);
    if (m) return { m, quote: s };
  }
  return null;
}

const none = { value: null, quote: null };

/** Deterministic reader for mock mode and CI evals: common handbook phrasings only. */
function heuristic({ text }: HandbookInput): HandbookProposal {
  const p: HandbookProposal = {
    unit: none, accrualMethod: none, annualAllowance: none, payPeriod: none, hoursWorkedPerHourAccrued: none,
    planYear: none, planYearStart: none, carryover: none, carryoverMax: none, carryoverUseBy: none,
    accrualCap: none, waitingPeriodDays: none, questions: [],
  };
  const LEAVE = '(?:vacation|annual leave|holiday entitlement|paid time off|pto|holiday)';

  const unl = find(text, new RegExp(`\\b(unlimited|no set limit|no fixed (?:number|limit))\\b.*${LEAVE}|${LEAVE}.*\\b(unlimited|no set limit)\\b`));
  if (unl) p.accrualMethod = { value: 'unlimited', quote: unl.quote };

  const perHour = find(text, new RegExp(`${NUM} hours? (?:of \\w+ )?(?:(?:for|per|every|each) )+${NUM} hours? worked`));
  if (perHour && !unl) {
    p.accrualMethod = { value: 'per_hour_worked', quote: perHour.quote };
    p.unit = { value: 'hours', quote: perHour.quote };
    p.hoursWorkedPerHourAccrued = { value: num(perHour.m[2]!) / num(perHour.m[1]!), quote: perHour.quote };
  }

  const allowance = find(text, new RegExp(`${NUM} (working |work |business )?(days|hours)(?: of)? (?:paid )?${LEAVE}|${LEAVE}[^.]*?\\b(?:of|is|to) ${NUM} (working |work |business )?(days|hours)`));
  if (allowance && !unl && !perHour) {
    const n = allowance.m[1] ?? allowance.m[4];
    const unit = (allowance.m[3] ?? allowance.m[6])!;
    p.annualAllowance = { value: num(n!), quote: allowance.quote };
    p.unit = { value: unit === 'hours' ? 'hours' : 'days', quote: allowance.quote };
    const pp = find(text, /\b(each|every|per) (pay period|paycheck|payroll period|month)\b|\baccrues?\b|\baccrued\b/);
    p.accrualMethod = pp ? { value: 'per_pay_period', quote: pp.quote } : { value: 'front_loaded', quote: allowance.quote };
  }

  const period = find(text, /\b(bi-?weekly|semi-?monthly|monthly|weekly|every two weeks|twice a month|each month)\b/);
  if (period && (p.accrualMethod.value === 'per_pay_period' || p.accrualMethod.value === 'per_hour_worked')) {
    const w = period.m[1]!;
    const value = /bi-?weekly|two weeks/.test(w) ? 'biweekly' : /semi|twice/.test(w) ? 'semimonthly' : /month/.test(w) ? 'monthly' : 'weekly';
    p.payPeriod = { value, quote: period.quote };
  }

  const anniv = find(text, /\b(anniversary|start date anniversary|date of hire)\b/);
  const cal = find(text, /\b(calendar year|january 1|1 january|jan(?:uary)? 1st)\b/);
  const custom = find(text, new RegExp(`(?:leave|holiday|plan) year (?:runs|starts|begins|is)[^.]*?(${MONTHS.join('|')}) (\\d{1,2})|(?:leave|holiday|plan) year (?:runs|starts|begins|is)[^.]*?(\\d{1,2})(?:st|nd|rd|th)? (${MONTHS.join('|')})`));
  if (custom) {
    const month = MONTHS.indexOf((custom.m[1] ?? custom.m[4])!) + 1;
    const day = Number(custom.m[2] ?? custom.m[3]);
    if (month === 1 && day === 1) p.planYear = { value: 'calendar', quote: custom.quote };
    else {
      p.planYear = { value: 'custom', quote: custom.quote };
      p.planYearStart = { value: `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, quote: custom.quote };
    }
  } else if (anniv && /year/.test(anniv.quote.toLowerCase())) p.planYear = { value: 'anniversary', quote: anniv.quote };
  else if (cal) p.planYear = { value: 'calendar', quote: cal.quote };

  const noCarry = find(text, /\b(cannot|can ?not|may not|will not|won't|does not|do not) (be )?(carr(y|ied)|roll(ed)? over)|\buse it or lose it\b|\bno carry ?over\b|\bforfeited at the end\b/);
  const carryUpTo = find(text, new RegExp(`(?:carry|carried|roll(?:ed)?) (?:over )?(?:up to |a maximum of |no more than |at most )${NUM}|(?:up to |maximum of |no more than )${NUM} (?:unused )?(?:days|hours)[^.]*(?:carr|roll)`));
  const carryAll = find(text, /\b(all )?unused [^.]*(carr(y|ies|ied) over|roll(s|ed)? over)\b/);
  if (carryUpTo) {
    p.carryover = { value: 'upTo', quote: carryUpTo.quote };
    p.carryoverMax = { value: num((carryUpTo.m[1] ?? carryUpTo.m[2])!), quote: carryUpTo.quote };
  } else if (noCarry) p.carryover = { value: 'none', quote: noCarry.quote };
  else if (carryAll) p.carryover = { value: 'all', quote: carryAll.quote };

  const useBy = find(text, new RegExp(`(?:used|taken) (?:by|before) (?:the end of )?(${MONTHS.join('|')}) (\\d{1,2})|(?:used|taken) (?:by|before) (?:the )?(\\d{1,2})(?:st|nd|rd|th)? (?:of )?(${MONTHS.join('|')})|(?:used|taken) by the end of (${MONTHS.join('|')})`));
  if (useBy && p.carryover.value && p.carryover.value !== 'none') {
    const mName = (useBy.m[1] ?? useBy.m[4] ?? useBy.m[5])!;
    const month = MONTHS.indexOf(mName) + 1;
    const day = useBy.m[2] ?? useBy.m[3] ?? String(new Date(Date.UTC(2025, month, 0)).getUTCDate());
    p.carryoverUseBy = { value: `${String(month).padStart(2, '0')}-${String(Number(day)).padStart(2, '0')}`, quote: useBy.quote };
  }

  const cap = find(text, new RegExp(`(?:balance|accrual)[^.]*(?:cap(?:ped)?|maximum|max|exceed|stop)[^.]*?${NUM} (?:days|hours)|(?:cap|maximum)[^.]*?${NUM} (?:days|hours)[^.]*(?:balance|accru)`));
  if (cap) p.accrualCap = { value: num((cap.m[1] ?? cap.m[2])!), quote: cap.quote };

  const wait = find(text, new RegExp(`(?:first|after|completing|until)[^.]*?${NUM} (days|months|weeks) (?:of (?:continuous )?(?:employment|service)|probation)|probation(?:ary)? period of ${NUM} (days|months|weeks)`));
  if (wait) {
    const n = num((wait.m[1] ?? wait.m[3])!);
    const u = (wait.m[2] ?? wait.m[4])!;
    p.waitingPeriodDays = { value: u === 'months' ? n * 30 : u === 'weeks' ? n * 7 : n, quote: wait.quote };
  }

  if (!p.accrualMethod.value) p.questions.push('How much vacation does each person get per year?');
  if (!p.planYear.value) p.questions.push('When does the leave year start: January 1, each person’s start-date anniversary, or another date?');
  if (!p.carryover.value && p.accrualMethod.value !== 'unlimited') p.questions.push('Can unused vacation be carried into the next year, and how much?');
  return p;
}

export const importHandbookTask = defineAiTask<HandbookInput, HandbookProposal>({
  name: 'importHandbook',
  promptVersion: 'h1',
  cache: true,
  system:
    'You read an employee handbook and extract the VACATION / annual leave policy into the given ' +
    'fields. For every value, copy the exact sentence that states it into quote, character for ' +
    'character. If the handbook does not state a field, set value and quote to null. Never infer a ' +
    'value from general knowledge, the law, or what is typical. Convert number words to numbers. ' +
    'Months of waiting time are 30 days each. Put anything an admin must decide (silent or ' +
    'contradictory points) in questions. ' +
    DATA_RULE,
  render: ({ text }) => asData('untrusted_handbook', text),
  output: handbookProposalSchema,
  heuristic,
});
