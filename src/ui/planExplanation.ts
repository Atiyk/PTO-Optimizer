/** A deterministic, plan-level explanation. No AI calls, new solver, or inferred law.
 * The optimizer already computes totalDaysOff and budgetSpent; their difference is
 * calendar days in selected breaks that do not consume NEW PTO in this plan.
 * Such days may include weekends, employer-observed holidays or configured off-days.
 */
export interface PlanExplanationInput {
  budgetSpent: number;
  totalDaysOff: number;
  weighting: number;
}

export interface PlanExplanation {
  calendar: string;
  preference: string;
}

function plural(value: number, singular: string): string {
  return `${value} ${singular}${value === 1 ? '' : 's'}`;
}

export function explainPlan({ budgetSpent, totalDaysOff, weighting }: PlanExplanationInput): PlanExplanation | null {
  if (!Number.isFinite(totalDaysOff) || !Number.isFinite(budgetSpent) || totalDaysOff <= 0) return null;
  const used = Math.max(0, Math.floor(budgetSpent));
  const off = Math.max(0, Math.floor(totalDaysOff));
  const noNewPto = Math.max(0, off - used);
  const calendar = noNewPto > 0
    ? `${plural(noNewPto, 'day')} in this plan ${noNewPto === 1 ? 'does' : 'do'} not use additional PTO. Those dates are already off under your selected workweek, employer-observed holidays or other calendar settings.`
    : 'This plan does not gain extra calendar days from your configured days off. It may still fit a travel-demand preference or other constraints.';
  const weight = Number.isFinite(weighting) ? Math.max(0, Math.min(100, Math.round(weighting))) : 0;
  const preference = weight === 0
    ? 'Your current setting prioritizes total days off over travel demand.'
    : weight === 100
      ? 'Your current setting prioritizes quieter travel periods, even when that means fewer days off.'
      : `Your travel preference is ${weight}/100; the solver weighs quieter travel periods alongside days off.`;
  return { calendar, preference };
}
