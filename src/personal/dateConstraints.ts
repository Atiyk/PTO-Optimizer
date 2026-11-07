import type { AvailabilityWindow } from './recurringAvailability';

/** Date-only, privacy-safe interchange contract between calendar and recommendations. */
export interface DateAvailability {
  date: string;
  severity: 'hard-block' | 'review-needed' | 'context';
  provenance: 'user-blackout' | 'calendar-busy' | 'school-closure' | 'employer-holiday' | 'approved-leave';
  confidence: 'explicit' | 'partial';
}
export interface ConstraintSet {
  dates: DateAvailability[];
  partial: boolean;
  missingSources: string[];
}

/** Preserve provenance without leaking event titles, attendees or family identities. */
export function constraintsFromAvailability(window: AvailabilityWindow): ConstraintSet | null {
  if (!window || !Array.isArray(window.days) || window.days.length > 1096) return null;
  const dates: DateAvailability[] = [];
  const seen = new Set<string>();
  for (const day of window.days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day.date) || seen.has(day.date)) return null;
    seen.add(day.date);
    const confidence = window.partial ? 'partial' : 'explicit';
    if (day.hardBlocked) dates.push({ date: day.date, severity: 'hard-block', provenance: 'user-blackout', confidence });
    if (day.reviewNeeded) dates.push({ date: day.date, severity: 'review-needed', provenance: 'calendar-busy', confidence });
    if (day.schoolClosed) dates.push({ date: day.date, severity: 'context', provenance: 'school-closure', confidence });
    if (day.employerHoliday) dates.push({ date: day.date, severity: 'context', provenance: 'employer-holiday', confidence });
    if (day.approvedLeave) dates.push({ date: day.date, severity: 'context', provenance: 'approved-leave', confidence });
  }
  return { dates, partial: window.partial, missingSources: window.partial ? ['Calendar completeness unverified'] : [] };
}

export function hardExcludedDates(set: ConstraintSet): string[] {
  return [...new Set(set.dates.filter(d => d.severity === 'hard-block').map(d => d.date))].sort();
}
