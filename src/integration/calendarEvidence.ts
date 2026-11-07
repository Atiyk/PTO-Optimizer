import { normalizeCalendarSources, applyCalendarSources, type CalendarSource } from '../personal/calendarSourceAdapter';
import { calendarAvailability, type AvailabilityInputs, type AvailabilityWindow } from '../personal/recurringAvailability';
import { constraintsFromAvailability, type ConstraintSet } from '../personal/dateConstraints';

/**
 * Integration-only, date-only handoff. This keeps unclassified ICS context dates
 * visible as context, rather than silently dropping them or fabricating a source
 * such as approved PTO, employer holiday, or school closure.
 *
 * Local calendar titles and attendee details never appear in this result.
 * Do not put these private calendar-derived dates into public share URLs.
 */
export interface IntegratedCalendarEvidence {
  availability: AvailabilityWindow;
  constraints: ConstraintSet;
  /** Imported nonblocking dates, for contextual display only; NOT hard exclusions. */
  importedContextDates: string[];
  sourceWarnings: string[];
  partial: boolean;
}

/** Validates input via the calendar worker's bounded, pure source and day adapters. */
export function buildIntegratedCalendarEvidence(
  input: AvailabilityInputs,
  sources: readonly CalendarSource[],
): IntegratedCalendarEvidence | null {
  if (!input || typeof input.start !== 'string' || typeof input.end !== 'string') return null;
  const normalized = normalizeCalendarSources(sources);
  if (!normalized) return null;
  const availability = calendarAvailability(applyCalendarSources(input, normalized));
  if (!availability) return null;
  const constraints = constraintsFromAvailability(availability);
  if (!constraints) return null;
  return {
    availability,
    constraints,
    importedContextDates: normalized.contextDays.filter(date => date >= input.start && date <= input.end),
    sourceWarnings: [...normalized.warnings],
    partial: availability.partial,
  };
}
