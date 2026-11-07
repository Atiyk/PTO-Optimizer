import type { ConstraintSet } from '../personal/dateConstraints';
import type { RecommendationCandidate } from './recommendationAlternatives';
import { validCalendarDate } from '../personal/employerCalendar';

/**
 * Consumer-only adapter: derive candidate conflicts from canonical calendar facts.
 * Invoke before ranking; upstream candidate generation must also receive hard exclusions.
 * Never trust a caller-provided empty hardExcludedDates array as proof of feasibility.
 */
export function applyDateConstraints(
  candidates: readonly RecommendationCandidate[],
  set: ConstraintSet,
): RecommendationCandidate[] | null {
  if (!set || !Array.isArray(set.dates) || set.dates.length > 10000
    || !Array.isArray(candidates) || candidates.length > 10000
    || !set.dates.every(d => d && validCalendarDate(d.date)
      && ['hard-block', 'review-needed', 'context'].includes(d.severity))) return null;
  const hard = new Set(set.dates.filter(d => d.severity === 'hard-block').map(d => d.date));
  const review = new Set(set.dates.filter(d => d.severity === 'review-needed').map(d => d.date));
  const output: RecommendationCandidate[] = [];
  for (const c of candidates) {
    if (!c || !validCalendarDate(c.start) || !validCalendarDate(c.end) || c.end < c.start) return null;
    const blocked = [...hard, ...(c.hardExcludedDates || [])].some(d => d >= c.start && d <= c.end);
    if (blocked) continue;
    output.push({
      ...c,
      hardExcludedDates: [],
      reviewDates: [...new Set([...review, ...(c.reviewDates || [])].filter(d => d >= c.start && d <= c.end))].sort(),
    });
  }
  return output;
}
