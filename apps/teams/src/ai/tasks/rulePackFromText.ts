import { z } from 'zod';
import { asData, DATA_RULE, defineAiTask } from '../task';
import { INSTRUCTION_LIKE } from './importHandbook';

/*
 * Draft a rule pack from pasted regulation or policy text (COVERAGE-SPEC §7,
 * draftRulePackFromText). The model only proposes: every rule must carry the exact sentence
 * it came from, and verifyRulePackProposal() checks each quote and number against the text.
 * Nothing is saved here; an admin confirms with saveRulePack.
 */
export interface RulePackTextInput {
  text: string;
  vertical: 'childcare' | 'clinic' | 'general';
}

export const RULE_KINDS = [
  'ratio',
  'role_present',
  'min_rest_between_shifts',
  'max_hours_per_day',
  'max_hours_per_week',
  'max_consecutive_days',
  'overtime_flag',
  'sick_accrual',
] as const;
export type DraftRuleKind = (typeof RULE_KINDS)[number];

const n = () => z.number().nullable();

export const draftRuleSchema = z.object({
  kind: z.enum(RULE_KINDS),
  ageGroup: z.string().nullable().describe('ratio only: the age group or service label exactly as the text names it, e.g. "infants" or "18 to 36 months".'),
  childrenPerStaff: n().describe('ratio: children (or bookings) per one staff member. "1:4" or "one teacher for every four infants" → 4.'),
  maxGroupSize: n().describe('ratio: maximum group size when stated.'),
  credential: z.string().nullable().describe('role_present: the certificate or role that must be present, as the text names it.'),
  min: n().describe('role_present: how many such people.'),
  scope: z.enum(['room', 'site']).nullable().describe('role_present: per room/group, or per site/facility.'),
  hours: n().describe('min_rest_between_shifts, max_hours_per_day, max_hours_per_week.'),
  days: n().describe('max_consecutive_days.'),
  dailyHours: n().describe('overtime_flag: hours in a workday after which overtime applies.'),
  weeklyHours: n().describe('overtime_flag: hours in a workweek after which overtime applies.'),
  hoursPerUnit: n().describe('sick_accrual: hours worked per 1 hour earned ("1 hour per 30 worked" → 30).'),
  annualUseCap: n().describe('sick_accrual: hours an employee may use per year, if limited.'),
  balanceCap: n().describe('sick_accrual: maximum balance, if capped.'),
  annualAccrualCap: n().describe('sick_accrual: maximum hours earned per year, if capped.'),
  usableFromDay: n().describe('sick_accrual: the day of employment from which leave can be used ("beginning on the 90th day" → 90).'),
  quote: z.string().nullable().describe('The exact sentence (or table row) from the text that states this rule, copied character for character.'),
});
export type DraftRule = z.infer<typeof draftRuleSchema>;

export const rulePackProposalSchema = z.object({
  name: z.string().nullable().describe('A short name for the pack from the text (regulation title), or null.'),
  rules: z.array(draftRuleSchema).max(60),
  questions: z.array(z.string()).describe('Points an admin must decide: unclear, conditional or contradictory rules, or rules the fields cannot express.'),
});
export type RulePackProposal = z.infer<typeof rulePackProposalSchema>;

/** Every field of a draft rule, null: rules fill only what they state. */
export const blankRule = (kind: DraftRuleKind, quote: string): DraftRule => ({
  kind, ageGroup: null, childrenPerStaff: null, maxGroupSize: null, credential: null, min: null, scope: null, hours: null, days: null,
  dailyHours: null, weeklyHours: null, hoursPerUnit: null, annualUseCap: null, balanceCap: null, annualAccrualCap: null, usableFromDay: null, quote,
});

const WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, eighteen: 18, twenty: 20, 'twenty-four': 24, thirty: 30,
  forty: 40, 'forty-eight': 48, fifty: 50, sixty: 60, eighty: 80, ninety: 90,
};
const ORDINALS: Record<string, number> = { thirtieth: 30, sixtieth: 60, ninetieth: 90, hundred: 100 };
export const NUM = `(\\d+(?:\\.\\d+)?|${Object.keys(WORDS).sort((a, b) => b.length - a.length).join('|')})`;
const num = (s: string) => (/^\d/.test(s) ? Number(s) : WORDS[s]!);

