import type { ParsedImportResult } from '../ui/icsImport';
import { validCalendarDate } from './employerCalendar';

/**
 * School dates are deliberately date-only and local-first. This is NOT a district
 * directory or an inference that every unlisted date is an in-session school day.
 * The existing ICS parser must be called locally by the UI before passing its
 * date-only output here; no event names, children or attendee data are retained.
 */
export const MAX_SCHOOL_CALENDAR_DAYS = 4000;

export type SchoolCalendarWarning =
  | 'import-truncated'
  | 'recurring-events-skipped'
  | 'conflicting-school-labels';

export interface SchoolCalendar {
  version: 1;
  source: 'manual' | 'ics' | 'mixed';
  /** Explicit school closures, breaks and staff days, not necessarily employer days off. */
  offDays: string[];
  /** Only explicitly declared in-session days; absence from offDays proves nothing. */
  inSessionDays: string[];
  /** No verified coverage interval: unknown dates must not be inferred as in-session. */
  coverage: 'partial';
  warnings: SchoolCalendarWarning[];
}

export interface SchoolCalendarInput {
  manualOffDays?: readonly string[];
  inSessionDays?: readonly string[];
  /** The date-only result of the existing local parseICSBusyDays function. */
  imported?: Pick<ParsedImportResult, 'busyDays' | 'cappedAt' | 'skippedRecurring'>;
}

function normalizeDates(dates: readonly string[] | undefined): string[] | null {
  if (dates === undefined) return [];
  if (!Array.isArray(dates) || dates.length > MAX_SCHOOL_CALENDAR_DAYS
    || !dates.every((date) => typeof date === 'string' && validCalendarDate(date))) return null;
  return [...new Set(dates)].sort();
}

/** Reject malformed or oversized inputs; never silently reinterpret bad dates. */
export function buildSchoolCalendar(input: SchoolCalendarInput): SchoolCalendar | null {
  if (!input || typeof input !== 'object') return null;
  const manual = normalizeDates(input.manualOffDays);
  const inSessionDays = normalizeDates(input.inSessionDays);
  if (!manual || !inSessionDays) return null;

  const imported = input.imported;
  if (imported !== undefined && (
    !imported || !Array.isArray(imported.busyDays)
    || imported.busyDays.length > MAX_SCHOOL_CALENDAR_DAYS
    || !Number.isSafeInteger(imported.skippedRecurring) || imported.skippedRecurring < 0
    || (imported.cappedAt !== null && (!Number.isSafeInteger(imported.cappedAt) || imported.cappedAt < 1))
  )) return null;
  const importedDates = normalizeDates(imported?.busyDays);
  if (!importedDates) return null;

  const hasManual = input.manualOffDays !== undefined || input.inSessionDays !== undefined;
  if (!hasManual && imported === undefined) return null;

  const offDays = [...new Set([...manual, ...importedDates])].sort();
  const warnings: SchoolCalendarWarning[] = [];
  if (imported?.cappedAt !== null && imported?.cappedAt !== undefined) warnings.push('import-truncated');
  if (imported && imported.skippedRecurring > 0) warnings.push('recurring-events-skipped');
  if (inSessionDays.some((date) => offDays.includes(date))) warnings.push('conflicting-school-labels');

  return {
    version: 1,
    source: imported === undefined ? 'manual' : hasManual ? 'mixed' : 'ics',
    offDays, inSessionDays, coverage: 'partial', warnings,
  };
}
