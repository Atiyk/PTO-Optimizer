/** Why a settled plan has no break, in the person's terms (no PTO, all of it reserved, or no fit). */
export function noBreaksMessage(budget: number, effectiveBudget: number): string {
  if (!(budget > 0)) return 'You have no PTO days to place. Weekends and public holidays still show on the calendar.';
  if (!(effectiveBudget > 0)) return budget === 1 ? 'Your 1 PTO day is kept in reserve. Lower the reserve to plan breaks.' : `All ${budget} PTO days are kept in reserve. Lower the reserve to plan breaks.`;
  return 'No break fits these dates and settings. Try a longer date range or more PTO days.';
}
