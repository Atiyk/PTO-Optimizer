import { rangeISO } from '@daysoff/engine/solver/dateUtils';
import { validCalendarDate } from './employerCalendar';
import { MAX_REQUESTS, validRequestRange, type PtoRequest } from './requestLedger';
import { MAX_SCHOOL_CALENDAR_DAYS, type SchoolCalendar, type SchoolCalendarWarning } from './schoolCalendar';

export type ConflictSeverity = 'hard-block' | 'review-needed';
export type ConflictCategory =
  | 'employer-blackout'
  | 'confirmed-leave'
  | 'tentative-leave'
  | 'personal-calendar-busy'
  | 'school-in-session'
  | 'commitment';

export type ConflictSource =
  | 'employer-blackouts'
  | 'leave-ledger'
  | 'personal-calendar'
  | 'school-calendar'
  | 'commitments';

export interface CalendarConflict {
  date: string;
  category: ConflictCategory;
  severity: ConflictSeverity;
}

export interface ConflictCheckInput {
  /** Inclusive ISO date window, max 1096 days (same limit as request ledger). */
  start: string;
  end: string;
  /** Explicit unavailable dates, not ordinary observed holidays. */
  employerBlackouts?: readonly string[];
  /** Canonical consumer ledger; no notes or identifiers appear in output. */
  requests?: readonly PtoRequest[];
  /** Date-only output from the existing local ICS parser. */
  personalBusyDays?: readonly string[];
  /** True if the ICS parser reported truncation or unexpanded recurring events. */
  personalCalendarPartial?: boolean;
  school?: SchoolCalendar;
  /** User-entered commitment severity; no titles or notes are accepted. */
  commitments?: readonly { date: string; severity: ConflictSeverity }[];
}

export interface ConflictCheckResult {
  /** Never use "conflict-free": unchecked calendars can still contain conflicts. */
  status: ConflictSeverity | 'no-conflict-found-in-available-data';
  matches: CalendarConflict[];
  /** Context only: a school closure is NOT inherently a conflict. */
  schoolOffDays: string[];
  schoolWarnings: SchoolCalendarWarning[];
  hardBlockDays: number;
  reviewNeededDays: number;
  missingSources: ConflictSource[];
  partial: boolean;
}

/**
 * Deterministic, private, date-only conflict evaluation. It does not read storage,
 * fetch calendars, infer school term dates or export personal information in URLs.
 * Existing approved/completed PTO is a hard overlap; tentative PTO and imported
 * busy dates need review. A school closure is useful context, not a hard block.
 */
export function checkCalendarConflicts(input: ConflictCheckInput): ConflictCheckResult | null {
  if (!input || !validRequestRange(input.start, input.end)) return null;
  // Defend against malformed local data and oversized imported date collections.
  if ((input.employerBlackouts?.length ?? 0) > MAX_SCHOOL_CALENDAR_DAYS
    || (input.personalBusyDays?.length ?? 0) > MAX_SCHOOL_CALENDAR_DAYS
    || (input.commitments?.length ?? 0) > MAX_SCHOOL_CALENDAR_DAYS
    || (input.requests?.length ?? 0) > MAX_REQUESTS
    || (input.school?.offDays.length ?? 0) > MAX_SCHOOL_CALENDAR_DAYS
    || (input.school?.inSessionDays.length ?? 0) > MAX_SCHOOL_CALENDAR_DAYS
    || input.requests?.some((request) => !request || !Array.isArray(request.ptoDates)
      || request.ptoDates.length > 1096)) return null;
  const selected = new Set(rangeISO(input.start, input.end));
  const matches = new Map<string, CalendarConflict>();

  const add = (date: string, category: ConflictCategory, severity: ConflictSeverity): void => {
    if (!validCalendarDate(date) || !selected.has(date)) return;
    const key = date + '|' + category;
    const existing = matches.get(key);
    if (!existing || (existing.severity !== 'hard-block' && severity === 'hard-block')) {
      matches.set(key, { date, category, severity });
    }
  };

  for (const date of input.employerBlackouts ?? []) add(date, 'employer-blackout', 'hard-block');

  for (const request of input.requests ?? []) {
    if (request.status === 'canceled' || request.status === 'rejected') continue;
    if (!Array.isArray(request.ptoDates)) continue;
    const confirmed = request.status === 'approved' || request.status === 'completed';
    if (!confirmed && request.status !== 'planned' && request.status !== 'requested') continue;
    for (const date of request.ptoDates) {
      add(date, confirmed ? 'confirmed-leave' : 'tentative-leave', confirmed ? 'hard-block' : 'review-needed');
    }
  }

  for (const date of input.personalBusyDays ?? []) add(date, 'personal-calendar-busy', 'review-needed');
  for (const date of input.school?.inSessionDays ?? []) add(date, 'school-in-session', 'review-needed');
  for (const item of input.commitments ?? []) {
    if (item.severity === 'hard-block' || item.severity === 'review-needed') {
      add(item.date, 'commitment', item.severity);
    }
  }

  const sorted = [...matches.values()].sort((a, b) =>
    a.date.localeCompare(b.date)
    || (a.severity === b.severity ? 0 : a.severity === 'hard-block' ? -1 : 1)
    || a.category.localeCompare(b.category));
  const hardDates = new Set(sorted.filter((match) => match.severity === 'hard-block').map((match) => match.date));
  const reviewDates = new Set(sorted.filter((match) => match.severity === 'review-needed').map((match) => match.date));

  const sources: readonly (readonly [ConflictSource, boolean])[] = [
    ['employer-blackouts', input.employerBlackouts !== undefined],
    ['leave-ledger', input.requests !== undefined],
    ['personal-calendar', input.personalBusyDays !== undefined],
    ['school-calendar', input.school !== undefined],
    ['commitments', input.commitments !== undefined],
  ];
  const missingSources = sources.filter(([, present]) => !present).map(([name]) => name);
  const status = hardDates.size > 0 ? 'hard-block'
    : reviewDates.size > 0 ? 'review-needed' : 'no-conflict-found-in-available-data';

  return {
    status, matches: sorted,
    schoolOffDays: [...new Set((input.school?.offDays ?? []).filter((date) => selected.has(date)))].sort(),
    schoolWarnings: [...(input.school?.warnings ?? [])],
    hardBlockDays: hardDates.size,
    reviewNeededDays: reviewDates.size,
    missingSources,
    partial: missingSources.length > 0 || input.personalCalendarPartial === true
      || input.school?.coverage === 'partial',
  };
}
