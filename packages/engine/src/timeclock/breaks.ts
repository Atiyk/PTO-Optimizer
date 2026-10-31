import { localParts } from '../coverage/timeBlocks';
import type { Provenance, RuleOf } from '../coverage/types';
import type { Session } from './punches';

/*
 * Meal and rest breaks (time-clock prompt, Part 1.3). For one session: what the rules say it
 * owes, and whether the clocked meal breaks meet it. Rest breaks are paid and usually not
 * clocked, so they are checked against the employee's clock-out attestation instead.
 * Issues are facts for a manager to review, never a legal finding. Not legal advice.
 */

export type MealRule = RuleOf<'meal_break'>;
export type RestRule = RuleOf<'rest_break'>;

export type BreakIssueKind = 'meal_missed' | 'meal_short' | 'meal_late' | 'meal_early' | 'meal_outside_window' | 'rest_declined';

export interface BreakIssue {
  kind: BreakIssueKind;
  ruleId: string;
  detail: string;
  provenance: Provenance;
}

export interface MealOwed {
  ruleId: string;
  nth: 1 | 2;
  minutes: number;
  /** Latest start (UTC ms), when the rule has one. */
  dueBy: number | null;
  label: string;
}

export interface BreakCheck {
  workedHours: number;
  meals: MealOwed[];
  restBreaks: number;
  restMinutes: number;
  issues: BreakIssue[];
}

const H = 3_600_000;
const MIN = 60_000;
const r2 = (n: number) => Math.round(n * 100) / 100;
const hm = (minute: number) => `${String(Math.floor(minute / 60) % 24).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

/** Rest breaks owed for a stretch of work. */
export function restBreaksOwed(hours: number, rule: Pick<RestRule, 'perHours' | 'majorFraction' | 'minShiftHours'>): number {
  if (rule.minShiftHours != null && hours < rule.minShiftHours) return 0;
  const whole = Math.floor(hours / rule.perHours + 1e-9);
  const rem = r2(hours - whole * rule.perHours);
  return whole + (rule.majorFraction && rem > rule.perHours / 2 ? 1 : 0);
}

function mealApplies(r: MealRule, s: Pick<Session, 'start'>, end: number, workedHours: number, tz: string): boolean {
  if (!(workedHours > r.whenOverHours)) return false;
  const startLocal = localParts(s.start, tz);
  const endLocal = localParts(end, tz);
  const startMin = startLocal.minute;
  // Minutes past the start date's midnight, so a shift ending after midnight compares correctly.
  const endMin = endLocal.date === startLocal.date ? endLocal.minute : endLocal.minute + 1440;
  if (r.shiftStartsBefore != null && !(startMin < r.shiftStartsBefore)) return false;
  if (r.shiftEndsAfter != null && !(endMin > r.shiftEndsAfter)) return false;
  if (r.window && !(startMin <= r.window.from && endMin >= r.window.to)) return false;
  return true;
}

/**
 * Check one session. `now` closes an open session for the "owed so far" view; issues for
 * timing that has not happened yet (a meal not yet due) are not raised.
 */
export function checkBreaks(session: Session, rules: { meals: readonly MealRule[]; rest: readonly RestRule[] }, tz: string, now: number): BreakCheck {
  const end = session.end ?? now;
  const open = session.end === null;
  const workedHours = r2(session.workedMinutes / 60);
  const meals = session.breaks.filter((b) => b.kind === 'meal').sort((a, b) => a.start - b.start);
  const issues: BreakIssue[] = [];
  const owed: MealOwed[] = [];

  // For an open session, a meal is owed when the shift *will* pass the threshold; the
  // scheduled length is unknown, so show every first meal as owed with its deadline.
  const sorted = [...rules.meals].sort((a, b) => (a.nth ?? 1) - (b.nth ?? 1));
  for (const r of sorted) {
    const nth = r.nth ?? 1;
    const applies = open ? nth === 1 && couldApply(r, session.start, tz) : mealApplies(r, session, end, workedHours, tz);
    if (!applies) continue;
    const dueBy = r.startByHours != null ? session.start + r.startByHours * H : null;
    owed.push({ ruleId: r.id, nth, minutes: r.minutes, dueBy, label: r.label });
    if (open) {
      if (meals[nth - 1] == null && dueBy != null && now > dueBy) issues.push({ kind: 'meal_late', ruleId: r.id, detail: `No meal break started by ${fmtTime(dueBy, tz)} (${r.startByHours} h into the shift)`, provenance: r });
      continue;
    }
    const m = meals[nth - 1];
    if (!m) {
      issues.push({ kind: 'meal_missed', ruleId: r.id, detail: `No ${nth === 2 ? 'second ' : ''}meal break on a ${workedHours} h shift; ${r.minutes} min owed after ${r.whenOverHours} h`, provenance: r });
      continue;
    }
    const mEnd = m.end ?? end;
    const len = Math.round((mEnd - m.start) / MIN);
    if (len < r.minutes) issues.push({ kind: 'meal_short', ruleId: r.id, detail: `${nth === 2 ? 'Second meal' : 'Meal'} break was ${len} min; at least ${r.minutes} min owed`, provenance: r });
    if (r.startByHours != null && m.start > session.start + r.startByHours * H) issues.push({ kind: 'meal_late', ruleId: r.id, detail: `Meal break started ${r2((m.start - session.start) / H)} h into the shift; due by ${r.startByHours} h`, provenance: r });
    if (r.startAfterHours != null && m.start < session.start + r.startAfterHours * H) issues.push({ kind: 'meal_early', ruleId: r.id, detail: `Meal break started ${r2((m.start - session.start) / H)} h into the shift; not before ${r.startAfterHours} h`, provenance: r });
    if (r.window) {
      const ms = localParts(m.start, tz).minute;
      const me = ms + len;
      if (ms < r.window.from || me > r.window.to) issues.push({ kind: 'meal_outside_window', ruleId: r.id, detail: `Meal break ${hm(ms)}–${hm(me)} is outside ${hm(r.window.from)}–${hm(r.window.to)}`, provenance: r });
    }
  }

  const rest = rules.rest[0];
  const restBreaks = rest ? restBreaksOwed(workedHours, rest) : 0;
  if (rest && !open && restBreaks > 0 && session.restBreaksTaken === false) {
    issues.push({ kind: 'rest_declined', ruleId: rest.id, detail: `Said they did not get their rest breaks; ${restBreaks} × ${rest.minutes} min owed on a ${workedHours} h shift`, provenance: rest });
  }
  return { workedHours, meals: owed, restBreaks, restMinutes: rest ? restBreaks * rest.minutes : 0, issues };
}

/** For an open shift: could this first meal end up owed (its start-time conditions hold)? */
function couldApply(r: MealRule, start: number, tz: string): boolean {
  const m = localParts(start, tz).minute;
  if (r.shiftStartsBefore != null && !(m < r.shiftStartsBefore)) return false;
  if (r.window && !(m <= r.window.from)) return false;
  return true;
}

function fmtTime(ms: number, tz: string): string {
  return hm(localParts(ms, tz).minute);
}
