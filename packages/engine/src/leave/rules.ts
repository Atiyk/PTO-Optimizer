import { addDays, isoToSerial } from '../solver/dateUtils';
import type { ISODate } from '../solver/types';

/**
 * Policy automations (pure). Admin-defined rules that apply to a leave request, scoped by leave
 * type, location, team and group:
 *  - blackout: no leave in a date range;
 *  - probation: no leave until the person has been employed N days;
 *  - max_out: at most N people from the scope away on any one day;
 *  - min_notice: ask at least N days ahead, tiered by the request's length in working days;
 *  - max_consecutive: at most N working days in one request;
 *  - request_window: a contested period (e.g. the holidays) where requests are collected until a
 *    date and then allocated fairly, never first come, first served.
 * Health-related and statutory-protected leave is exempt from every rule (ctx.exempt): sick leave
 * can't be denied for coverage, notice or blackouts (e.g. California Labor Code §246.5(c)(1)).
 * Each rule is hard (blocks the request) or soft (warns the approver). The engine never throws:
 * it returns plain-language problems and warnings that name the rule.
 */

export interface RuleScope {
  /** Leave type keys; empty = every type. */
  leaveTypeKeys: string[];
  /** Empty = every location. */
  locationIds: string[];
  /** Empty = every team. */
  teamIds: string[];
  /** Empty = every group. */
  groupIds: string[];
}

export type LeaveRule = RuleScope & {
  id: string;
  name: string;
  hard: boolean;
} & (
    | { kind: 'blackout'; start: ISODate; end: ISODate }
    | { kind: 'probation'; minDays: number }
    | { kind: 'max_out'; maxOut: number }
    | { kind: 'min_notice'; tiers: NoticeTier[] }
    | { kind: 'max_consecutive'; maxDays: number }
    | { kind: 'request_window'; start: ISODate; end: ISODate; collectUntil: ISODate; slots: number; tieBreak: TieBreak }
  );

/** Requests of at least `minDays` working days need `noticeDays` days' notice. */
export interface NoticeTier {
  minDays: number;
  noticeDays: number;
}

export type TieBreak = 'rotation' | 'seniority' | 'lottery';
export const RULE_KINDS = ['blackout', 'probation', 'max_out', 'min_notice', 'max_consecutive', 'request_window'] as const;

export interface RuleSubject {
  memberId: string;
  startDate: ISODate | null;
  locationId: string | null;
  teamId: string | null;
  groupIds: string[];
}

/** Someone else's approved or pending leave, with the scope facts of the person. */
export interface OtherAbsence {
  memberId: string;
  leaveTypeKey: string;
  locationId: string | null;
  teamId: string | null;
  groupIds: string[];
  /** Working days the absence charges. */
  dates: ISODate[];
}

export interface RuleContext {
  subject: RuleSubject;
  leaveTypeKey: string;
  start: ISODate;
  end: ISODate;
  /** Working days this request charges (from requestCost). */
  chargedDates: ISODate[];
  others: OtherAbsence[];
  /** Today, for notice and request-window rules. Absent: those rules are skipped. */
  today?: ISODate;
  /** Health-related or statutory-protected leave: no rule applies. */
  exempt?: boolean;
}

export interface RuleFinding {
  ruleId: string;
  rule: string;
  kind: LeaveRule['kind'];
  hard: boolean;
  /** First date the rule fails on. */
  date: ISODate;
  message: string;
}

export interface RuleResult {
  problems: RuleFinding[];
  warnings: RuleFinding[];
}

const inList = (list: string[], v: string | null) => list.length === 0 || (v != null && list.includes(v));
const anyIn = (list: string[], vs: string[]) => list.length === 0 || vs.some((v) => list.includes(v));

/** Whether a person (and, optionally, a leave type) falls inside a rule's scope. */
export function inScope(
  scope: RuleScope,
  who: { locationId: string | null; teamId: string | null; groupIds: string[] },
  leaveTypeKey?: string,
): boolean {
  return (
    (leaveTypeKey == null || inList(scope.leaveTypeKeys, leaveTypeKey)) &&
    inList(scope.locationIds, who.locationId) &&
    inList(scope.teamIds, who.teamId) &&
    anyIn(scope.groupIds, who.groupIds)
  );
}

