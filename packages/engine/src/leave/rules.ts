import { addDays, isoToSerial } from '../solver/dateUtils';
import type { ISODate } from '../solver/types';

/**
 * Policy automations (pure). Admin-defined rules that apply to a leave request, scoped by leave
 * type, location, team and group:
 *  - blackout: no leave in a date range;
 *  - probation: no leave until the person has been employed N days;
 *  - max_out: at most N people from the scope away on any one day.
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
  );

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
    }
  }
  return { problems, warnings };
}

/** Validates a rule's numbers and dates; returns plain problems (empty = valid). */
export function validateLeaveRule(r: LeaveRule): string[] {
  const errs: string[] = [];
  if (!r.name.trim()) errs.push('A rule needs a name.');
  if (r.kind === 'blackout' && isoToSerial(r.end) < isoToSerial(r.start)) errs.push('The end date must be on or after the start date.');
  if (r.kind === 'probation' && !(Number.isInteger(r.minDays) && r.minDays >= 1 && r.minDays <= 730)) errs.push('Probation must be 1 to 730 days.');
  if (r.kind === 'max_out' && !(Number.isInteger(r.maxOut) && r.maxOut >= 1 && r.maxOut <= 1000)) errs.push('The limit must be a whole number from 1 to 1000.');
  return errs;
}
