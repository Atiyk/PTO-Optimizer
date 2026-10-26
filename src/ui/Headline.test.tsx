import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { headlineText, Headline } from './Headline';

describe('headlineText (Phase 3.1: reserve days read as deliberate, never as unspent budget)', () => {
  it('leads with "N of M days planned · R kept in reserve" when a reserve is set', () => {
    expect(headlineText(12, 15, 3, 26)).toBe('12 of 15 days planned · 3 kept in reserve → 26 days off');
  });

  it('falls back to the plain "N PTO days → M days off" phrasing when reserve is 0', () => {
    // A reserve of zero is the user explicitly choosing to plan with their whole balance -
    // nothing to call out, so the headline reverts to the pre-Phase-3 format.
    expect(headlineText(15, 15, 0, 36)).toBe('15 PTO days → 36 days off');
  });

  it('pluralizes each word independently (budget=1, totalDaysOff=1)', () => {
    expect(headlineText(1, 1, 0, 1)).toBe('1 PTO day → 1 day off');
    expect(headlineText(0, 1, 1, 1)).toBe('0 of 1 day planned · 1 kept in reserve → 1 day off');
  });

  it('never says "add no days off at any position" or any unspent-budget wording - that belongs to a different, separate message', () => {
    const text = headlineText(12, 15, 3, 26);
    expect(text).not.toContain('add no days off');
    expect(text).not.toContain('Using');
  });
});

describe('Headline render', () => {
  it('shows the reserve-aware headline live when reserveDays > 0', () => {
    const html = renderToStaticMarkup(
      <Headline
        budgetSpent={12}
        totalDaysOff={26}
        breakCountActual={5}
        scores={null}
        budget={15}
        reserveDays={3}
        canPin={true}
        onPin={() => {}}
        pinnedCount={0}
      />,
    );
    expect(html).toContain('12 of 15 days planned');
    expect(html).toContain('3 kept in reserve');
  });

  it('UI density pass: the result, break count, and Travel/Efficiency percentiles render as one flowing line, no separate percentile-bar rows', () => {
    const html = renderToStaticMarkup(
      <Headline
        budgetSpent={12}
        totalDaysOff={26}
        breakCountActual={5}
        scores={{ travel: { percentile: 70 }, efficiency: { percentile: 100 } }}
        budget={15}
        reserveDays={3}
        canPin={true}
        onPin={() => {}}
        pinnedCount={0}
      />,
    );
    expect(html).toContain('5 breaks');
    expect(html).toContain('Travel 70th');
    expect(html).toContain('Efficiency 100th');
    // The old duplicate visual (a second block with a width-coded bar per score) is gone.
    expect(html).not.toContain('about average for this budget');
    expect(html).not.toContain('quieter than most weeks');
  });

  it('renders "Pin this plan" as a small control, disabled once two plans are already pinned', () => {
    const enabled = renderToStaticMarkup(
      <Headline
        budgetSpent={12}
        totalDaysOff={26}
        breakCountActual={5}
        scores={null}
        budget={15}
        reserveDays={3}
        canPin={true}
        onPin={() => {}}
        pinnedCount={0}
      />,
    );
    expect(enabled).toContain('Pin this plan');
    expect(enabled).not.toContain('disabled=""');

    const disabled = renderToStaticMarkup(
      <Headline
        budgetSpent={12}
        totalDaysOff={26}
        breakCountActual={5}
        scores={null}
        budget={15}
        reserveDays={3}
        canPin={false}
        onPin={() => {}}
        pinnedCount={2}
      />,
    );
    expect(disabled).toContain('disabled=""');
    expect(disabled).toContain('title="Two pinned');
  });
});
