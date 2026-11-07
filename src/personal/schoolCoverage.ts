import type { AvailabilityWindow } from './recurringAvailability';
import { validCalendarDate } from './employerCalendar';

/** Date-only school coverage accounting. No assumption about who is responsible for childcare. */
export interface SchoolCoverageDay {
  date: string;
  schoolClosed: boolean;
  adultAOff: boolean;
  adultBOff: boolean;
  /** Both adults are scheduled to work and neither has approved time off. */
  potentialCoverageGap: boolean;
  /** Minimum number of adults who would need leave if one available adult can provide coverage; not a childcare assignment. */
  potentialPtoDays: 0 | 1 | 2;
}
export interface SchoolCoverageSummary {
  days: SchoolCoverageDay[];
  closureDays: number;
  potentialGapDays: number;
  partial: boolean;
}
/** Evaluates equal date windows; a gap is informational, not a childcare assignment. */
export function schoolCoverage(a: AvailabilityWindow, b: AvailabilityWindow): SchoolCoverageSummary | null {
  if (!a || !b || !Array.isArray(a.days) || !Array.isArray(b.days)
    || a.days.length !== b.days.length || a.days.length > 1096) return null;
  const days: SchoolCoverageDay[] = [];
  for (let i = 0; i < a.days.length; i++) {
    const x = a.days[i], y = b.days[i];
    if (!x || !y || x.date !== y.date || !validCalendarDate(x.date)
      || (i > 0 && x.date <= a.days[i - 1].date)) return null;
    const adultAOff = !x.workday || x.alreadyOff;
    const adultBOff = !y.workday || y.alreadyOff;
    const schoolClosed = x.schoolClosed || y.schoolClosed;
    const potentialCoverageGap = schoolClosed && !adultAOff && !adultBOff;
    days.push({
      date: x.date, schoolClosed, adultAOff, adultBOff, potentialCoverageGap,
      potentialPtoDays: potentialCoverageGap ? 1 : 0,
    });
  }
  return {
    days,
    closureDays: days.filter(d => d.schoolClosed).length,
    potentialGapDays: days.filter(d => d.potentialCoverageGap).length,
    partial: a.partial || b.partial,
  };
}
