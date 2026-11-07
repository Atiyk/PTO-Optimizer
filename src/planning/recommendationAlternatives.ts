import { isoToSerial } from '@daysoff/engine/solver/dateUtils';
import { validCalendarDate } from '../personal/employerCalendar';
/** Consumer-only deterministic candidate ranking. No shared solver modifications. */
export interface RecommendationCandidate {
  start: string;
  end: string;
  ptoDays: number;
  breakDays: number;
  getawayCount: number;
  hardExcludedDates: readonly string[];
  reviewDates: readonly string[];
}
export interface RecommendationAlternative extends RecommendationCandidate {
  objective: 'longest-break' | 'most-getaways' | 'balanced' | 'constraint-fit';
  explanation: string;
}
const objectives = ['longest-break', 'most-getaways', 'balanced', 'constraint-fit'] as const;
function valid(c: RecommendationCandidate, budget: number): boolean {
  if (!c || !validCalendarDate(c.start) || !validCalendarDate(c.end) || c.start > c.end
    || !Array.isArray(c.hardExcludedDates) || !Array.isArray(c.reviewDates)
    || c.hardExcludedDates.length > 1096 || c.reviewDates.length > 1096) return false;
  const actualSpan = isoToSerial(c.end) - isoToSerial(c.start) + 1;
  return actualSpan > 0 && actualSpan <= 1096
    && Number.isInteger(c.ptoDays) && c.ptoDays >= 0 && c.ptoDays <= budget
    && c.ptoDays <= actualSpan
    && Number.isInteger(c.breakDays) && c.breakDays === actualSpan
    && Number.isInteger(c.getawayCount) && c.getawayCount >= 0 && c.getawayCount <= actualSpan
    && c.hardExcludedDates.every(validCalendarDate) && c.reviewDates.every(validCalendarDate)
    && !c.hardExcludedDates.some(d => d >= c.start && d <= c.end);
}
function score(c: RecommendationCandidate, objective: typeof objectives[number]): number {
  switch (objective) {
    case 'longest-break': return c.breakDays * 100 - c.ptoDays;
    case 'most-getaways': return c.getawayCount * 100 - c.ptoDays;
    case 'balanced': return c.breakDays * 4 + c.getawayCount * 7 - c.ptoDays * 3 - c.reviewDates.length * 2;
    case 'constraint-fit': return c.breakDays - c.ptoDays * 2 - c.reviewDates.length * 10;
  }
}
/** Only ranks supplied, independently verified solver candidates; does not invent PTO plans. */
export function selectRecommendationAlternatives(candidates: readonly RecommendationCandidate[], budget: number): RecommendationAlternative[] {
  if (!Number.isInteger(budget) || budget < 0 || candidates.length > 10000) return [];
  const feasible = candidates.filter(c => valid(c, budget)).map(c => ({
    ...c,
    reviewDates: [...new Set(c.reviewDates.filter(d => d >= c.start && d <= c.end))].sort(),
  }));
  const used: RecommendationCandidate[] = [];
  const output: RecommendationAlternative[] = [];
  for (const objective of objectives) {
    const ranked = [...feasible].sort((a, b) => score(b, objective) - score(a, objective)
      || a.start.localeCompare(b.start) || a.end.localeCompare(b.end) || a.ptoDays - b.ptoDays);
    const winner = ranked.find(c => !used.some(other => c.start <= other.end && other.start <= c.end));
    if (!winner) continue;
    used.push(winner);
    output.push({ ...winner, objective,
      explanation: `${winner.breakDays} calendar days away using ${winner.ptoDays} PTO days; ${winner.reviewDates.length} advisory dates need review. No hard exclusions.` });
  }
  return output;
}
