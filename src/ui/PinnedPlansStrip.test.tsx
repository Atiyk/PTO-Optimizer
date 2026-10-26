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

  it('renders a pinned summary in the "Pinned: N days → M off · K breaks · Travel Pth" shape', () => {
    const html = renderToStaticMarkup(
      <PinnedPlansStrip summaries={[makeSummary()]} onRestore={() => {}} onRemove={() => {}} />,
    );
    expect(html).toContain('Pinned: 15 days');
    expect(html).toContain('32 off');
    expect(html).toContain('5 breaks');
    expect(html).toContain('Travel 70th');
    expect(html).toContain('restore');
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
    expect(html).toContain('Pinned: 15 days');
    expect(html).toContain('Pinned: 10 days');
  });
});
