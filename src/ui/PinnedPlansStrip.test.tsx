import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PinnedPlansStrip, type PinnedPlanSummary } from './PinnedPlansStrip';

function makeSummary(overrides: Partial<PinnedPlanSummary> = {}): PinnedPlanSummary {
  return { budgetSpent: 15, totalDaysOff: 32, breakCountActual: 5, travelPercentile: 70, ...overrides };
}

describe('PinnedPlansStrip (UI density pass: chips only - the Pin button/hint moved into Headline)', () => {
  it('renders nothing at all when nothing is pinned yet', () => {
    const html = renderToStaticMarkup(<PinnedPlansStrip summaries={[]} onRestore={() => {}} onRemove={() => {}} />);
    expect(html).toBe('');
  });

  it('names PTO days, days off, and break count in a saved scenario', () => {
    const html = renderToStaticMarkup(
      <PinnedPlansStrip summaries={[makeSummary()]} onRestore={() => {}} onRemove={() => {}} />,
    );
    expect(html).toContain('15 PTO days');
    expect(html).toContain('32 days off');
    expect(html).toContain('5 breaks');
    expect(html).not.toContain('Travel 70th');
    expect(html).toContain('Restore');
  });

  it('omits the travel percentile when the pinned plan had none (no valid plan at pin time)', () => {
    const html = renderToStaticMarkup(
      <PinnedPlansStrip summaries={[makeSummary({ travelPercentile: null })]} onRestore={() => {}} onRemove={() => {}} />,
    );
    expect(html).not.toContain('Travel');
  });

  it('renders two pinned chips when two plans are pinned', () => {
    const html = renderToStaticMarkup(
      <PinnedPlansStrip
        summaries={[makeSummary(), makeSummary({ budgetSpent: 10, totalDaysOff: 20, breakCountActual: 3 })]}
        onRestore={() => {}}
        onRemove={() => {}}
      />,
    );
    expect(html).toContain('15 PTO days');
    expect(html).toContain('10 PTO days');
  });
});
