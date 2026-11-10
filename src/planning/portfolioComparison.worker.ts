import type { SolveInput } from '@daysoff/engine/solver/types';
import { analyzeCanonicalPortfolios } from './canonicalPortfolio';

export interface PortfolioComparisonJob {
  input: SolveInput;
  calendarIncomplete: boolean;
}

self.addEventListener('message', (event: MessageEvent<PortfolioComparisonJob>) => {
  const { input, calendarIncomplete } = event.data;
  self.postMessage(analyzeCanonicalPortfolios(input, { dates: [], partial: calendarIncomplete, missingSources: [] }));
});
