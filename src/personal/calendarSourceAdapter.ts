import { validCalendarDate } from './employerCalendar';
import type { AvailabilityInputs } from './recurringAvailability';

/** Date-only, bounded local calendar adapter. Never exports event titles or attendees. */
export interface CalendarSource {
  source: 'ics' | 'manual';
  completeness: 'complete' | 'partial';
  events: readonly { start: string; end: string; blocking: 'hard' | 'review' | 'context' }[];
  truncated?: boolean;
}
export interface CalendarSourceResult {
  hardBlockDays: string[];
  advisoryBusyDays: string[];
  contextDays: string[];
  partial: boolean;
  warnings: string[];
}
const DAY = 86400000;
function serial(date: string): number { return Date.parse(date + 'T00:00:00Z') / DAY; }
function iso(n: number): string { return new Date(n * DAY).toISOString().slice(0, 10); }

/** Calendar events use inclusive ISO dates; convert exclusive ICS DTEND before invoking. */
export function normalizeCalendarSources(sources: readonly CalendarSource[]): CalendarSourceResult | null {
  if (!Array.isArray(sources) || sources.length > 16) return null;
  const hard = new Set<string>(), review = new Set<string>(), context = new Set<string>();
  const warnings: string[] = [];
  let total = 0;
  for (const source of sources) {
    if (!source || !['ics', 'manual'].includes(source.source)
      || !['complete', 'partial'].includes(source.completeness)
      || !Array.isArray(source.events) || source.events.length > 2000) return null;
    if (source.completeness === 'partial' || source.truncated) warnings.push('Calendar coverage is incomplete');
    for (const event of source.events) {
      if (!event || !validCalendarDate(event.start) || !validCalendarDate(event.end)
        || event.start > event.end || !['hard', 'review', 'context'].includes(event.blocking)) return null;
      const start = serial(event.start), end = serial(event.end);
      if (end - start > 366 || total + end - start + 1 > 4000) return null;
      total += end - start + 1;
      const target = event.blocking === 'hard' ? hard : event.blocking === 'review' ? review : context;
      for (let d = start; d <= end; d++) target.add(iso(d));
    }
  }
  return {
    hardBlockDays: [...hard].sort(), advisoryBusyDays: [...review].sort(),
    contextDays: [...context].sort(), partial: warnings.length > 0,
    warnings: [...new Set(warnings)],
  };
}
/** Explicitly merge dates without replacing independently supplied employer or approved leave. */
export function applyCalendarSources(base: AvailabilityInputs, result: CalendarSourceResult): AvailabilityInputs {
  return {
    ...base,
    hardBlockDays: [...new Set([...(base.hardBlockDays || []), ...result.hardBlockDays])].sort(),
    advisoryBusyDays: [...new Set([...(base.advisoryBusyDays || []), ...result.advisoryBusyDays])].sort(),
    calendarPartial: base.calendarPartial !== false || result.partial,
  };
}
