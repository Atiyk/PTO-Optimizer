import type { Alternative } from '../solver/types';

/**
 * Pulled out of useAppState.ts as a standalone pure function, same reasoning as
 * dayCategory.ts: this is where a real bug lived (see NOTES.md) and it's worth keeping
 * directly unit-testable rather than only reachable through the full hook.
 *
 * An alternative "replaces" a break by shifting its placement, so its own date range
 * routinely overlaps the SAME break it replaces - e.g. the same 9-day window shifted one
 * day later shares 8 of those 9 days. Without excluding `chosenDaySet` (every day already
 * part of some primary break), a day that is already that break's own suggested-PTO or
 * weekend/holiday day would ALSO match the alternative covering that date: rendered with a
 * dashed "alternative" outline, labelled "alternative placement" instead of "suggested PTO
 * day", and - via DayCell's isAlternative branch - a click on it would swap the whole break
 * instead of toggling that one day. A day already spoken for by a real break is never also
 * "an alternative".
 */
export function alternativeForDate(
  iso: string,
  alternatives: Alternative[],
  chosenDaySet: ReadonlySet<string>,
  showAlternatives: boolean,
): Alternative | undefined {
  if (!showAlternatives) return undefined;
  if (chosenDaySet.has(iso)) return undefined;
  return alternatives.find((a) => iso >= a.start && iso <= a.end);
}
