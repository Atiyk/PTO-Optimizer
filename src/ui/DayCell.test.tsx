import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DayCell } from './DayCell';
import { COLORS, HOLIDAY_DOT } from './colorScheme';
import type { DayCategory } from './types';

function renderCell(category: DayCategory, extra: { inBand?: boolean; isAlternative?: boolean; isOutOfRange?: boolean; isToday?: boolean } = {}) {
  return renderToStaticMarkup(
    <DayCell
      date="2026-07-04"
      dayOfMonth={4}
      category={category}
      hasOverlap={false}
      isAlternative={extra.isAlternative ?? false}
      isToday={extra.isToday ?? false}
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

  it('an alternative is a 1px dashed ink outline with no fill - lighter than a solid PTO block, never equal weight', () => {
    const alt = renderCell('working', { isAlternative: true });
    expect(alt).toContain(`border border-dashed ${COLORS.altBorder}`);
    expect(alt).not.toContain('border-2 border-dashed'); // never the old full-weight treatment
    expect(alt).not.toContain(COLORS.ptoBg); // outline only, no fill
  });

  it('today is a 2px ink ring set off from the cell, so it reads on an ink PTO block too', () => {
    const today = renderCell('suggested-pto', { isToday: true });
    expect(today).toContain('ring-2');
    expect(today).toContain('ring-offset-2');
  });

  it('an out-of-range day is not a control (F27), shows no fill/category treatment, and has no decorative markers', () => {
    for (const category of ['public-holiday', 'suggested-pto', 'pinned'] as DayCategory[]) {
      const html = renderCell(category, { isOutOfRange: true });
      expect(html).not.toContain('<button');
      expect(html).toContain('aria-hidden="true"');
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
    fireEvent.click(day, { detail: 1 });
    expect(onToggle).not.toHaveBeenCalled();
    expect(day.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('group', { name: 'Actions for July 4' })).toBeTruthy();
    const action = screen.getByRole('button', { name: 'Change this day' });
    fireEvent.blur(day, { relatedTarget: action });
    expect(screen.getByRole('button', { name: 'Change this day' })).toBeTruthy();
    // iOS Safari may report null instead of the newly tapped action as the blur target.
    fireEvent.blur(day, { relatedTarget: null });
    expect(screen.getByRole('button', { name: 'Change this day' })).toBeTruthy();
    fireEvent.click(action);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith('2026-07-04');
    expect(screen.queryByRole('group', { name: 'Actions for July 4' })).toBeNull();
  });

  it('offers an action on holidays even without a marginal value', () => {
    const { day, onToggle } = mountTouchDay({ category: 'public-holiday', holidayName: 'Independence Day' });
    fireEvent.click(day, { detail: 1 });
    expect(screen.getByText('Independence Day')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Change this day' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('offers the alternative swap on touch without requiring a marginal tooltip', () => {
    const { day, onToggle, onSwapAlternative } = mountTouchDay({ isAlternative: true });
    fireEvent.click(day, { detail: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Swap this in' }));
    expect(onSwapAlternative).toHaveBeenCalledTimes(1);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('keeps out-of-range days noninteractive', () => {
    const onToggle = vi.fn();
    render(
      <DayCell
        date="2026-07-04" dayOfMonth={4} category="working" hasOverlap={false} isAlternative={false}
        isToday={false} inBand={false} isHighlighted={false} isBlackout={false} isOutOfRange
        marginalValue={null} holidayName={undefined} hasHover={false} onToggle={onToggle}
      />,
    );
    expect(screen.queryByRole('button')).toBeNull();
    fireEvent.click(screen.getByText('4'));
    expect(screen.queryByRole('group')).toBeNull();
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('applies the native keyboard click once and closes a previously opened touch disclosure', () => {
    const { day, onToggle } = mountTouchDay();
    fireEvent.click(day, { detail: 1 });
    fireEvent.keyDown(day, { key: ' ' });
    fireEvent.click(day, { detail: 0 });
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith('2026-07-04');
    expect(screen.queryByRole('group')).toBeNull();
  });

  it('dismisses touch details on Close, Escape, and outside pointer interaction', () => {
    const { day, onToggle } = mountTouchDay();
    fireEvent.click(day, { detail: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('group')).toBeNull();
    fireEvent.click(day, { detail: 1 });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('group')).toBeNull();
    fireEvent.click(day, { detail: 1 });
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('group')).toBeNull();
    expect(onToggle).not.toHaveBeenCalled();
  });
});

describe('Ink & Signal Blue calendar semantics', () => {
  const cell = (over: Partial<Parameters<typeof DayCell>[0]>) => renderToStaticMarkup(
    <DayCell date="2027-11-25" dayOfMonth={25} category="public-holiday" hasOverlap={false} isAlternative={false} isToday={false}
      inBand={false} isHighlighted={false} isBlackout={false} isOutOfRange={false} marginalValue={null} holidayName="Thanksgiving"
      hasHover onToggle={() => {}} {...over} />,
  );

  it('draws a public holiday in teal on the soft teal fill, with a round marker and its name', () => {
    const html = cell({});
    expect(html).toContain('bg-holiday-soft');
    expect(html).toContain('text-[var(--holiday-ink)]');
    expect(html).toContain('rounded-full');
    expect(html).toContain('public holiday');
  });

  it('lets the recommended run show through a holiday inside a break, keeping the teal numeral', () => {
    const html = cell({ inBand: true });
    expect(html).not.toContain('bg-holiday-soft');
    expect(html).toContain('text-[var(--holiday-ink)]');
  });

  it('marks an employer day off with a square, and says so', () => {
    const html = cell({ holidayKind: 'company', holidayName: 'Office closed' });
    expect(html).toContain('rounded-[1px]');
    expect(html).toContain('employer day off');
  });

  it('hatches a blackout day instead of colouring it', () => {
    const html = cell({ category: 'working', isBlackout: true, holidayName: undefined });
    expect(html).toContain('repeating-linear-gradient');
    expect(html).toContain('blackout, cannot be used for PTO');
  });
});
