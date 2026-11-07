import { validCalendarDate } from './employerCalendar';
import type { AvailabilityWindow } from './recurringAvailability';

/** Pure school-year closure expansion. Never stores school, student, or event names. */
export interface SchoolClosureRule {
  start: string;
  end: string;
  /** Inclusive ISO weekdays, Monday=0 through Sunday=6. Empty means every date. */
  weekdays?: readonly number[];
}
export function expandSchoolClosures(rules: readonly SchoolClosureRule[], start: string, end: string): string[] | null {
  if (!Array.isArray(rules) || rules.length > 128 || !validCalendarDate(start) || !validCalendarDate(end) || start > end) return null;
  const dayMs = 86400000;
  const first = Date.parse(start + 'T00:00:00Z'), last = Date.parse(end + 'T00:00:00Z');
  if ((last - first) / dayMs > 1095) return null;
  const result = new Set<string>();
  for (const rule of rules) {
    if (!rule || !validCalendarDate(rule.start) || !validCalendarDate(rule.end) || rule.start > rule.end
      || (rule.weekdays !== undefined && (!Array.isArray(rule.weekdays) || rule.weekdays.length > 7
        || rule.weekdays.some(d => !Number.isInteger(d) || d < 0 || d > 6)))) return null;
    const lo = Math.max(first, Date.parse(rule.start + 'T00:00:00Z'));
    const hi = Math.min(last, Date.parse(rule.end + 'T00:00:00Z'));
    for (let t = lo; t <= hi; t += dayMs) {
      const date = new Date(t);
      const weekday = (date.getUTCDay() + 6) % 7;
      if (!rule.weekdays || rule.weekdays.includes(weekday)) result.add(date.toISOString().slice(0, 10));
    }
  }
  return [...result].sort();
}

/** Distinguish school closure context from either adult's hard exclusions. */
export function uncoveredSchoolClosures(a: AvailabilityWindow, b: AvailabilityWindow): string[] | null {
  if (!a || !b || !Array.isArray(a.days) || !Array.isArray(b.days) || a.days.length !== b.days.length || a.days.length > 1096) return null;
  const dates: string[] = [];
  for (let i = 0; i < a.days.length; i++) {
    const x = a.days[i], y = b.days[i];
    if (!x || !y || x.date !== y.date || !validCalendarDate(x.date)) return null;
    if ((x.schoolClosed || y.schoolClosed) && x.workday && !x.alreadyOff && y.workday && !y.alreadyOff) dates.push(x.date);
  }
  return dates;
}
