import { addDays } from '../solver/dateUtils';
import { localParts } from '../coverage/timeBlocks';
import type { ISODate } from '../solver/types';
import { rulesOf, type Provenance, type RulePack } from '../coverage/types';
import { checkBreaks, type BreakIssue, type MealRule, type RestRule } from './breaks';
import { overtimeForWeek, type OvertimeRule, type WeekBands } from './overtime';
import { foldPunches, hoursByDate, type Anomaly, type Punch, type Session } from './punches';

/*
 * One person's workweek as a timesheet (time-clock prompt, Part 1): sessions, hours per
 * day, overtime bands and break issues, all from punches plus the site's work rules. The
 * app shows these numbers as they are (D1); nothing here is legal advice.
 */

export interface WorkRules {
  overtime: (OvertimeRule & { id: string; label: string; provenance: Provenance }) | null;
  meals: MealRule[];
  rest: RestRule[];
}

/** The work rules (overtime, meal, rest) in a merged pack. The first overtime rule wins. */
export function workRulesOf(pack: Pick<RulePack, 'rules'> | null | undefined): WorkRules {
  if (!pack) return { overtime: null, meals: [], rest: [] };
  const ot = rulesOf(pack, 'overtime_flag')[0];
  return {
    overtime: ot ? { ...ot, provenance: ot as Provenance } : null,
    meals: rulesOf(pack, 'meal_break'),
    rest: rulesOf(pack, 'rest_break'),
  };
}

export interface SessionView {
  session: Session;
  issues: BreakIssue[];
  restBreaksOwed: number;
}

export interface TimesheetWeek {
  weekStart: ISODate;
  weekEnd: ISODate;
  sessions: SessionView[];
  bands: WeekBands;
  anomalies: Anomaly[];
  issueCount: number;
  /** True while a session in this week is still open. */
  open: boolean;
}

export function timesheetWeek(punches: readonly Punch[], opts: { tz: string; now: number; weekStart: ISODate; rules: WorkRules; maxOpenHours?: number }): TimesheetWeek {
  const weekEnd = addDays(opts.weekStart, 6);
  const fold = foldPunches(punches, { tz: opts.tz, now: opts.now, maxOpenHours: opts.maxOpenHours });
  const inWeek = fold.sessions.filter((s) => s.date >= opts.weekStart && s.date <= weekEnd);
  const sessions: SessionView[] = inWeek.map((s) => {
    const c = checkBreaks(s, { meals: opts.rules.meals, rest: opts.rules.rest }, opts.tz, opts.now);
    // Open shifts only show what is owed; issues are raised once the shift is closed (or late).
    return { session: s, issues: c.issues, restBreaksOwed: c.restBreaks };
  });
  const hours = hoursByDate(inWeek);
  const bands = overtimeForWeek(opts.weekStart, [...hours].map(([date, h]) => ({ date, hours: h })), opts.rules.overtime);
  const anomalies = fold.anomalies.filter((a) => {
    const d = localParts(a.at, opts.tz).date;
    return d >= opts.weekStart && d <= weekEnd;
  });
  const issueCount = sessions.reduce((n, s) => n + s.issues.length, 0) + anomalies.length;
  return { weekStart: opts.weekStart, weekEnd, sessions, bands, anomalies, issueCount, open: inWeek.some((s) => s.end === null && !s.missingOut) };
}
