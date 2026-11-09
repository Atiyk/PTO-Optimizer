import type { RecommendationAlternative } from '../planning/recommendationAlternatives';
import { jointWindowFeasibility, validExternalWindow } from '../personal/recurringAvailability';
import type { AvailabilityWindow, JointWindowFeasibility } from '../personal/recurringAvailability';
import { schoolCoverage } from '../personal/schoolCoverage';

/** Couple-facing handoff: never treat an adult-A-only solver result as jointly feasible. */
export interface JointRecommendation {
  recommendation: RecommendationAlternative;
  feasibility: JointWindowFeasibility;
  potentialSchoolCoverageGapDays: number;
  /** Partial calendars or advisory commitments prevent an unqualified assurance. */
  needsReview: boolean;
}

export interface JointRecommendationHandoff {
  feasible: JointRecommendation[];
  needsReview: JointRecommendation[];
  rejected: number;
}

/** Fails closed for invalid/gapped input; no private event details are copied to output. */
export function filterJointRecommendations(
  solo: readonly RecommendationAlternative[],
  adultA: AvailabilityWindow,
  adultB: AvailabilityWindow,
  budgetA: number,
  budgetB: number,
): JointRecommendationHandoff | null {
  if (!Array.isArray(solo) || solo.length > 10000
    || !validExternalWindow(adultA) || !validExternalWindow(adultB)
    || adultA.days.length !== adultB.days.length
    || adultA.days.some((d, i) => d.date !== adultB.days[i].date)
    || !Number.isInteger(budgetA) || !Number.isInteger(budgetB)
    || budgetA < 0 || budgetB < 0 || budgetA > 1096 || budgetB > 1096) return null;
  const feasible: JointRecommendation[] = [];
  const needsReview: JointRecommendation[] = [];
  let rejected = 0;
  for (const recommendation of solo) {
    if (!recommendation || typeof recommendation.start !== 'string'
      || typeof recommendation.end !== 'string'
      || recommendation.start > recommendation.end
      || recommendation.start < adultA.days[0].date
      || recommendation.end > adultA.days[adultA.days.length - 1].date) return null;
    const a = { ...adultA, days: adultA.days.filter(d => d.date >= recommendation.start && d.date <= recommendation.end) };
    const b = { ...adultB, days: adultB.days.filter(d => d.date >= recommendation.start && d.date <= recommendation.end) };
    const feasibility = jointWindowFeasibility(a, b, budgetA, budgetB);
    const coverage = schoolCoverage(a, b);
    if (!feasibility || !coverage || feasibility.start !== recommendation.start
      || feasibility.end !== recommendation.end) return null;
    if (!feasibility.possible) { rejected++; continue; }
    const item: JointRecommendation = {
      recommendation,
      feasibility,
      potentialSchoolCoverageGapDays: coverage.potentialGapDays,
      needsReview: feasibility.partial || feasibility.reviewDates.length > 0 || coverage.potentialGapDays > 0,
    };
    (item.needsReview ? needsReview : feasible).push(item);
  }
  return { feasible, needsReview, rejected };
}
