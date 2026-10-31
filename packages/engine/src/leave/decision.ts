import { addDays, mondayIndexedDow } from '../solver/dateUtils';

/**
 * The decision route for a leave request (pure, D1). Takes every check result the app gathered
 * and the approval policy that applies, and says what happens next:
 *  - blocked: an objective problem stops the submit (balance, own overlap, retro limit, hard rule);
 *  - no_approval_needed: the leave type needs no approval (sick leave by default);
 *  - recorded_protected: statutory-protected leave is recorded and routed to HR, never decided
 *    by rules and never approved or declined by a manager;
 *  - auto_approve: every check passes (or is tolerated) and the policy is in `auto` mode;
 *  - needs_person: everything else, with a recommendation for the approver.
 *
 * The route never declines. A "no" on a judgement call always comes from a person, with a reason
 * and a path to review (Colorado SB 26-189; GDPR Art. 22). A test asserts there is no decline.
 */

export const CHECK_KINDS = [
  'balance',
  'waiting_period',
  'overlap',
  'retro',
  'notice',
  'max_consecutive',
  'coverage',
  'regulated',
  'blackout',
  'probation',
  'max_out',
  'request_window',
  'event',
  'overtime',
  'size',
  'opt_in',
  'other',
] as const;
export type CheckKind = (typeof CHECK_KINDS)[number];

/** Warnings an approval policy may choose to let through auto-approval. */
export const TOLERABLE_WARNINGS = ['event', 'coverage', 'blackout', 'probation', 'max_out', 'notice', 'max_consecutive', 'overtime'] as const satisfies readonly CheckKind[];
export type TolerableWarning = (typeof TOLERABLE_WARNINGS)[number];

export const PROTECTED_CATEGORIES = ['none', 'fmla_possible', 'parental', 'jury', 'military', 'bereavement', 'voting', 'other_statutory'] as const;
export type ProtectedCategory = (typeof PROTECTED_CATEGORIES)[number];

export const POLICY_MODES = ['off', 'shadow', 'suggest', 'auto'] as const;
export type PolicyMode = (typeof POLICY_MODES)[number];

export interface Finding {
  kind: CheckKind;
  /** fail = blocks the submit; warn = the approver should see it. */
  severity: 'fail' | 'warn';
  message: string;
  /** One line the requester can act on, when there is one. */
  fix?: string;
}

export interface CheckItem {
  kind: CheckKind;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  fix?: string;
}

export interface DecisionFacts {
  leaveTypeName: string;
  unit: 'days' | 'hours';
  amount: number;
  workingDays: number;
  countsAgainstBalance: boolean;
  balanceAfter: number | null;
  requiresApproval: boolean;
  healthRelated: boolean;
  protectedCategory: ProtectedCategory;
  retroactive: boolean;
  findings: Finding[];
  /** From the cover dry run: null when nobody would need covering. */
  overtimeBand: 'no_overtime' | 'overtime' | 'no_cover' | null;
}

export interface ApprovalPolicy {
  id: string | null;
  name: string;
  mode: PolicyMode;
  /** Longest request (in the request's unit) that may be auto-approved; null = no limit. */
  maxDays: number | null;
  /** Least notice (days) for auto-approval; null = no minimum. */
  minNoticeDays: number | null;
  toleratedWarnings: readonly CheckKind[];
  /** Legacy (org-wide autonomy): the leave type must have opted in. */
  requiresTypeOptIn: boolean;
  typeOptedIn: boolean;
}

export type Route = 'blocked' | 'no_approval_needed' | 'recorded_protected' | 'auto_approve' | 'needs_person';
export type Recommendation = 'approve' | 'look' | 'likely_decline';

export interface Decision {
  route: Route;
  /** Whether the checks alone would auto-approve (whatever the mode). Shadow mode records this. */
  wouldAutoApprove: boolean;
  /** Why it would not auto-approve; empty when it would. */
  blockers: string[];
  checklist: CheckItem[];
  recommendation: Recommendation | null;
  reasons: string[];
  basis: string;
}

const PASS_MESSAGES: Partial<Record<CheckKind, string>> = {
  balance: 'Enough balance',
  overlap: 'No overlap with your other leave',
  notice: 'Enough notice',
  coverage: 'Team coverage holds',
  regulated: 'Staffing ratios hold',
  blackout: 'No blackout',
  max_out: 'Within the limit on people away',
  event: 'No team events',
};

/** One blocker line per kind where the details are already in the checklist. */
const SUMMARY: Partial<Record<CheckKind, string>> = {
  coverage: 'Would leave the team below its coverage minimum.',
  regulated: 'Would break a staffing ratio or required-role rule.',
  blackout: 'Overlaps a blackout period.',
};

/** Signals that, in the engine's view, an approver would usually say no to. */
const HEAVY: CheckKind[] = ['regulated', 'blackout', 'max_out', 'request_window'];

const plural = (n: number, unit: string) => `${n} ${n === 1 ? unit.replace(/s$/, '') : unit}`;

