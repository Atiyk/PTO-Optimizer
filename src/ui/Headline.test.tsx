import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { headlineText, Headline, balanceLine } from './Headline';

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
  const props = {
    budgetSpent: 12,
    totalDaysOff: 26,
    breakCountActual: 5,
    scores: { travel: { percentile: 70 }, efficiency: { percentile: 100 } },
    budget: 15,
    reserveDays: 3,
    canPin: true,
    onPin: () => {},
    pinnedCount: 0,
  };

  it('sets the result as one h1 with the marked figure first, inside a live status region', () => {
    const html = renderToStaticMarkup(<Headline {...props} />);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('<span class="mark">26 days off</span>');
    expect(html).toMatch(/from 12 PTO days/);
    // The figure comes before what it costs.
    expect(html.indexOf('26 days off')).toBeLessThan(html.indexOf('from 12 PTO days'));
  });

  it('states the break count and the reserve as a deliberate choice, never as unspent budget', () => {
    const html = renderToStaticMarkup(<Headline {...props} />);
    expect(html).toContain('5 breaks');
    expect(html).toContain('12 of 15 PTO days planned');
    expect(html).toContain('3 kept in reserve');
    expect(html).not.toContain('add no days off');
  });

  it('keeps the percentiles out of the headline: they are explained in words by SummaryMetrics', () => {
    const html = renderToStaticMarkup(<Headline {...props} />);
    expect(html).not.toContain('Travel 70th');
    expect(html).not.toContain('Efficiency 100th');
  });

  it('disables saving once two plans are saved', () => {
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
    expect(enabled).toContain('Save this plan');
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
    expect(disabled).toContain('Remove a saved plan');
  });

  it('hides old numbers and save controls while the new plan is pending', () => {
    const html = renderToStaticMarkup(<Headline {...props} pending />);
    expect(html).toContain('Updating your plan');
    expect(html).not.toContain('26 days off');
    expect(html).not.toContain('Save this plan');
  });
});

describe('balanceLine', () => {
  it('names reserve and any unplaced days separately, with singular forms', () => {
    expect(balanceLine(12, 15, 3, 3)).toBe('3 breaks · 12 of 15 PTO days planned · 3 kept in reserve');
    expect(balanceLine(10, 15, 3, 1)).toBe('1 break · 10 of 15 PTO days planned · 3 kept in reserve · 2 not placed');
    expect(balanceLine(15, 15, 0, 4, true)).toBe('4 breaks · 15 of 15 target days planned');
  });
  it('labels days reserved for tracked requests instead of calling them not placed', () => {
    expect(balanceLine(2, 12, 3, 1, false, 7)).toBe('1 break · 2 of 12 PTO days planned · 3 kept in reserve · 7 reserved for tracked requests');
    expect(balanceLine(0, 1, 0, 0, false, 1)).toBe('0 breaks · 0 of 1 PTO day planned · 1 reserved for tracked requests');
    const html = renderToStaticMarkup(<Headline budgetSpent={2} totalDaysOff={4} breakCountActual={1} scores={null} budget={12} reserveDays={3} trackedReservedDays={7} canPin={false} onPin={() => {}} pinnedCount={0} />);
    expect(html).toContain('7 reserved for tracked requests');
    expect(html).not.toContain('not placed');
  });
});
