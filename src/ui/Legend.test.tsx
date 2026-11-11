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

  it('shows the four usual calendar markings', () => {
    const labels = ['Public holiday', 'PTO to request', 'Suggested break', 'Today'];
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

  it('shows pin and alternative markings only when requested', () => {
    expect(html).not.toContain('Pinned PTO');
    expect(html).not.toContain('Alternative');
    const full = renderToStaticMarkup(<Legend showPinned showAlternatives />);
    expect(full).toContain('Pinned PTO');
    expect(full).toContain('Alternative');
    expect(full).toContain('<svg');
    const fillOccurrences = full.split(COLORS.ptoBg).length - 1;
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

  it('adds employer days off and blackouts only when the plan has them, as shapes plus words', () => {
    expect(html).not.toContain('Employer day off');
    expect(html).not.toContain('Unavailable');
    const full = renderToStaticMarkup(<Legend showCompany showBlackout />);
    expect(full).toContain('Employer day off');
    expect(full).toContain('rounded-[1px]'); // the square marker, not the round holiday dot
    expect(full).toContain('Unavailable');
    expect(full).toContain('repeating-linear-gradient'); // hatching, not a hue
  });
});
