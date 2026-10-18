import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Legend } from './Legend';
import { COLORS, HOLIDAY_DOT } from './colorScheme';

describe('Legend', () => {
  const html = renderToStaticMarkup(<Legend />);

  it('renders no weekend entry', () => {
    expect(html).not.toContain('Weekend');
  });

  it('renders no instruction text - click/hover hints and Overlap day live beneath the calendar now', () => {
    expect(html).not.toContain('Hover or focus');
    expect(html).not.toContain('Click any day');
    expect(html).not.toContain('Overlap day');
  });

  it('renders the five required entries, in order', () => {
    const labels = ['Public holiday', 'Suggested PTO', 'Pinned by you', 'Alternative', 'Days off'];
    let lastIndex = -1;
    for (const label of labels) {
      const idx = html.indexOf(label);
      expect(idx).toBeGreaterThan(lastIndex); // present, and in the specified order
      lastIndex = idx;
    }
  });

  it('Public holiday is a dot, not a filled box - matching what the calendar actually does', () => {
    expect(html).toContain(HOLIDAY_DOT);
    // No pto/band fill class appears before "Public holiday" - its swatch really is just a dot.
    const beforeHoliday = html.slice(0, html.indexOf('Public holiday'));
    expect(beforeHoliday).not.toContain(COLORS.ptoBg);
  });

  it('Pinned by you reuses the exact Suggested PTO fill, plus the pin glyph', () => {
    expect(html).toContain('<svg');
    // Count every occurrence of the shared PTO fill class - both "Suggested PTO" and
    // "Pinned by you" swatches must use it, confirming they share the one PTO colour.
    const fillOccurrences = html.split(COLORS.ptoBg).length - 1;
    expect(fillOccurrences).toBeGreaterThanOrEqual(2);
  });

  it('only two colour roles appear: the PTO fill and the band fill, plus the one neutral holiday dot', () => {
    expect(html).toContain(COLORS.ptoBg);
    expect(html).toContain(COLORS.bandBg);
    expect(html).toContain(HOLIDAY_DOT);
    // No leftover reference to a removed third calendar-fill color.
    expect(html).not.toContain('holidayBg');
    expect(html).not.toContain('violet');
    expect(html).not.toContain('indigo'); // the summary strip's score ramp must never appear here
  });
});
