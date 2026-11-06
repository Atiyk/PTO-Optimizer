/** Today as the viewer's local calendar date. Its own module so pages that only need the date
 * don't pull the whole planner state hook (and the solver) into their bundle. */
export function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
