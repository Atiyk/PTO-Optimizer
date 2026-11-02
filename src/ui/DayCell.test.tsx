import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DayCell } from './DayCell';
import { COLORS, HOLIDAY_DOT } from './colorScheme';
import type { DayCategory } from './types';

function renderCell(category: DayCategory, extra: { inBand?: boolean; isAlternative?: boolean; isOutOfRange?: boolean } = {}) {
  return renderToStaticMarkup(
    <DayCell
      date="2026-07-04"
      dayOfMonth={4}
      category={category}
      hasOverlap={false}
      isAlternative={extra.isAlternative ?? false}
      isToday={false}
      inBand={extra.inBand ?? false}
      isHighlighted={false}
      isBlackout={false}
      isOutOfRange={extra.isOutOfRange ?? false}
      marginalValue={null}
      holidayName={undefined}
      hasHover={true}
      onToggle={() => {}}
    />,
  );
}

// Strip every colour/bg/border-color class, keeping shape-only signals (SVG glyph
// presence, element structure) - a crude but effective proxy for "what survives with
// colour removed entirely."
function stripColor(html: string): string {
  return html
    .replace(/\bbg-[\w[\]#.-]+/g, '')
    .replace(/\bborder-(?:slate|blue|red|teal|amber|white)-?[\w[\]#./-]*/g, '')
    .replace(/\btext-(?:slate|blue|red|white)-?[\w[\]#./-]*/g, '')
    .replace(/#[0-9a-fA-F]{3,8}/g, '');
}

describe('DayCell category rendering', () => {
  it('a pinned day and a public holiday are immediately distinguishable', () => {
    const pinned = renderCell('pinned');
    const holiday = renderCell('public-holiday');
    expect(pinned).not.toBe(holiday);
    // pinned has the PTO fill + pin glyph (svg); holiday has the neutral dot and no fill.
    expect(pinned).toContain(COLORS.ptoBg);
    expect(pinned).toContain('<svg');
    expect(holiday).not.toContain(COLORS.ptoBg);
    expect(holiday).not.toContain('<svg');
    expect(holiday).toContain(HOLIDAY_DOT);
  });

  it('a pinned day and a suggested-pto day are distinguishable even with colour removed', () => {
    const pinned = stripColor(renderCell('pinned'));
    const suggested = stripColor(renderCell('suggested-pto'));
    expect(pinned).not.toBe(suggested);
    // What's left after stripping colour: pinned has the pin glyph (an svg element);
    // suggested-pto has none.
    expect(pinned).toContain('<svg');
    expect(suggested).not.toContain('<svg');
  });

  it('pinned uses the exact same fill/border/text colour tokens as suggested-pto - sharing the PTO colour is deliberate', () => {
    const pinned = renderCell('pinned');
    const suggested = renderCell('suggested-pto');
    for (const token of [COLORS.ptoBg, COLORS.ptoBorder, COLORS.ptoText]) {
      expect(pinned).toContain(token);
      expect(suggested).toContain(token);
    }
    // Same border weight too - the glyph is the only distinguishing signal now, not a
    // border-weight difference that turned out illegible at cell size.
    expect(pinned).not.toContain('border-2');
  });

  it('a pinned day inside a band still renders the PTO fill on top (z-10) with its legible text colour', () => {
    const html = renderCell('pinned', { inBand: true });
    expect(html).toContain('z-10');
    expect(html).toContain(COLORS.ptoBg);
    expect(html).toContain(COLORS.ptoText);
  });

  it('never renders a third calendar fill colour - no violet, no indigo leftover', () => {
    for (const category of ['working', 'weekend', 'public-holiday', 'suggested-pto', 'pinned'] as DayCategory[]) {
      const html = renderCell(category);
      expect(html).not.toContain('violet');
      expect(html).not.toContain('indigo');
    }
  });

  it('an alternative outline is present but visibly fainter than a solid fill - thinner and partly transparent, not equal weight', () => {
    const alt = renderCell('working', { isAlternative: true });
    expect(alt).toContain('border-dashed');
    expect(alt).toContain(`${COLORS.altBorder}/40`); // reduced opacity
    expect(alt).not.toContain('border-2 border-dashed'); // not the old full-weight treatment
  });

  it('an out-of-range day is disabled, shows no fill/category treatment, and has no decorative markers', () => {
    for (const category of ['public-holiday', 'suggested-pto', 'pinned'] as DayCategory[]) {
      const html = renderCell(category, { isOutOfRange: true });
      expect(html).toContain('disabled');
      expect(html).not.toContain(COLORS.ptoBg);
      expect(html).not.toContain(HOLIDAY_DOT);
      expect(html).not.toContain('<svg');
      expect(html).toContain('text-slate-300'); // very muted numeral
    }
  });

  it('an in-range day of the same category is interactive, not disabled', () => {
    const html = renderCell('suggested-pto', { isOutOfRange: false });
    expect(html).not.toContain('disabled');
  });
});

afterEach(cleanup);

/** Coarse-pointer day cells must work even without marginal-value/holiday tooltips. */
function mountTouchDay(overrides: {
  category?: DayCategory;
  isAlternative?: boolean;
  isOutOfRange?: boolean;
  holidayName?: string;
} = {}) {
  const onToggle = vi.fn();
  const onSwapAlternative = vi.fn();
  render(
    <DayCell
      date="2026-07-04"
      dayOfMonth={4}
      category={overrides.category ?? 'working'}
      hasOverlap={false}
      isAlternative={overrides.isAlternative ?? false}
      isToday={false}
      inBand={false}
      isHighlighted={false}
      isBlackout={false}
      isOutOfRange={overrides.isOutOfRange ?? false}
      marginalValue={null}
      holidayName={overrides.holidayName}
      hasHover={false}
      onToggle={onToggle}
      onSwapAlternative={onSwapAlternative}
    />,
  );
  return { onToggle, onSwapAlternative, day: screen.getByRole('button', { name: /July 4/ }) };
}

describe('DayCell coarse-pointer disclosure', () => {
  it('opens a usable action for an ordinary day with no tooltip, without silently changing the plan', () => {
    const { day, onToggle } = mountTouchDay();
    fireEvent.click(day);
    expect(onToggle).not.toHaveBeenCalled();
    expect(day.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('group', { name: 'Actions for July 4' })).toBeTruthy();
    const action = screen.getByRole('button', { name: 'Change this day' });
    fireEvent.blur(day, { relatedTarget: action });
    expect(screen.getByRole('button', { name: 'Change this day' })).toBeTruthy();
    fireEvent.click(action);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith('2026-07-04');
    expect(screen.queryByRole('group', { name: 'Actions for July 4' })).toBeNull();
  });

  it('offers an action on holidays even without a marginal value', () => {
    const { day, onToggle } = mountTouchDay({ category: 'public-holiday', holidayName: 'Independence Day' });
    fireEvent.click(day);
    expect(screen.getByText('Independence Day')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Change this day' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('offers the alternative swap on touch without requiring a marginal tooltip', () => {
    const { day, onToggle, onSwapAlternative } = mountTouchDay({ isAlternative: true });
    fireEvent.click(day);
    fireEvent.click(screen.getByRole('button', { name: 'Swap this in' }));
    expect(onSwapAlternative).toHaveBeenCalledTimes(1);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('keeps disabled out-of-range days noninteractive', () => {
    const { day, onToggle } = mountTouchDay({ isOutOfRange: true });
    expect((day as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(day);
    expect(screen.queryByRole('group')).toBeNull();
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('supports keyboard Enter and Space without requiring a touch disclosure', () => {
    const { day, onToggle } = mountTouchDay();
    fireEvent.keyDown(day, { key: 'Enter' });
    fireEvent.keyDown(day, { key: ' ' });
    expect(onToggle).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('group')).toBeNull();
  });

  it('dismisses touch details on Close, Escape, and outside pointer interaction', () => {
    const { day, onToggle } = mountTouchDay();
    fireEvent.click(day);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('group')).toBeNull();
    fireEvent.click(day);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('group')).toBeNull();
    fireEvent.click(day);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('group')).toBeNull();
    expect(onToggle).not.toHaveBeenCalled();
  });
});
