import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SolveInput } from '@daysoff/engine/solver/types';
import { fireEvent } from '@testing-library/react';
import { analyzeCanonicalPortfolios } from './canonicalPortfolio';
import type { PortfolioComparisonJob } from './portfolioComparison.worker';
import { suggestPortfolioChanges } from './portfolioSuggestions';
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
  terminated = false;
  postMessage(job: PortfolioComparisonJob) { this.job = job; }
  terminate() { this.terminated = true; }
  /** Mirrors the real worker: the report first, then its verified suggestions. */
  publish(withSuggestions = true) {
    if (!this.job) throw new Error('missing comparison job');
    const { input, calendarIncomplete, allowBudgetChange = true } = this.job;
    const constraints = { dates: [], partial: calendarIncomplete, missingSources: [] };
    const report = analyzeCanonicalPortfolios(input, constraints);
    this.onmessage?.(new MessageEvent('message', { data: { report } }));
    // A terminated worker delivers nothing more, as in a browser.
    if (withSuggestions && report && !this.terminated) {
      const suggestions = suggestPortfolioChanges(input, constraints, report, { allowBudgetChange });
      this.onmessage?.(new MessageEvent('message', { data: { report, suggestions } }));
    }
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
  expect(screen.getByText('Only one plan fits these settings, so there is nothing to compare it with.')).toBeTruthy();
  expect(screen.getByText('Holiday data for these dates is missing or incomplete, so these plans may change. Check the dates before booking.')).toBeTruthy();
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
  expect(screen.getByText(/You have 0 PTO days to plan with|No plan fits/)).toBeTruthy();
});

it('offers verified changes that update the inputs live, and moves focus to the heading', () => {
  const onAddPto = vi.fn();
  const onExtendEnd = vi.fn();
  const zero: SolveInput = { rangeStart: '2027-03-02', rangeEnd: '2027-03-02', budget: 0, offDays: [], w: 0, breakCount: 3 };
  render(<PortfolioComparison input={zero} minimumBreakDays={0} calendarIncomplete={false} budget={0} reservedDays={0} onSetBudget={onAddPto} onExtendEnd={onExtendEnd} />);
  act(() => vi.runOnlyPendingTimers());
  act(() => ComparisonWorker.current.publish());
  expect(screen.getByText('You have 0 PTO days to plan with, so there are no plans to compare.')).toBeTruthy();
  // Announced through the panel's existing polite live region, not a nested one.
  const note = screen.getByText('To compare more plans, try one of these. Each was checked with your other settings.');
  expect(note.closest('[aria-live="polite"]')).toBeTruthy();
  expect(screen.getByText('· 1 plan')).toBeTruthy();
  const add = screen.getByRole('button', { name: 'Add 1 PTO day' });
  expect(add.getAttribute('type')).toBe('button');
  fireEvent.click(add);
  expect(onAddPto).toHaveBeenCalledWith(1);
  expect(document.activeElement?.textContent).toBe('Compare recommendation goals');
  expect(screen.queryByRole('button', { name: /generate|submit|calculate/i })).toBeNull();
});

it('shows an end-date suggestion only when it was verified, and none while suggestions are pending', () => {
  const onExtendEnd = vi.fn();
  const tiny: SolveInput = { rangeStart: '2027-03-02', rangeEnd: '2027-03-02', budget: 3, offDays: [], w: 0, breakCount: 3 };
  render(<PortfolioComparison input={tiny} minimumBreakDays={0} calendarIncomplete={false} budget={0} reservedDays={0} onSetBudget={vi.fn()} onExtendEnd={onExtendEnd} />);
  act(() => vi.runOnlyPendingTimers());
  act(() => ComparisonWorker.current.publish(false));
  expect(screen.getByText('Only one plan fits these settings, so there is nothing to compare it with.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /^End on/ })).toBeNull();
  act(() => ComparisonWorker.current.publish());
  fireEvent.click(screen.getByRole('button', { name: 'End on Apr 30, 2027' }));
  expect(onExtendEnd).toHaveBeenCalledWith('2027-04-30');
});

it('never offers a PTO change for unlimited PTO', () => {
  const zero: SolveInput = { rangeStart: '2027-03-02', rangeEnd: '2027-03-02', budget: 0, offDays: [], w: 0, breakCount: 3 };
  render(<PortfolioComparison input={zero} minimumBreakDays={0} calendarIncomplete={false} allowBudgetChange={false} budget={0} reservedDays={0} onSetBudget={vi.fn()} onExtendEnd={vi.fn()} />);
  act(() => vi.runOnlyPendingTimers());
  act(() => ComparisonWorker.current.publish());
  expect(screen.queryByRole('button', { name: /PTO day/ })).toBeNull();
});

it('names the field value to set when reserved days would absorb an added day', () => {
  const onSetBudget = vi.fn();
  const zero: SolveInput = { rangeStart: '2027-03-02', rangeEnd: '2027-03-02', budget: 0, offDays: [], w: 0, breakCount: 3 };
  render(<PortfolioComparison input={zero} minimumBreakDays={0} calendarIncomplete={false} budget={0} reservedDays={3} onSetBudget={onSetBudget} onExtendEnd={vi.fn()} />);
  act(() => vi.runOnlyPendingTimers());
  act(() => ComparisonWorker.current.publish());
  fireEvent.click(screen.getByRole('button', { name: 'Set PTO days to 4' }));
  expect(screen.getByText('· 1 plan · 3 kept in reserve')).toBeTruthy();
  expect(onSetBudget).toHaveBeenCalledWith(4);
});
