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
      <Headline budgetSpent={12} totalDaysOff={26} breakCountActual={5} scores={null} budget={15} reserveDays={3} />,
    );
    expect(html).toContain('12 of 15 days planned');
    expect(html).toContain('3 kept in reserve');
  });
});
