import type { RecommendationAlternative } from '../planning/recommendationAlternatives';
import { jointWindowFeasibility, validExternalWindow } from '../personal/recurringAvailability';
import type { AvailabilityWindow, JointWindowFeasibility } from '../personal/recurringAvailability';
import { schoolCoverage } from '../personal/schoolCoverage';
import { validCalendarDate } from '../personal/employerCalendar';

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
    if (!recommendation || !validCalendarDate(recommendation.start)
      || !validCalendarDate(recommendation.end)
      || recommendation.start > recommendation.end
      || recommendation.start < adultA.days[0].date
      || recommendation.end > adultA.days[adultA.days.length - 1].date
      || !Number.isInteger(recommendation.ptoDays) || recommendation.ptoDays < 0
      || !Number.isInteger(recommendation.breakDays) || recommendation.breakDays < 1
      || recommendation.getawayCount !== 1
      || !['longest-break', 'balanced', 'constraint-fit'].includes(recommendation.objective)
      || !Array.isArray(recommendation.hardExcludedDates)
      || !Array.isArray(recommendation.reviewDates)
      || recommendation.hardExcludedDates.length > 1096
      || recommendation.reviewDates.length > 1096
      || !recommendation.hardExcludedDates.every(validCalendarDate)
      || !recommendation.reviewDates.every(validCalendarDate)
      || recommendation.hardExcludedDates.some(date =>
        date >= recommendation.start && date <= recommendation.end)
      || typeof recommendation.explanation !== 'string') return null;
    const a = { ...adultA, days: adultA.days.filter(d => d.date >= recommendation.start && d.date <= recommendation.end) };
    const b = { ...adultB, days: adultB.days.filter(d => d.date >= recommendation.start && d.date <= recommendation.end) };
    const feasibility = jointWindowFeasibility(a, b, budgetA, budgetB);
    const coverage = schoolCoverage(a, b);
    if (!feasibility || !coverage || feasibility.start !== recommendation.start
      || feasibility.end !== recommendation.end
      || recommendation.breakDays !== a.days.length
      || recommendation.ptoDays !== feasibility.ptoDaysA) return null;
    if (!feasibility.possible) { rejected++; continue; }
    // A recommendation can be imported from arbitrary JSON. Never return it by
    // reference: the caller might have attached private calendar details or a
    // fabricated explanation/remaining budget. Rebuild date-only public fields.
    const safeRecommendation: RecommendationAlternative = {
      start: feasibility.start,
      end: feasibility.end,
      ptoDays: feasibility.ptoDaysA,
      breakDays: a.days.length,
      getawayCount: 1,
      hardExcludedDates: [],
      reviewDates: [...feasibility.reviewDates],
      objective: recommendation.objective,
      explanation: `${a.days.length} calendar days using ${feasibility.ptoDaysA} PTO days for adult A and ${feasibility.ptoDaysB} for adult B; ${feasibility.reviewDates.length} advisory date(s) and ${coverage.potentialGapDays} potential school coverage gap(s). No live travel data was used.`,
    };
    const item: JointRecommendation = {
      recommendation: safeRecommendation,
      feasibility,
      potentialSchoolCoverageGapDays: coverage.potentialGapDays,
      needsReview: feasibility.partial || feasibility.reviewDates.length > 0 || coverage.potentialGapDays > 0,
    };
    (item.needsReview ? needsReview : feasible).push(item);
  }
  return { feasible, needsReview, rejected };
}
