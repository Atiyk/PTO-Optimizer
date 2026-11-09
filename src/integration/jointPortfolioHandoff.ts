import { normalizePortfolioBreaks } from '../planning/canonicalPortfolio';
import type { CanonicalPortfolio } from '../planning/canonicalPortfolio';
import type { AvailabilityWindow, JointWindowFeasibility } from '../personal/recurringAvailability';
import { jointWindowFeasibility, validExternalWindow } from '../personal/recurringAvailability';
import { schoolCoverage } from '../personal/schoolCoverage';
import { validCalendarDate } from '../personal/employerCalendar';

/** A portfolio is a replacement scenario, not a collection of independently funded suggestions. */
export interface JointPortfolioResult {
  portfolio: CanonicalPortfolio;
  ptoDaysA: number;
  ptoDaysB: number;
  potentialSchoolCoverageGapDays: number;
  needsReview: boolean;
}
export interface JointPortfolioHandoff {
  feasible: JointPortfolioResult[];
  needsReview: JointPortfolioResult[];
  rejected: number;
}

/** Validates each break and aggregates both adults' costs across the WHOLE portfolio.
 * Returns null for malformed/partial date coverage rather than presenting false feasibility.
 * Private calendar event text is never copied to the output.
 */
export function filterJointPortfolios(
  portfolios: readonly CanonicalPortfolio[],
  adultA: AvailabilityWindow,
  adultB: AvailabilityWindow,
  budgetA: number,
  budgetB: number,
): JointPortfolioHandoff | null {
  if (!Array.isArray(portfolios) || portfolios.length > 10000
    || !validExternalWindow(adultA) || !validExternalWindow(adultB)
    || adultA.days.length !== adultB.days.length
    || adultA.days.some((day, i) => day.date !== adultB.days[i].date)
    || !Number.isInteger(budgetA) || !Number.isInteger(budgetB)
    || budgetA < 0 || budgetB < 0 || budgetA > 1096 || budgetB > 1096) return null;
  const feasible: JointPortfolioResult[] = [];
  const needsReview: JointPortfolioResult[] = [];
  let rejected = 0;
  for (const portfolio of portfolios) {
    if (!portfolio || !Array.isArray(portfolio.breaks) || !portfolio.breaks.length
      || portfolio.breaks.length > 1096) return null;
    const normalized = normalizePortfolioBreaks(portfolio.breaks);
    // Adjacent fragments are one continuous getaway; reject misleading metadata rather than silently relabeling it.
    if (!normalized || normalized.length !== portfolio.breaks.length
      || portfolio.getawayCount !== normalized.length
      || portfolio.longestBreakDays !== Math.max(...normalized.map(b => b.calendarDays))
      || portfolio.totalCalendarDays !== normalized.reduce((n, b) => n + b.calendarDays, 0)
      || portfolio.ptoDays !== normalized.reduce((n, b) => n + b.ptoDays, 0)
      || !Number.isInteger(portfolio.budgetRemaining) || portfolio.budgetRemaining < 0
      || portfolio.travelSignal !== 'not-used'
      || typeof portfolio.explanation !== 'string'
      || !Array.isArray(portfolio.freeCalendarDates) || !Array.isArray(portfolio.reviewDates)
      || typeof portfolio.partialCalendarEvidence !== 'boolean'
      || !['most-getaways', 'longest-break', 'balanced', 'constraint-fit'].includes(portfolio.objective)
      || portfolio.freeCalendarDates.length > 1096 || portfolio.reviewDates.length > 1096
      || !portfolio.freeCalendarDates.every(validCalendarDate)
      || !portfolio.reviewDates.every(validCalendarDate)) return null;
    let totalA = 0;
    let totalB = 0;
    let gaps = 0;
    let review = Boolean(portfolio.partialCalendarEvidence);
    let impossible = false;
    const reviewDates = new Set<string>();
    const freeDates = new Set<string>();
    let previousEnd = '';
    for (const brk of normalized) {
      if (!brk || typeof brk.start !== 'string' || typeof brk.end !== 'string'
        || brk.start > brk.end || brk.start <= previousEnd
        || brk.start < adultA.days[0].date
        || brk.end > adultA.days[adultA.days.length - 1].date) return null;
      const a = { ...adultA, days: adultA.days.filter(d => d.date >= brk.start && d.date <= brk.end) };
      const b = { ...adultB, days: adultB.days.filter(d => d.date >= brk.start && d.date <= brk.end) };
      const joint: JointWindowFeasibility | null = jointWindowFeasibility(a, b, 1096, 1096);
      const coverage = schoolCoverage(a, b);
      if (!joint || !coverage || joint.start !== brk.start || joint.end !== brk.end
        || a.days.length !== brk.calendarDays || b.days.length !== brk.calendarDays) return null;
      if (!joint.possible) impossible = true;
      totalA += joint.ptoDaysA;
      totalB += joint.ptoDaysB;
      gaps += coverage.potentialGapDays;
      review ||= joint.partial || joint.reviewDates.length > 0;
      joint.reviewDates.forEach(date => reviewDates.add(date));
      a.days.filter(day => day.alreadyOff).forEach(day => freeDates.add(day.date));
      previousEnd = brk.end;
    }
    // A plan's own PTO charge must be consistent with adult A's canonical calendar.
    // A separate adult may have a different schedule or employer holidays.
    if (totalA !== portfolio.ptoDays || impossible || totalA > budgetA || totalB > budgetB) {
      rejected++;
      continue;
    }
    // Never pass through caller-controlled explanations, dates, or remaining balance.
    // Rebuild all outward-facing metadata from the verified date-only calendars.
    const safePortfolio: CanonicalPortfolio = {
      objective: portfolio.objective,
      // CanonicalPortfolio may originate from imported JSON. Whitelist break fields:
      // normalizePortfolioBreaks preserves unknown enumerable keys via object spread.
      breaks: normalized.map(brk => ({
        start: brk.start, end: brk.end, calendarDays: brk.calendarDays, ptoDays: brk.ptoDays,
      })),
      getawayCount: normalized.length,
      longestBreakDays: Math.max(...normalized.map(b => b.calendarDays)),
      totalCalendarDays: normalized.reduce((n, b) => n + b.calendarDays, 0),
      ptoDays: totalA,
      budgetRemaining: budgetA - totalA,
      freeCalendarDates: [...freeDates].sort(),
      reviewDates: [...reviewDates].sort(),
      partialCalendarEvidence: review && (adultA.partial || adultB.partial),
      travelSignal: 'not-used',
      explanation: `${normalized.length} separate break(s), ${normalized.reduce((n, b) => n + b.calendarDays, 0)} calendar days using ${totalA} PTO days for adult A and ${totalB} for adult B. ${reviewDates.size} advisory date(s) need review. Travel demand was not used.`,
    };
    const result: JointPortfolioResult = {
      portfolio: safePortfolio, ptoDaysA: totalA, ptoDaysB: totalB,
      potentialSchoolCoverageGapDays: gaps,
      needsReview: review || gaps > 0,
    };
    (result.needsReview ? needsReview : feasible).push(result);
  }
  return { feasible, needsReview, rejected };
}
