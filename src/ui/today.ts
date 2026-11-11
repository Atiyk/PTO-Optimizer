/**
 * The one place a calendar date is derived from an instant (Issue 13).
 *
 * Everything the viewer sees - planner default range, My PTO / forecast "as of", tracker
 * timestamps, expiry guard, ICS book-by clamping, family, sabbatical, landing - uses the
 * viewer's LOCAL calendar date. `toISOString().slice(0, 10)` is the UTC date, which is a
 * different day for hours around midnight in every non-UTC timezone (e.g. 23:30 Dec 31 in
 * Los Angeles is already Jan 1 UTC), so it must not be used for a "today".
 *
 * Its own leaf module so pages that only need the date don't pull the planner state hook
 * (and the solver) into their bundle, and so server code can share it without React.
 */

/** `date` as a local-calendar ISO date (YYYY-MM-DD) in the runtime's timezone. */
export function localDateISO(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Today as the viewer's local calendar date. */
export function todayISO(): string {
  return localDateISO(new Date());
}

/**
 * Server-side "today" (calendar feeds, watch feed, reminder emails, account handlers).
 * A request to those endpoints carries no viewer timezone, so they deliberately use the
 * UTC calendar date. Book-by/expiry reminders are all-day events on fixed dates, so this
 * only decides which day counts as "already past" for a few hours around UTC midnight.
 */
export function utcDateISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}
