import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SolveInput } from '@daysoff/engine/solver/types';
import { analyzeCanonicalPortfolios } from './canonicalPortfolio';
import type { PortfolioComparisonJob } from './portfolioComparison.worker';
import { PortfolioComparison } from './PortfolioComparison';

const input: SolveInput = {
  rangeStart: '2027-01-04', rangeEnd: '2027-01-04',
  budget: 1, offDays: [], w: 0, breakCount: 1,
};
class ComparisonWorker {
  static current: ComparisonWorker;
  job?: PortfolioComparisonJob;
  onmessage?: (event: MessageEvent) => void;

  constructor() { ComparisonWorker.current = this; }
  postMessage(job: PortfolioComparisonJob) { this.job = job; }
  terminate() {}
  publish() {
    if (!this.job) throw new Error('missing comparison job');
    const { input, calendarIncomplete } = this.job;
    const data = analyzeCanonicalPortfolios(input, { dates: [], partial: calendarIncomplete, missingSources: [] });
    this.onmessage?.(new MessageEvent('message', { data }));
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('Worker', ComparisonWorker);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('renders the verified scenario and a shortfall grounded in the search', () => {
  render(<PortfolioComparison input={input} minimumBreakDays={0} calendarIncomplete />);
  expect(screen.getByText('Finding feasible plans…')).toBeTruthy();
  act(() => vi.runOnlyPendingTimers());
  act(() => ComparisonWorker.current.publish());
  expect(screen.getByText('Longest break')).toBeTruthy();
  expect(screen.getByText('The search found one unique feasible plan for these settings.')).toBeTruthy();
  expect(screen.getByText('Some calendar sources are missing or incomplete. Check the dates before booking.')).toBeTruthy();
});

it('waits for current constraints rather than showing a superseded scenario', () => {
  const { rerender } = render(<PortfolioComparison input={input} minimumBreakDays={0} calendarIncomplete={false} />);
  act(() => vi.runOnlyPendingTimers());
  const superseded = ComparisonWorker.current;
  rerender(<PortfolioComparison input={input} minimumBreakDays={2} calendarIncomplete={false} />);
  act(() => superseded.publish());
  expect(screen.queryByText('Longest break')).toBeNull();
  expect(screen.getByText('Finding feasible plans…')).toBeTruthy();
  act(() => vi.runOnlyPendingTimers());
  act(() => ComparisonWorker.current.publish());
  expect(screen.getByText(/The search found no plan that fits/)).toBeTruthy();
});
