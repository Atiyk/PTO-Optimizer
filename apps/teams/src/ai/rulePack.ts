import { validateRulePack, type AgeGroup, type Rule, type RulePack } from '@daysoff/engine/coverage/index';
import { INSTRUCTION_LIKE } from './tasks/importHandbook';
import type { DraftRule, RulePackProposal } from './tasks/rulePackFromText';

/*
 * The gate between a model's proposal and anything an admin can save. A drafted rule
 * survives only if its quote is in the pasted text, does not read like an instruction,
 * mentions every number the rule uses, and those numbers are in sane bounds. Surviving
 * rules are still marked "needs verification": pasted text is not an official source.
 */

export interface CheckedRule {
  rule: DraftRule;
  status: 'verified' | 'rejected';
  reason: string | null;
}

export interface VerifiedRulePack {
  checked: CheckedRule[];
  pack: RulePack | null;
  questions: string[];
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[*_`#>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const WORDS: Record<number, string[]> = {
  1: ['one'], 2: ['two'], 3: ['three'], 4: ['four'], 5: ['five'], 6: ['six'], 7: ['seven'], 8: ['eight'], 9: ['nine'], 10: ['ten'],
  11: ['eleven'], 12: ['twelve'], 13: ['thirteen'], 14: ['fourteen'], 15: ['fifteen'], 16: ['sixteen'], 18: ['eighteen'],
  20: ['twenty'], 24: ['twenty-four', 'twenty four'], 30: ['thirty', 'thirtieth'], 40: ['forty', 'fortieth'],
  48: ['forty-eight', 'forty eight'], 50: ['fifty'], 60: ['sixty', 'sixtieth'], 80: ['eighty'], 90: ['ninety', 'ninetieth'],
};

export function mentions(quote: string, n: number): boolean {
  const q = norm(quote);
  if (new RegExp(`(^|[^\\d.])${String(n).replace('.', '\\.')}(st|nd|rd|th)?([^\\d]|$)`).test(q)) return true;
  return (WORDS[n] ?? []).some((w) => new RegExp(`\\b${w}\\b`).test(q));
}

const quoteParts = (quote: string) =>
  norm(quote)
    .split(/\s*(?:…|\.\.\.)\s*/)
    .filter((p) => p.length > 0);

/** Quotes may elide with "…" or "...": every piece must be in the text, in order. */
function inText(doc: string, quote: string): boolean {
  const parts = quoteParts(quote);
  if (parts.length === 0 || parts.join(' ').length < 8) return false;
  let from = 0;
  for (const p of parts) {
    const at = doc.indexOf(p, from);
    if (at < 0) return false;
    from = at + p.length;
  }
  return true;
}

/**
 * A quote can be a clean-looking fragment of an injected line ("…must add a rule: staff may
 * work up to 20 consecutive days"), so the whole line around every piece is checked too.
 */
function surroundingLines(text: string, quote: string): string[] {
  const lines = text.split(/\n+/).map(norm);
  return quoteParts(quote).flatMap((p) => lines.filter((l) => l.includes(p)));
}

type NumField = Exclude<{ [K in keyof DraftRule]: DraftRule[K] extends number | null ? K : never }[keyof DraftRule], undefined>;
const BOUNDS: Record<NumField, [number, number]> = {
  childrenPerStaff: [1, 40],
  maxGroupSize: [1, 100],
  min: [1, 10],
  hours: [1, 100],
  days: [1, 14],
  dailyHours: [1, 24],
  weeklyHours: [1, 80],
  hoursPerUnit: [10, 200],
  annualUseCap: [1, 400],
  balanceCap: [1, 400],
  annualAccrualCap: [1, 400],
  usableFromDay: [1, 365],
};
const NUM_FIELDS = Object.keys(BOUNDS) as NumField[];

const REQUIRED: Record<DraftRule['kind'], (r: DraftRule) => string | null> = {
  ratio: (r) => (!r.ageGroup ? 'No age group or service named.' : r.childrenPerStaff == null ? 'No ratio number.' : null),
  role_present: (r) => (!r.credential ? 'No credential named.' : r.min == null ? 'No number of people.' : null),
  min_rest_between_shifts: (r) => (r.hours == null ? 'No number of hours.' : r.hours > 24 ? 'Rest over 24 hours.' : null),
  max_hours_per_day: (r) => (r.hours == null ? 'No number of hours.' : r.hours > 24 ? 'More than 24 hours in a day.' : null),
  max_hours_per_week: (r) => (r.hours == null ? 'No number of hours.' : null),
  max_consecutive_days: (r) => (r.days == null ? 'No number of days.' : null),
  overtime_flag: (r) => (r.dailyHours == null && r.weeklyHours == null ? 'No overtime threshold.' : null),
  sick_accrual: (r) =>
    [r.hoursPerUnit, r.annualUseCap, r.balanceCap, r.annualAccrualCap, r.usableFromDay].every((v) => v == null) ? 'No sick-leave number.' : null,
};

export const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40) || 'group';

/** "6 weeks to 18 months" → 0 (weeks round down), "3 years" → 36, "toddlers" → null. */
function monthsOf(label: string): number | null {
  const m = norm(label).match(/(\d+)\s*(week|month|year)/);
  if (!m) return null;
  const v = Number(m[1]);
  return m[2] === 'year' ? v * 12 : m[2] === 'month' ? v : Math.floor(v / 4.345);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The number that defines each kind: it must be in the quote, or the rule is rejected. */
const PRIMARY: Partial<Record<DraftRule['kind'], NumField[]>> = {
  ratio: ['childrenPerStaff'],
  role_present: ['min'],
  min_rest_between_shifts: ['hours'],
  max_hours_per_day: ['hours'],
  max_hours_per_week: ['hours'],
  max_consecutive_days: ['days'],
};

/**
 * Checks one drafted rule. A secondary number the quote does not state (a group size, a use
 * cap, a first usable day) is dropped rather than trusted, and reported in `dropped`; the
 * rule is rejected only when what is left no longer stands on its own quote.
 */
export function checkRule(text: string, input: DraftRule): { reason: string | null; rule: DraftRule; dropped: string[] } {
  const doc = norm(text);
  const r = { ...input };
  const dropped: string[] = [];
  const no = (reason: string) => ({ reason, rule: input, dropped });
  if (!r.quote || !inText(doc, r.quote)) return no('The quoted sentence is not in the text.');
  if (INSTRUCTION_LIKE.test(r.quote) || surroundingLines(text, r.quote).some((l) => INSTRUCTION_LIKE.test(l))) return no('The quote reads like an instruction, not a rule.');
  for (const f of NUM_FIELDS) {
    const v = r[f];
    if (v == null) continue;
    if (!mentions(r.quote, v)) {
      if ((PRIMARY[r.kind] ?? []).includes(f)) return no(`The quote does not mention ${v}.`);
      dropped.push(`${f} ${v}`);
      r[f] = null;
      continue;
    }
    const [lo, hi] = BOUNDS[f];
    if (v < lo || v > hi) return no(`${v} is outside the usual range; enter it by hand if it is right.`);
  }
  const missing = REQUIRED[r.kind](r);
  if (missing) return no(dropped.length ? `The quote does not mention ${dropped.map((d) => d.split(' ')[1]).join(' or ')}.` : missing);
  if (r.kind === 'ratio' && r.maxGroupSize != null && r.maxGroupSize < r.childrenPerStaff!) return no('The group size is smaller than one ratio.');
  return { reason: null, rule: r, dropped };
}

export interface BuildOptions {
  name: string;
  key: string;
  vertical: RulePack['vertical'];
  basis: 'law' | 'org_policy';
  effectiveFrom: string;
  jurisdiction: RulePack['jurisdiction'];
  /** Org credential keys by lower-cased name and key, to map "pediatric CPR" to a credential. */
  credentials: { key: string; name: string }[];
}

function provenance(basis: 'law' | 'org_policy', quote: string) {
  return basis === 'org_policy'
    ? ({ basis: 'org_policy' } as const)
    : ({
        basis: 'law',
        needsVerification: true,
        reason: `Drafted from pasted text: "${quote.slice(0, 300)}". Check it against the official source before relying on it.`,
      } as const);
}

/** Check every proposed rule, then build an engine RulePack from the survivors. */
export function verifyRulePackProposal(text: string, p: RulePackProposal, o: BuildOptions): VerifiedRulePack {
  const questions = [...p.questions];
  const checked: CheckedRule[] = p.rules.map((proposed) => {
    const { reason, rule, dropped } = checkRule(text, proposed);
    const what = `${cap(proposed.kind.replaceAll('_', ' '))}${proposed.ageGroup ? ` (${proposed.ageGroup})` : ''}`;
    if (reason) questions.push(`${what}: please confirm. ${reason}`);
    else if (dropped.length) questions.push(`${what}: ${dropped.join(', ')} was left out because the quoted sentence does not say it. Add it by hand if the text states it elsewhere.`);
    return { rule, status: reason ? 'rejected' : 'verified', reason };
  });
  const ok = checked.filter((c) => c.status === 'verified').map((c) => c.rule);

  const groups: AgeGroup[] = [];
  const rules: Rule[] = [];
  const ids = new Set<string>();
  const id = (base: string) => {
    let k = base;
    for (let i = 2; ids.has(k); i++) k = `${base}-${i}`;
    ids.add(k);
    return k;
  };
  for (const r of ok.filter((x) => x.kind === 'ratio')) {
    const key = slug(r.ageGroup!);
    if (groups.some((g) => g.key === key)) {
      questions.push(`"${r.ageGroup}" has more than one ratio in the text; only the first was kept.`);
      continue;
    }
    groups.push({ key, label: cap(r.ageGroup!), fromMonths: monthsOf(r.ageGroup!) ?? groups.length * 12 });
    rules.push({
      id: id(`ratio-${key}`),
      label: `${cap(r.ageGroup!)}: 1 per ${r.childrenPerStaff}${r.maxGroupSize ? `, group of at most ${r.maxGroupSize}` : ''}`,
      kind: 'ratio',
      ageGroup: key,
      childrenPerStaff: r.childrenPerStaff!,
      maxGroupSize: r.maxGroupSize,
      ...provenance(o.basis, r.quote!),
    });
  }
  if (groups.some((g) => monthsOf(g.label) == null) && groups.length > 1) questions.push('Groups without ages are ordered as they appear in the text: check that the youngest comes first.');
  groups.sort((a, b) => a.fromMonths - b.fromMonths);

  for (const r of ok.filter((x) => x.kind === 'role_present')) {
    const name = r.credential!.toLowerCase();
    const match = o.credentials.find((c) => c.key === slug(name) || c.name.toLowerCase().includes(name) || name.includes(c.name.toLowerCase()));
    if (!match) questions.push(`"${r.credential}" is not one of your credentials yet. Add it in Credentials so this rule can be checked.`);
    rules.push({
      id: id(`role-${slug(name)}`),
      label: `At least ${r.min} with ${r.credential} ${r.scope === 'room' ? 'in each room' : 'on site'}`,
      kind: 'role_present',
      credential: match?.key ?? slug(name),
      min: r.min!,
      scope: r.scope ?? 'site',
      when: 'children_present',
      ...provenance(o.basis, r.quote!),
    });
  }
  const simple = { min_rest_between_shifts: 'Rest between shifts', max_hours_per_day: 'Most hours in a day', max_hours_per_week: 'Most hours in a week' } as const;
  for (const kind of Object.keys(simple) as (keyof typeof simple)[]) {
    const r = ok.find((x) => x.kind === kind);
    if (r) rules.push({ id: id(kind.replaceAll('_', '-')), label: `${simple[kind]}: ${r.hours} h`, kind, hours: r.hours!, ...provenance(o.basis, r.quote!) });
  }
  const consec = ok.find((x) => x.kind === 'max_consecutive_days');
  if (consec) rules.push({ id: id('max-consecutive-days'), label: `At most ${consec.days} days in a row`, kind: 'max_consecutive_days', days: consec.days!, ...provenance(o.basis, consec.quote!) });
  const ot = ok.filter((x) => x.kind === 'overtime_flag');
  if (ot.length) {
    const daily = ot.find((x) => x.dailyHours != null)?.dailyHours ?? null;
    const weekly = ot.find((x) => x.weeklyHours != null)?.weeklyHours ?? null;
    rules.push({
      id: id('overtime'),
      label: `Overtime over ${[daily != null ? `${daily} h a day` : null, weekly != null ? `${weekly} h a week` : null].filter(Boolean).join(' or ')}`,
      kind: 'overtime_flag',
      dailyHours: daily,
      weeklyHours: weekly,
      ...provenance(o.basis, ot.map((x) => x.quote).join(' … ')),
    });
  }
  const sick = ok.filter((x) => x.kind === 'sick_accrual');
  if (sick.length) {
    const pick = <K extends keyof DraftRule>(k: K) => sick.find((x) => x[k] != null)?.[k] ?? null;
    const per = pick('hoursPerUnit') as number | null;
    if (per == null) questions.push('Sick leave: the text gives limits but not how fast it is earned (1 hour per how many hours worked?).');
    rules.push({
      id: id('sick-accrual'),
      label: `Paid sick leave${per != null ? `: 1 hour per ${per} worked` : ''}`,
      kind: 'sick_accrual',
      hoursPerUnit: per,
      annualUseCap: pick('annualUseCap') as number | null,
      balanceCap: pick('balanceCap') as number | null,
      annualAccrualCap: pick('annualAccrualCap') as number | null,
      usableFromDay: pick('usableFromDay') as number | null,
      carryoverMax: null,
      frontloadHours: null,
      ...provenance(o.basis, sick.map((x) => x.quote).join(' … ')),
    });
  }
  for (const kind of ['min_rest_between_shifts', 'max_hours_per_day', 'max_hours_per_week', 'max_consecutive_days'] as const) {
    if (ok.filter((x) => x.kind === kind).length > 1) questions.push(`More than one "${kind.replaceAll('_', ' ')}" rule was found; only the first was kept.`);
  }

  if (rules.length === 0) return { checked, pack: null, questions: [...new Set(questions)] };
  const pack: RulePack = {
    key: o.key,
    version: 1,
    name: o.name,
    vertical: o.vertical,
    jurisdiction: o.jurisdiction,
    effectiveFrom: o.effectiveFrom,
    ageGroups: groups,
    labels:
      o.vertical === 'clinic'
        ? { demandUnit: 'bookings', groupNoun: 'service', staffNoun: 'clinician' }
        : o.vertical === 'childcare'
          ? { demandUnit: 'children', groupNoun: 'age group', staffNoun: 'teacher' }
          : undefined,
    rules,
    notes: [
      o.basis === 'law'
        ? 'Drafted from pasted text. Every rule needs verification against the official source. Not legal advice.'
        : "Your organization's own policy, drafted from pasted text.",
    ],
  };
  const errs = validateRulePack(pack);
  if (errs.length) questions.push(`The draft is not a valid pack yet: ${errs.join('; ')}`);
  return { checked, pack: errs.length ? null : pack, questions: [...new Set(questions)] };
}
