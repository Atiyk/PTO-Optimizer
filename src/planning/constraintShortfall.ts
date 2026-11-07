import { validCalendarDate } from '../personal/employerCalendar';
import type { ConstraintSet } from './constraintRecommendationAdapter';

/** Deterministic diagnostics only: never silently relax user hard exclusions. */
export interface ConstraintShortfall {
  kind: 'blackout' | 'budget' | 'notice' | 'missing-calendar';
  message: string;
  dates: string[];
}
export interface RequestedBreak {
  start: string;
  end: string;
  ptoNeeded: number;
  availablePto: number;
  earliestNoticeDate?: string;
}
export function explainConstraintShortfall(request: RequestedBreak, constraints: ConstraintSet): ConstraintShortfall[] | null {
  if (!request || !constraints || !Array.isArray(constraints.dates) || constraints.dates.length > 10000
    || !validCalendarDate(request.start) || !validCalendarDate(request.end) || request.end < request.start
    || !Number.isInteger(request.ptoNeeded) || request.ptoNeeded < 0
    || !Number.isInteger(request.availablePto) || request.availablePto < 0
    || (request.earliestNoticeDate !== undefined && !validCalendarDate(request.earliestNoticeDate))
    || constraints.dates.some(d => !d || !validCalendarDate(d.date))) return null;
  const issues: ConstraintShortfall[] = [];
  const hard = [...new Set(constraints.dates.filter(d => d.severity === 'hard-block' && d.date >= request.start && d.date <= request.end).map(d => d.date))].sort();
  if (hard.length) issues.push({ kind: 'blackout', dates: hard, message: 'Requested dates intersect explicit hard blackouts; choose different dates or explicitly revise your exclusions.' });
  if (request.ptoNeeded > request.availablePto) issues.push({ kind: 'budget', dates: [], message: `Requested break needs ${request.ptoNeeded - request.availablePto} more PTO day(s) than available; shorten or move the break.` });
  if (request.earliestNoticeDate && request.start < request.earliestNoticeDate) issues.push({ kind: 'notice', dates: [], message: `Requested start precedes the earliest notice-compliant date ${request.earliestNoticeDate}.` });
  if (constraints.partial) issues.push({ kind: 'missing-calendar', dates: [], message: 'Calendar sources are incomplete; feasibility cannot be fully confirmed.' });
  return issues;
}
