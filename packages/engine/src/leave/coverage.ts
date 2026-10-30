import { mondayIndexedDow, rangeISO } from '../solver/dateUtils';
import type { ISODate, WorkWeek } from '../solver/types';

/*
 * Coverage: who is present on each day, and which coverage rules a set of absences breaks.
 * Pure and deterministic; used for live request validation, the approvals queue and the
 * team planner.
 */

export interface CoverageMember {
  id: string;
  teamId: string | null;
  tags: readonly string[];
  workWeek: WorkWeek;
  /** Days this member is not scheduled to work even on a work-week day (holidays). */
  holidays?: ReadonlySet<ISODate>;
  /** Days already out (approved or pending leave). Half days count as out. */
  out: ReadonlySet<ISODate>;
}

export interface CoverageRuleInput {
  id: string;
  teamId: string;
  minPresent: number;
  tag: string | null;
  /** Monday-first, 7 chars of 0/1. */
  weekdays: string;
  effectiveFrom?: ISODate | null;
  effectiveTo?: ISODate | null;
}

export interface CoverageViolation {
  ruleId: string;
  date: ISODate;
  teamId: string;
  tag: string | null;
  required: number;
  present: number;
}

function ruleApplies(rule: CoverageRuleInput, date: ISODate): boolean {
  if (rule.weekdays[mondayIndexedDow(date)] !== '1') return false;
  if (rule.effectiveFrom && date < rule.effectiveFrom) return false;
  if (rule.effectiveTo && date > rule.effectiveTo) return false;
  return true;
}

export function isScheduled(m: CoverageMember, date: ISODate): boolean {
  return !!m.workWeek[mondayIndexedDow(date)] && !m.holidays?.has(date);
}

/** Members a rule counts on a day: in the team, with the tag, scheduled, not out. */
export function presentFor(rule: CoverageRuleInput, members: readonly CoverageMember[], date: ISODate): number {
  let n = 0;
  for (const m of members) {
    if (m.teamId !== rule.teamId) continue;
    if (rule.tag && !m.tags.includes(rule.tag)) continue;
    if (isScheduled(m, date) && !m.out.has(date)) n++;
  }
  return n;
}

/**
 * Violations over [start, end]. A day where nobody covered by the rule is scheduled at all
 * (e.g. a public holiday for the whole team) is not a violation: the business is closed.
 */
export function coverageViolations(
  rules: readonly CoverageRuleInput[],
  members: readonly CoverageMember[],
  start: ISODate,
  end: ISODate,
): CoverageViolation[] {
  const out: CoverageViolation[] = [];
  for (const date of rangeISO(start, end)) {
    for (const rule of rules) {
      if (!ruleApplies(rule, date)) continue;
      const scheduled = members.filter(
        (m) => m.teamId === rule.teamId && (!rule.tag || m.tags.includes(rule.tag)) && isScheduled(m, date),
      ).length;
      if (scheduled === 0) continue;
      const present = presentFor(rule, members, date);
      if (present < rule.minPresent) {
        out.push({ ruleId: rule.id, date, teamId: rule.teamId, tag: rule.tag, required: rule.minPresent, present });
      }
    }
  }
  return out;
}

/**
 * Violations a proposed absence would ADD. Days already short before the absence are not
 * blamed on it.
 */
export function newViolationsFor(
  rules: readonly CoverageRuleInput[],
  members: readonly CoverageMember[],
  memberId: string,
  dates: readonly ISODate[],
): CoverageViolation[] {
  if (dates.length === 0) return [];
  const sorted = [...dates].sort();
  const start = sorted[0]!;
  const end = sorted[sorted.length - 1]!;
  const before = new Set(coverageViolations(rules, members, start, end).map((v) => `${v.ruleId}|${v.date}`));
  const withAbsence = members.map((m) => (m.id === memberId ? { ...m, out: new Set([...m.out, ...dates]) } : m));
  return coverageViolations(rules, withAbsence, start, end).filter((v) => !before.has(`${v.ruleId}|${v.date}`) && dates.includes(v.date));
}
