import type { SolveInput } from '@daysoff/engine/solver/types';
import { analyzeCanonicalPortfolios } from './canonicalPortfolio';
import type { CanonicalPortfolioReport } from './canonicalPortfolio';
import { suggestPortfolioChanges } from './portfolioSuggestions';
import type { PortfolioSuggestion } from './portfolioSuggestions';

export interface PortfolioComparisonJob {
  input: SolveInput;
  calendarIncomplete: boolean;
  /** False for unlimited PTO: never suggest a different day count there. */
  allowBudgetChange?: boolean;
}

/** Two messages: the report as soon as it exists, then the verified suggestions
 * (`suggestions` undefined in the first). Suggestions re-run the search, so they
 * never hold back the plans themselves. */
export interface PortfolioComparisonResult {
  report: CanonicalPortfolioReport | null;
  suggestions?: PortfolioSuggestion[];
}

self.addEventListener('message', (event: MessageEvent<PortfolioComparisonJob>) => {
  const { input, calendarIncomplete, allowBudgetChange = true } = event.data;
  const constraints = { dates: [], partial: calendarIncomplete, missingSources: [] };
  const report = analyzeCanonicalPortfolios(input, constraints);
  if (!report || report.portfolios.length >= 3) {
    self.postMessage({ report, suggestions: [] } satisfies PortfolioComparisonResult);
    return;
  }
  self.postMessage({ report } satisfies PortfolioComparisonResult);
  self.postMessage({ report, suggestions: suggestPortfolioChanges(input, constraints, report, { allowBudgetChange }) } satisfies PortfolioComparisonResult);
});
