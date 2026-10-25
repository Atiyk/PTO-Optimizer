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
 *
 * Only the alternative's OWN START DAY is ever marked - not every day across its full
 * span. The solver already caps alternatives at 2 per primary break
 * (`MAX_ALTERNATIVES_PER_BREAK` in solve.ts), but an alternative is itself a multi-day
 * break (often 8-20+ days long); painting a dashed outline across its whole date range
 * means a page with a handful of alternative OBJECTS can still render dozens of dashed
 * CELLS - "nearly every day carries a dashed outline" was a real, repeated complaint about
 * exactly this, even though the object-level cap was already holding. One marker cell per
 * alternative is the actual spec: it's a discoverable "there's another placement here,
 * hover to preview, click to swap" affordance, not a full preview of the shifted range -
 * that full range is still shown via the hover-preview band (`previewRun` in App.tsx),
 * which already renders the complete span on hover/focus. With at most
 * MAX_ALTERNATIVES_PER_BREAK alternatives per break, this guarantees at most that many
 * dashed cells per break, verified by counting rendered DOM cells, not by reading this
 * function (see alternativeForDate.test.ts and the live DOM count in NOTES.md).
 */
export function alternativeForDate(
  iso: string,
  alternatives: Alternative[],
  chosenDaySet: ReadonlySet<string>,
  showAlternatives: boolean,
): Alternative | undefined {
  if (!showAlternatives) return undefined;
  if (chosenDaySet.has(iso)) return undefined;
  return alternatives.find((a) => iso === a.start);
}
