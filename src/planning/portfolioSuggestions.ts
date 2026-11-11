import type { SolveInput } from '@daysoff/engine/solver/types';
import { isoToSerial } from '@daysoff/engine/solver/dateUtils';
import { analyzeCanonicalPortfolios } from './canonicalPortfolio';
import type { CanonicalPortfolioReport, PortfolioOptions } from './canonicalPortfolio';
import type { ConstraintSet } from './constraintRecommendationAdapter';

/**
 * Issue 8: concrete changes that were re-run through the same bounded search and found
 * more distinct plans. Nothing here is a guess: a change that does not add a plan is
 * never suggested. `portfolioCount` is the number of plans the changed settings showed.
 */
export type PortfolioSuggestion =
  | { kind: 'add-pto'; extraDays: number; portfolioCount: number }
  | { kind: 'extend-end'; rangeEnd: string; portfolioCount: number };

export interface SuggestionOptions extends PortfolioOptions {
  /** False for unlimited PTO, where the planner's day count is a target, not a balance. */
  allowBudgetChange?: boolean;
}

const EXTRA_PTO_STEPS = [1, 2, 3, 5] as const;
const EXTEND_MONTHS = [1, 3] as const;
const MAX_RANGE_DAYS = 1096;
const MAX_BUDGET = 1096;

/** Last day of the month `months` after the month containing `iso`. */
function endOfMonthAfter(iso: string, months: number): string {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7)) - 1 + months;
  const last = new Date(Date.UTC(year, month + 1, 0));
  return last.toISOString().slice(0, 10);
}

export function applyPortfolioSuggestion(input: SolveInput, suggestion: PortfolioSuggestion): SolveInput {
  return suggestion.kind === 'add-pto'
    ? { ...input, budget: input.budget + suggestion.extraDays }
    : { ...input, rangeEnd: suggestion.rangeEnd };
}

/** At most one PTO and one end-date suggestion, each the smallest tested change that helps. */
export function suggestPortfolioChanges(
  input: SolveInput, constraints: ConstraintSet, report: CanonicalPortfolioReport, options: SuggestionOptions = {},
): PortfolioSuggestion[] {
  const current = report.portfolios.length;
  if (current >= 3) return [];
  const { allowBudgetChange = true, ...searchOptions } = options;
  const verified = (candidate: PortfolioSuggestion): PortfolioSuggestion | null => {
    const changed = analyzeCanonicalPortfolios(applyPortfolioSuggestion(input, candidate), constraints, searchOptions);
    const found = changed?.portfolios.length ?? 0;
    return found > current ? { ...candidate, portfolioCount: found } : null;
  };
  const out: PortfolioSuggestion[] = [];
  if (allowBudgetChange) {
    for (const extraDays of EXTRA_PTO_STEPS) {
      if (input.budget + extraDays > MAX_BUDGET) break;
      const hit = verified({ kind: 'add-pto', extraDays, portfolioCount: 0 });
      if (hit) { out.push(hit); break; }
    }
  }
  for (const months of EXTEND_MONTHS) {
    const rangeEnd = endOfMonthAfter(input.rangeEnd, months);
    if (isoToSerial(rangeEnd) - isoToSerial(input.rangeStart) >= MAX_RANGE_DAYS) break;
    const hit = verified({ kind: 'extend-end', rangeEnd, portfolioCount: 0 });
    if (hit) { out.push(hit); break; }
  }
  return out;
}
