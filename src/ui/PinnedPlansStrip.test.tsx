import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PinnedPlansStrip, type PinnedPlanSummary } from './PinnedPlansStrip';

function makeSummary(overrides: Partial<PinnedPlanSummary> = {}): PinnedPlanSummary {
  return { budgetSpent: 15, totalDaysOff: 32, breakCountActual: 5, travelPercentile: 70, ...overrides };
}

describe('PinnedPlansStrip', () => {
  it('shows a hint and an enabled Pin button when nothing is pinned yet', () => {
    const html = renderToStaticMarkup(
      <PinnedPlansStrip pinnedCount={0} summaries={[]} canPin onPin={() => {}} onRestore={() => {}} onRemove={() => {}} />,
    );
    expect(html).toContain('Pin this plan');
    expect(html).not.toContain(' disabled=""');
    expect(html).toContain('Pin up to two plans');
  });

  it('renders a pinned summary in the "Pinned: N days → M off · K breaks · Travel Pth" shape', () => {
    const html = renderToStaticMarkup(
      <PinnedPlansStrip
        pinnedCount={1}
        summaries={[makeSummary()]}
        canPin
        onPin={() => {}}
        onRestore={() => {}}
        onRemove={() => {}}
      />,
    );
    expect(html).toContain('Pinned: 15 days');
    expect(html).toContain('32 off');
    expect(html).toContain('5 breaks');
    expect(html).toContain('Travel 70th');
    expect(html).toContain('restore');
  });

  it('omits the travel percentile when the pinned plan had none (no valid plan at pin time)', () => {
    const html = renderToStaticMarkup(
      <PinnedPlansStrip
        pinnedCount={1}
        summaries={[makeSummary({ travelPercentile: null })]}
        canPin
        onPin={() => {}}
        onRestore={() => {}}
        onRemove={() => {}}
      />,
    );
    expect(html).not.toContain('Travel');
  });

  it('disables the Pin button and explains why once two plans are already pinned', () => {
    const html = renderToStaticMarkup(
      <PinnedPlansStrip
        pinnedCount={2}
        summaries={[makeSummary(), makeSummary({ budgetSpent: 10, totalDaysOff: 20, breakCountActual: 3 })]}
        canPin={false}
        onPin={() => {}}
        onRestore={() => {}}
        onRemove={() => {}}
      />,
    );
    expect(html).toContain(' disabled=""');
    expect(html).toContain('remove one to pin another');
  });
});