export function evaluateLeaveRules(rules: LeaveRule[], ctx: RuleContext): RuleResult {
  const problems: RuleFinding[] = [];
  const warnings: RuleFinding[] = [];
  const push = (r: LeaveRule, date: ISODate, message: string) =>
    (r.hard ? problems : warnings).push({ ruleId: r.id, rule: r.name, kind: r.kind, hard: r.hard, date, message });

  if (ctx.exempt) return { problems, warnings };
  for (const r of rules) {
    if (!inScope(r, ctx.subject, ctx.leaveTypeKey)) continue;
    switch (r.kind) {
      case 'blackout': {
        if (r.start > ctx.end || r.end < ctx.start) break;
        const first = ctx.start > r.start ? ctx.start : r.start;
        push(r, first, `${r.name}: no leave from ${r.start} to ${r.end}.`);
        break;
      }
      case 'probation': {
        if (!ctx.subject.startDate) break;
        const eligibleFrom = addDays(ctx.subject.startDate, r.minDays);
        if (ctx.start < eligibleFrom) {
          push(r, ctx.start, `${r.name}: this leave can be taken from ${eligibleFrom} (${r.minDays} days after the start date).`);
        }
        break;
      }
      case 'max_out': {
        // Count distinct other people in the same scope (any leave type in the rule) per day.
        const peers = ctx.others.filter((o) => o.memberId !== ctx.subject.memberId && inScope(r, o, o.leaveTypeKey));
        for (const d of ctx.chargedDates) {
          const away = new Set(peers.filter((o) => o.dates.includes(d)).map((o) => o.memberId)).size;
          if (away + 1 > r.maxOut) {
            push(r, d, `${r.name}: on ${d} ${away + 1} people would be away; the limit is ${r.maxOut}.`);
            break;
          }
        }
        break;
      }
      case 'min_notice': {
        if (!ctx.today || ctx.start < ctx.today) break; // past dates are handled by the retro rule
        const need = requiredNotice(r.tiers, ctx.chargedDates.length);
        if (need == null) break;
        const given = daysBetween(ctx.today, ctx.start);
        if (given < need) {
          push(r, ctx.start, `${r.name}: ${ctx.chargedDates.length} working day${ctx.chargedDates.length === 1 ? '' : 's'} need${ctx.chargedDates.length === 1 ? 's' : ''} ${need} days' notice; this gives ${given}.`);
        }
        break;
      }
      case 'max_consecutive': {
        if (ctx.chargedDates.length > r.maxDays) {
          push(r, ctx.start, `${r.name}: at most ${r.maxDays} working days in one request; this is ${ctx.chargedDates.length}.`);
        }
        break;
      }
      case 'request_window': {
        if (r.start > ctx.end || r.end < ctx.start) break;
        if (ctx.today && ctx.today > r.collectUntil) break; // allocation done: ordinary rules apply
        // Always soft: the request waits for the allocation, it is never refused here.
        warnings.push({ ruleId: r.id, rule: r.name, kind: r.kind, hard: false, date: ctx.start, message: `${r.name}: requests for ${r.start} to ${r.end} are collected until ${r.collectUntil} and then shared out fairly.` });
        break;
      }
    }
  }
  return { problems, warnings };
}

/** Days from `a` to `b` (b - a). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return isoToSerial(b) - isoToSerial(a);
}

/** The notice the longest matching tier asks for; null when no tier applies. */
export function requiredNotice(tiers: NoticeTier[], workingDays: number): number | null {
  let need: number | null = null;
  let best = -1;
  for (const t of tiers) if (workingDays >= t.minDays && t.minDays > best) {
    best = t.minDays;
    need = t.noticeDays;
  }
  return need;
}

/** Validates a rule's numbers and dates; returns plain problems (empty = valid). */
export function validateLeaveRule(r: LeaveRule): string[] {
  const errs: string[] = [];
  if (!r.name.trim()) errs.push('A rule needs a name.');
  if (r.kind === 'blackout' && isoToSerial(r.end) < isoToSerial(r.start)) errs.push('The end date must be on or after the start date.');
  if (r.kind === 'probation' && !(Number.isInteger(r.minDays) && r.minDays >= 1 && r.minDays <= 730)) errs.push('Probation must be 1 to 730 days.');
  if (r.kind === 'max_out' && !(Number.isInteger(r.maxOut) && r.maxOut >= 1 && r.maxOut <= 1000)) errs.push('The limit must be a whole number from 1 to 1000.');
  if (r.kind === 'min_notice') {
    if (r.tiers.length === 0 || r.tiers.length > 10) errs.push('Give 1 to 10 notice tiers.');
    for (const t of r.tiers) {
      if (!(Number.isInteger(t.minDays) && t.minDays >= 1 && t.minDays <= 365)) errs.push('A tier starts at 1 to 365 working days.');
      if (!(Number.isInteger(t.noticeDays) && t.noticeDays >= 0 && t.noticeDays <= 365)) errs.push('Notice must be 0 to 365 days.');
    }
  }
  if (r.kind === 'max_consecutive' && !(Number.isInteger(r.maxDays) && r.maxDays >= 1 && r.maxDays <= 365)) errs.push('The longest request must be 1 to 365 working days.');
  if (r.kind === 'request_window') {
    if (isoToSerial(r.end) < isoToSerial(r.start)) errs.push('The end date must be on or after the start date.');
    if (r.collectUntil >= r.start) errs.push('Collect requests until a date before the period starts.');
    if (!(Number.isInteger(r.slots) && r.slots >= 1 && r.slots <= 1000)) errs.push('Slots must be a whole number from 1 to 1000.');
  }
  return errs;
}

/** One plain sentence per rule, for "Ask about my policy" and the admin list. */
export function describeRule(r: LeaveRule, forTypes: (keys: string[]) => string = () => ''): string {
  const t = forTypes(r.leaveTypeKeys);
  switch (r.kind) {
    case 'blackout':
      return `${r.hard ? 'No leave' : 'Leave is discouraged'} from ${r.start} to ${r.end}${t}.`;
    case 'probation':
      return `Leave${t} can be taken ${r.minDays} days after the start date.`;
    case 'max_out':
      return `At most ${r.maxOut} people from your group can be away on the same day${t}.`;
    case 'min_notice':
      return `Notice${t}: ${[...r.tiers].sort((a, b) => a.minDays - b.minDays).map((x) => `${x.minDays}+ working day${x.minDays === 1 ? '' : 's'} need ${x.noticeDays} days' notice`).join('; ')}.`;
    case 'max_consecutive':
      return `At most ${r.maxDays} working days in one request${t}.`;
    case 'request_window':
      return `Requests for ${r.start} to ${r.end}${t} are collected until ${r.collectUntil}, then ${r.slots} place${r.slots === 1 ? '' : 's'} a day are shared out by ${r.tieBreak === 'rotation' ? 'rotation (whoever had it least recently first)' : r.tieBreak === 'seniority' ? 'seniority' : 'a lottery'}.`;
  }
}