export function decideRoute(f: DecisionFacts, policy: ApprovalPolicy, noticeGiven: number | null): Decision {
  const fails = f.findings.filter((x) => x.severity === 'fail');
  const warns = f.findings.filter((x) => x.severity === 'warn');
  const extraWarns: Finding[] = [];
  if (f.overtimeBand === 'overtime') extraWarns.push({ kind: 'overtime', severity: 'warn', message: 'Cover would mean overtime for someone.' });
  if (f.overtimeBand === 'no_cover') extraWarns.push({ kind: 'overtime', severity: 'warn', message: 'Nobody eligible to cover was found.' });
  const allWarns = [...warns, ...extraWarns];

  const checklist: CheckItem[] = [];
  const seen = new Set<CheckKind>();
  for (const x of [...fails, ...allWarns]) {
    checklist.push({ kind: x.kind, status: x.severity, message: x.message, ...(x.fix ? { fix: x.fix } : {}) });
    seen.add(x.kind);
  }
  const exempt = f.healthRelated || f.protectedCategory !== 'none';
  for (const k of Object.keys(PASS_MESSAGES) as CheckKind[]) {
    if (seen.has(k)) continue;
    if (k === 'balance' && !f.countsAgainstBalance) continue;
    if (exempt && k !== 'balance' && k !== 'overlap') continue;
    checklist.push({ kind: k, status: 'pass', message: PASS_MESSAGES[k]! });
  }

  const tolerated = allWarns.filter((w) => policy.toleratedWarnings.includes(w.kind));
  const basis =
    `${f.leaveTypeName}, ${plural(f.amount, f.unit)}` +
    (policy.maxDays != null ? ` (limit ${policy.maxDays})` : '') +
    (f.countsAgainstBalance && f.balanceAfter != null ? `, balance after ${f.balanceAfter}` : '') +
    ', no coverage gap, no blackout' +
    (tolerated.length ? `, tolerated: ${[...new Set(tolerated.map((w) => w.kind))].join(', ')}` : '') +
    (policy.id ? `, policy "${policy.name}"` : '');

  const base = { checklist, basis };
  if (fails.length) {
    return { ...base, route: 'blocked', wouldAutoApprove: false, blockers: fails.map((x) => x.message), recommendation: null, reasons: fails.map((x) => x.message) };
  }
  if (f.protectedCategory !== 'none') {
    return {
      ...base,
      route: 'recorded_protected',
      wouldAutoApprove: false,
      blockers: ['Protected leave is recorded and sent to HR, not approved by rules.'],
      recommendation: null,
      reasons: [],
    };
  }
  if (!f.requiresApproval && !f.retroactive) {
    return { ...base, route: 'no_approval_needed', wouldAutoApprove: false, blockers: [], recommendation: null, reasons: [] };
  }

  const blockers: string[] = [];
  if (policy.requiresTypeOptIn && !policy.typeOptedIn) blockers.push(`${f.leaveTypeName} is not set up for auto-approval.`);
  if (policy.maxDays != null && f.amount > policy.maxDays) blockers.push(`Longer than the ${plural(policy.maxDays, f.unit)} auto-approval limit.`);
  if (policy.minNoticeDays != null && noticeGiven != null && noticeGiven < policy.minNoticeDays) {
    blockers.push(`Less than the ${policy.minNoticeDays} days' notice auto-approval needs.`);
  }
  if (f.retroactive) blockers.push('Starts in the past.');
  if (f.countsAgainstBalance && f.balanceAfter != null && f.balanceAfter < 0) blockers.push('Would take the balance below zero.');
  // Health-related leave is never held back by coverage, blackouts or notice (CA Lab. Code §246.5).
  for (const w of allWarns) {
    if (exempt && w.kind !== 'retro') continue;
    if (w.kind === 'retro') continue; // already "Starts in the past."
    if (w.kind !== 'request_window' && policy.toleratedWarnings.includes(w.kind)) continue;
    const text = SUMMARY[w.kind] ?? w.message;
    if (!blockers.includes(text)) blockers.push(text);
  }
  const wouldAutoApprove = blockers.length === 0;

  let recommendation: Recommendation = 'approve';
  const reasons: string[] = [];
  if (!wouldAutoApprove) {
    const heavy = allWarns.filter((w) => HEAVY.includes(w.kind) || (w.kind === 'overtime' && f.overtimeBand === 'no_cover'));
    if (heavy.length && !exempt) {
      recommendation = 'likely_decline';
      reasons.push(...heavy.map((w) => w.message));
    } else if (allWarns.length && !exempt) {
      recommendation = 'look';
      reasons.push(...allWarns.map((w) => w.message));
    } else {
      reasons.push(exempt ? 'Health-related leave: coverage and notice rules do not apply.' : 'Every check passes.');
    }
  } else reasons.push('Every check passes.');

  const route: Route = wouldAutoApprove && policy.mode === 'auto' ? 'auto_approve' : 'needs_person';
  return { ...base, route, wouldAutoApprove, blockers, recommendation, reasons };
}

/**
 * Possible-FMLA flag (29 CFR 825.115(a): incapacity of "more than three consecutive, full calendar
 * days"). Flags; never decides eligibility. Returns the date the eligibility notice is due: five
 * business days (29 CFR 825.300(b)(1)) after the employer learns of it.
 */
export function possibleFmla(input: { healthRelated: boolean; protectedCategory: ProtectedCategory; calendarDays: number }): boolean {
  return input.protectedCategory === 'fmla_possible' || (input.healthRelated && input.calendarDays > 3);
}

export function addBusinessDays(iso: string, n: number, holidays: ReadonlySet<string> = new Set()): string {
  let d = iso;
  let left = n;
  while (left > 0) {
    d = addDays(d, 1);
    if (mondayIndexedDow(d) < 5 && !holidays.has(d)) left--;
  }
  return d;
}
