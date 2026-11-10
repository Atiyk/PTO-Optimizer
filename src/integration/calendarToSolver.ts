import type { SolveInput, WorkWeek } from '@daysoff/engine/solver/types';
import { isoToSerial } from '@daysoff/engine/solver/dateUtils';
import { validCalendarDate } from '../personal/employerCalendar';
import { constraintsFromAvailability } from '../personal/dateConstraints';
import type { IntegratedCalendarEvidence } from './calendarEvidence';

const ALL_WEEK_DAYS: WorkWeek = [true, true, true, true, true, true, true];

/**
 * Opt-in whole-day-only handoff: turn date-specific weekly or rotating shift
 * calendars into fixed-week solver inputs without editing the shared B2B engine.
 * An all-true workweek plus explicit off days preserves work on weekends and
 * nonwork weekdays. Callers must disclose partial source coverage and must
 * validate funded whole-day wallet balances before passing the budget here.
 */
export function calendarEvidenceToSolveInput(input: SolveInput, evidence: IntegratedCalendarEvidence): SolveInput | null {
  if (!input || !evidence || !validCalendarDate(input.rangeStart) || !validCalendarDate(input.rangeEnd)
    || input.rangeEnd < input.rangeStart || !Number.isInteger(input.budget) || input.budget < 0 || input.budget > 1096
    || !Array.isArray(input.offDays) || input.offDays.length > 4000 || !input.offDays.every(validCalendarDate)
    || !Array.isArray(input.blackouts ?? []) || !(input.blackouts ?? []).every(validCalendarDate)
    || !Array.isArray(input.mustIncludeDays ?? []) || !(input.mustIncludeDays ?? []).every(validCalendarDate)) return null;

  const a = evidence.availability;
  const expectedLength = isoToSerial(input.rangeEnd) - isoToSerial(input.rangeStart) + 1;
  if (!a || a.source !== 'explicit-calendar-inputs' || typeof a.partial !== 'boolean'
    || evidence.partial !== a.partial || !Array.isArray(a.days)
    || expectedLength < 1 || expectedLength > 1096 || a.days.length !== expectedLength) return null;

  const recomputed = constraintsFromAvailability(a);
  if (!recomputed || JSON.stringify(recomputed) !== JSON.stringify(evidence.constraints)) return null;

  // A date-specific calendar is authoritative for scheduled working days.
  // Legacy offDays may add genuine holidays/approved leave, but must never
  // silently turn a rotating-shift workday into a free day.
  const explicitDays = new Map(a.days.map(day => [day.date, day]));
  if (input.offDays.some(date => {
    const day = explicitDays.get(date);
    return day && day.workday && !day.employerHoliday && !day.approvedLeave;
  })) return null;

  const off = new Set(input.offDays);
  const hard = new Set(input.blackouts ?? []);
  const startSerial = isoToSerial(input.rangeStart);
  for (let i = 0; i < a.days.length; i++) {
    const d = a.days[i];
    if (!d || !validCalendarDate(d.date) || isoToSerial(d.date) !== startSerial + i
      || typeof d.workday !== 'boolean' || typeof d.alreadyOff !== 'boolean'
      || typeof d.hardBlocked !== 'boolean' || typeof d.reviewNeeded !== 'boolean'
      || typeof d.schoolClosed !== 'boolean' || typeof d.employerHoliday !== 'boolean'
      || typeof d.approvedLeave !== 'boolean'
      || d.alreadyOff !== (!d.workday || d.employerHoliday || d.approvedLeave)) return null;
    if (!d.workday || d.alreadyOff) off.add(d.date);
    if (d.hardBlocked) hard.add(d.date);
  }
  // School closures and unconfirmed calendar busy dates remain advisory/context,
  // not unilaterally converted into time off or hard blackouts.
  return { ...input, workWeek: ALL_WEEK_DAYS, offDays: [...off].sort(), blackouts: [...hard].sort() };
}
