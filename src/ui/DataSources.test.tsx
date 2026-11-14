import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { bundledYearsText, DataSources } from './DataSources';
import holidayCoverage from '@daysoff/engine/data/holidayCoverage.json';

describe('DataSources (P2 trust)', () => {
  const html = renderToStaticMarkup(<DataSources />);

  it('explains holidays, travel data, how days off are counted and what stays in the browser', () => {
    for (const heading of ['Public holidays', 'Travel data', 'How days off are counted', 'What stays in your browser']) {
      expect(html).toContain(heading);
    }
    expect(html).toContain('Nager.Date');
    expect(html).toContain(`${holidayCoverage.countriesWithData} countries`);
    expect(html).toContain('TSA airport checkpoint counts for 2025');
    expect(html).toContain('Each date counts once.');
    expect(html).toContain('href="/privacy.html"');
  });

  it('describes the TSA smoothing the build script actually does', () => {
    expect(html).toContain('averaged with the same weekday a week before and after');
    expect(html).not.toContain('7-day windows');
  });

  it('writes the bundled years as a range', () => {
    expect(bundledYearsText([2028, 2026, 2027])).toBe('2026 to 2028');
    expect(bundledYearsText([2027])).toBe('2027');
  });
});