/** Sentences and table rows, so every quote is a whole unit of the source. */
export function units(text: string): string[] {
  return text
    .split(/(?<=[.;!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8);
}

const STAFF = '(?:teachers?|staff(?: members?)?|adults?|caregivers?|carers?|employees?|nurses?|hygienists?|clinicians?|providers?|aides?|persons?|people)';

/** Sick-leave numbers a sentence states, whichever sentence they are in. */
function sickFields(l: string): Partial<DraftRule> {
  const f: Partial<DraftRule> = {};
  const per = l.match(new RegExp(`(?:one|1) hour (?:of [a-z ]*?)?(?:for|per) (?:every|each) ${NUM} hours worked`));
  if (per) f.hoursPerUnit = num(per[1]!);
  const use = l.match(new RegExp(`\\b(?:use|usage)\\b[^.;]*?(?:to|of|at|than|up to) ${NUM} hours`));
  if (use) f.annualUseCap = num(use[1]!);
  const bal = l.match(new RegExp(`balance[^.;]*?(?:cap(?:ped)?|limit(?:ed)?|maximum|exceed)[^.;]*?${NUM} hours|(?:cap(?:ped)?|limit(?:ed)?)[^.;]*?balance[^.;]*?${NUM} hours`));
  if (bal) f.balanceCap = num((bal[1] ?? bal[2])!);
  else if (per) {
    const yearCap = l.match(new RegExp(`(?:up to|maximum of|no more than) (?:a maximum of )?${NUM} hours[^.;]*?(?:in a|per|each|a) (?:calendar )?year`));
    if (yearCap) f.annualAccrualCap = num(yearCap[1]!);
  }
  const from = l.match(/(?:beginning|starting|after|from) (?:on )?the (\d+)(?:st|nd|rd|th)|(?:beginning|starting|after|from) (?:on )?the (thirtieth|sixtieth|ninetieth)/);
  if (from) f.usableFromDay = from[1] ? Number(from[1]) : ORDINALS[from[2]!]!;
  return f;
}

/** A Markdown or pipe table row: "| 6 weeks to 18 months | 1:4 | 8 |". */
function tableRatio(line: string): { group: string; ratio: number; groupSize: number | null } | null {
  if (!line.includes('|')) return null;
  const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
  const at = cells.findIndex((c) => /^1\s*(?::|to)\s*\d+$/.test(c));
  if (at < 1) return null;
  const after = cells.slice(at + 1).find((c) => /^\d+$/.test(c));
  return { group: cells[0]!, ratio: Number(cells[at]!.replace(/^1\s*(?::|to)\s*/, '')), groupSize: after ? Number(after) : null };
}

const GENERIC = /^(children|kids|child|pupils|students|patients|appointments|clients)$/;

/** Deterministic reader for mock mode, CI evals and the no-AI fallback: common regulatory phrasings only. */
function heuristic({ text }: RulePackTextInput): RulePackProposal {
  const rules: DraftRule[] = [];
  const questions: string[] = [];
  let heading: string | null = null;
  let lastRatio: DraftRule | null = null;
  for (const s of units(text)) {
    const h = s.match(/^#{1,4}\s+(.+)$/);
    if (h) {
      heading = h[1]!.trim();
      lastRatio = null;
      continue;
    }
    // An injected instruction is never a rule, so the rules reader doesn't read it.
    if (INSTRUCTION_LIKE.test(s) || s.startsWith('<!--')) continue;
    const l = s.toLowerCase().replace(/[–—]/g, '-');

    // Ratios. Table rows first.
    const t = tableRatio(l);
    if (t) {
      rules.push({ ...blankRule('ratio', s), ageGroup: t.group, childrenPerStaff: t.ratio, maxGroupSize: t.groupSize });
      continue;
    }
    const row = l.match(new RegExp(`^(?:[-*•]\\s*)?([a-z0-9][a-z0-9 ,()'-]*?)\\s*:\\s*(?:a ratio of )?1\\s*(?::|to)\\s*${NUM}(?:[^0-9]*?(?:group(?: size)?|max(?:imum)?)[^0-9]*?${NUM})?`));
    const perStaff = l.match(new RegExp(`(?:one|1) ${STAFF} (?:for|to) (?:every|each) ${NUM} ([a-z][a-z -]*?)(?: in attendance| present| in a |[,.;]|$)`));
    const toEach = l.match(new RegExp(`${NUM} ([a-z][a-z -]*?) (?:to|per) (?:each|every|one|1) ${STAFF}`));
    const ratioOf = l.match(new RegExp(`(?:ratio|ratios) (?:for|of) ([a-z][a-z0-9 -]*?) (?:is|shall be|must be|of) (?:at least )?1\\s*(?::|to)\\s*${NUM}`));
    const noMore = l.match(new RegExp(`(?:a|one|1|each) ${STAFF} (?:shall |may |must )?(?:visually observing and )?(?:supervis\\w*|care for|be responsible for) no more than ${NUM} ([a-z]+)`));
    const group = l.match(new RegExp(`(?:group size|groups?)[^.;]*?(?:not exceed|no more than|maximum of|at most|limited to|of) ${NUM}|(?:does not|shall not|must not) exceed ${NUM} ([a-z]+)|maximum of ${NUM} ([a-z]+)`));
    const groupSize = group ? num((group[1] ?? group[2] ?? group[4])!) : null;
    if (row && !/\bhours?\b/.test(l)) {
      lastRatio = { ...blankRule('ratio', s), ageGroup: row[1]!.trim(), childrenPerStaff: num(row[2]!), maxGroupSize: row[3] ? num(row[3]) : groupSize };
      rules.push(lastRatio);
      continue;
    }
    const r = perStaff ? { g: perStaff[2]!, n: perStaff[1]! } : toEach ? { g: toEach[2]!, n: toEach[1]! } : ratioOf ? { g: ratioOf[1]!, n: ratioOf[2]! } : noMore ? { g: noMore[2]!, n: noMore[1]! } : null;
    if (r) {
      // "six children to each teacher" under "## Toddler programs": the heading names the group.
      const g = r.g.trim().replace(/ in attendance$/, '');
      const ageGroup = GENERIC.test(g) && heading ? heading : g;
      lastRatio = { ...blankRule('ratio', s), ageGroup, childrenPerStaff: num(r.n), maxGroupSize: groupSize && groupSize !== num(r.n) ? groupSize : null };
      rules.push(lastRatio);
      continue;
    }
    // "The group does not exceed 12 toddlers." right after its ratio: one rule, quoted across both sentences.
    if (group && lastRatio && lastRatio.maxGroupSize == null && !/\bhours?\b/.test(l)) {
      lastRatio.maxGroupSize = groupSize;
      lastRatio.quote = `${lastRatio.quote} … ${s}`;
      continue;
    }

    // A required role on site or in each room.
    const role = l.match(new RegExp(`at least ${NUM} (?:${STAFF} )?(?:with|holding|who holds?|who has) (?:a |an )?(?:current |valid )?([a-z][a-z /&-]*?)(?: certificat\\w*| certification| card| license| licence)? (?:shall|must|will) be (?:present|on (?:site|the premises|duty))`));
    if (role) {
      const scope = /\b(each|every) (room|group|classroom|unit|operatory)\b/.test(l) ? 'room' : 'site';
      rules.push({ ...blankRule('role_present', s), credential: role[2]!.trim(), min: num(role[1]!), scope });
      continue;
    }

    // Paid sick leave: every sentence about it may carry a number (rate, use cap, balance cap, first usable day).
    if (/\bsick\b/.test(l) || (/accru/.test(l) && rules.some((x) => x.kind === 'sick_accrual'))) {
      const f = sickFields(l);
      if (Object.keys(f).length) {
        rules.push({ ...blankRule('sick_accrual', s), ...f });
        continue;
      }
    }

    // Overtime (a cost flag, not a limit).
    if (/overtime|in excess of|time and a half|time and one-half|one and one-half/.test(l)) {
      const d = l.match(new RegExp(`${NUM} hours (?:in|per) (?:(?:one|any|a|each) )*(?:work)?day`));
      const w = l.match(new RegExp(`${NUM} hours (?:in|per) (?:(?:one|any|a|each) )*(?:work)?week|workweek (?:longer than|of more than|over) ${NUM} hours`));
      if (d || w) {
        rules.push({ ...blankRule('overtime_flag', s), dailyHours: d ? num(d[1]!) : null, weeklyHours: w ? num((w[1] ?? w[2])!) : null });
        continue;
      }
    }

    // Working-time limits.
    const rest = l.match(new RegExp(`(?:at least|minimum of|no less than|not less than) ${NUM} (?:consecutive )?hours? (?:of rest |off |rest )?(?:between|after)`));
    if (rest) {
      rules.push({ ...blankRule('min_rest_between_shifts', s), hours: num(rest[1]!) });
      continue;
    }
    const consec = l.match(new RegExp(`(?:more than|over|exceed) ${NUM} consecutive (?:work(?:ing)? )?days`));
    if (consec) {
      rules.push({ ...blankRule('max_consecutive_days', s), days: num(consec[1]!) });
      continue;
    }
    const day = l.match(new RegExp(`(?:more than|exceed|over|maximum of|no more than|not more than|up to) ${NUM} hours (?:in|per|a) (?:one |any |a |each )?(?:work(?:ing)? ?)?(?:day|shift)`));
    if (day) {
      rules.push({ ...blankRule('max_hours_per_day', s), hours: num(day[1]!) });
      continue;
    }
    const week = l.match(new RegExp(`(?:more than|exceed|over|maximum of|no more than|not more than|up to) ${NUM} hours (?:in|per|a) (?:one |any |a |each )?(?:work)?week`));
    if (week) {
      rules.push({ ...blankRule('max_hours_per_week', s), hours: num(week[1]!) });
      continue;
    }
  }
  if (rules.length === 0) questions.push('No staffing ratio, required role, rest, hours or sick-leave rule was found in this text.');
  return { name: null, rules, questions };
}

export const rulePackFromTextTask = defineAiTask<RulePackTextInput, RulePackProposal>({
  name: 'rulePackFromText',
  promptVersion: 'r2',
  cache: true,
  system:
    'You read regulation or workplace-policy text and extract staffing rules into the given fields. ' +
    'Rule kinds: "ratio" (children or bookings per staff member, optional maximum group size, per age ' +
    'group or service), "role_present" (at least N people holding a credential must be present in each ' +
    'room or on site), "min_rest_between_shifts", "max_hours_per_day", "max_hours_per_week", ' +
    '"max_consecutive_days", "overtime_flag" (hours after which overtime pay applies), "sick_accrual" ' +
    '(1 hour of paid sick leave per N hours worked, with any use cap, balance cap, yearly accrual cap ' +
    'and the day it becomes usable). For every rule, copy the exact sentence or table row that states ' +
    'it into quote, character for character, and fill only the fields that sentence states; leave the ' +
    'rest null. When a rule\'s numbers are in more than one sentence (a ratio, then its group size), ' +
    'quote each of those sentences joined with " … ". One rule per age group or service. Never use general knowledge, other laws or what is ' +
    'typical: if the text does not state a number, do not output a rule for it. Convert number words ' +
    'to digits. Put conditional rules, exceptions, and anything the fields cannot express in questions. ' +
    DATA_RULE,
  render: ({ text, vertical }) => `Industry: ${vertical}.\n${asData('untrusted_regulation', text)}`,
  output: rulePackProposalSchema,
  heuristic,
});
