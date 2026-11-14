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
      // F27 (P1): its own outside-range tone (3:1+, tokens.test.ts), regular weight, no fill.
      expect(html).toContain('text-[var(--outside-text)]');
      expect(html).toContain('font-normal');
      expect(html).not.toContain('text-slate-300');
      expect(html).not.toMatch(/\bbg-/);
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
    expect(screen.getByRole('dialog', { name: 'Actions for July 4' })).toBeTruthy();
    const action = screen.getByRole('button', { name: 'Change this day' });
    fireEvent.blur(day, { relatedTarget: action });
    expect(screen.getByRole('button', { name: 'Change this day' })).toBeTruthy();
    // iOS Safari may report null instead of the newly tapped action as the blur target.
    fireEvent.blur(day, { relatedTarget: null });
    expect(screen.getByRole('button', { name: 'Change this day' })).toBeTruthy();
    fireEvent.click(action);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith('2026-07-04');
    expect(screen.queryByRole('dialog', { name: 'Actions for July 4' })).toBeNull();
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

/** N4: the phone day sheet is a dialog: focus moves in, stays in, and returns to the day. */
describe('DayCell touch sheet (N4)', () => {
  function mountSheetDay(forcedState?: 'include' | 'exclude') {
    const onSetState = vi.fn();
    render(
      <DayCell
        date="2026-07-07" dayOfMonth={7} category="working" hasOverlap={false} isAlternative={false}
        isToday={false} inBand={false} isHighlighted={false} isBlackout={false} isOutOfRange={false}
        marginalValue={null} holidayName={undefined} hasHover={false} onToggle={() => {}}
        forcedState={forcedState} onSetState={onSetState}
      />,
    );
    const day = screen.getByRole('button', { name: /July 7/ });
    fireEvent.click(day, { detail: 1 });
    return { day, onSetState, sheet: screen.getByRole('dialog', { name: 'Actions for July 7' }) };
  }

  it('opens as a named dialog the day button says it controls, and moves focus to the first option', () => {
    const { day, sheet } = mountSheetDay();
    expect(day.getAttribute('aria-haspopup')).toBe('dialog');
    expect(day.getAttribute('aria-controls')).toBe(sheet.id);
    expect(sheet.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Take this day off' }));
  });

  it('keeps Tab inside the sheet in both directions', () => {
    const { sheet } = mountSheetDay();
    const buttons = [...sheet.querySelectorAll('button')];
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('returns focus to the day on Escape and on Close', () => {
    const { day } = mountSheetDay();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(day);
    fireEvent.click(day, { detail: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(day);
  });

  it('applies a choice, closes, and returns focus to the day', () => {
    const { day, onSetState } = mountSheetDay();
    fireEvent.click(screen.getByRole('button', { name: 'Never take this day' }));
    expect(onSetState).toHaveBeenCalledWith('2026-07-07', 'exclude');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(day);
  });

  it('separates ruling a day out from the two keep-it choices, and keeps Close apart from all three', () => {
    const { sheet } = mountSheetDay();
    const group = screen.getByRole('group', { name: 'Choose for this day' });
    const take = screen.getByRole('button', { name: 'Take this day off' });
    const decide = screen.getByRole('button', { name: 'Let the planner decide' });
    const never = screen.getByRole('button', { name: 'Never take this day' });
    // Take and Let-decide share a block; Never sits in its own block below a rule.
    expect(take.parentElement).toBe(decide.parentElement);
    expect(never.parentElement).not.toBe(take.parentElement);
    expect(never.parentElement!.className).toContain('border-t');
    // Close is outside the choice group, at the top of the sheet.
    const close = screen.getByRole('button', { name: 'Close' });
    expect(group.contains(close)).toBe(false);
    expect([...sheet.querySelectorAll('button')].indexOf(close as HTMLButtonElement)).toBe(0);
    // Every option and Close are 44px targets.
    for (const button of [take, decide, never]) expect(button.className).toContain('min-h-11');
    expect(close.className).toContain('h-11 w-11');
  });

  it('marks the current choice as selected (pressed, soft blue, check), not as the primary action', () => {
    mountSheetDay('exclude');
    const never = screen.getByRole('button', { name: 'Never take this day' });
    expect(never.getAttribute('aria-pressed')).toBe('true');
    expect(never.className).toContain('bg-accent-soft');
    expect(never.className).not.toMatch(/(^|\s)bg-accent(\s|$)/);
    expect(never.querySelector('svg')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Take this day off' }).getAttribute('aria-pressed')).toBe('false');
  });
});

/** F09: the day button is the whole grid column; the visible cell is an inset face. */
describe('DayCell touch target (F09)', () => {
  it('makes the button fill its column and draws the cell on an inset face', () => {
    const html = renderCell('suggested-pto');
    expect(html).toMatch(/<button[^>]*class="[^"]*\bw-full\b[^"]*\bh-12\b|<button[^>]*class="[^"]*\bh-12\b[^"]*\bw-full\b/);
    expect(html).toMatch(/data-day-face=""[^>]*class="[^"]*inset-x-0\.5/);
    // The fill lives on the face, not the button, so neighbours stay 4px apart visually.
    expect(html).not.toMatch(/<button[^>]*class="[^"]*bg-\[var\(--pto-bg\)\]/);
  });
});
