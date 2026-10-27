import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SummaryMetrics } from './SummaryMetrics';
import type { Scores } from '../solver/types';

describe('SummaryMetrics', () => {
  const scores: Scores = { efficiency: { percentile: 91 }, travel: { percentile: 78 } };

  it('renders all five labels, in order', () => {
    const html = renderToStaticMarkup(
      <SummaryMetrics budgetSpent={12} totalDaysOff={33} breakCountActual={9} scores={scores} />,
    );
    const labels = ['PTO days used', 'Days off', 'Breaks', 'Travel', 'Efficiency'];
    let lastIndex = -1;
    for (const label of labels) {
      const idx = html.indexOf(label);
      expect(idx).toBeGreaterThan(lastIndex);
      lastIndex = idx;
    }
  });

  it('renders the raw counts and the ordinal percentiles', () => {
    const html = renderToStaticMarkup(
      <SummaryMetrics budgetSpent={12} totalDaysOff={33} breakCountActual={9} scores={scores} />,
    );
    expect(html).toContain('12');
    expect(html).toContain('33');
    expect(html).toContain('9');
    expect(html).toContain('78th');
    expect(html).toContain('91st');
  });

  it('falls back to an em dash for Travel/Efficiency when scores are not yet available', () => {
    const html = renderToStaticMarkup(
      <SummaryMetrics budgetSpent={0} totalDaysOff={0} breakCountActual={0} scores={null} />,
    );
    expect(html).toContain('—');
    expect(html).not.toMatch(/\d{2,3}(th|st|nd|rd)/);
  });
});
