import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DayCell } from './DayCell';
import { Calendar } from './Calendar';

afterEach(cleanup);

/**
 * F27: out-of-range days (the padding before rangeStart / after rangeEnd inside a shown month)
 * were rendered as disabled <button>s, so screen readers listed them in the buttons list as
 * "November 10, outside the selected date range, button, dimmed". They are not controls.
 */
describe('out-of-range calendar days (F27)', () => {
  function cell(isOutOfRange: boolean, onToggle = vi.fn()) {
    render(
      <DayCell
        date="2026-11-10" dayOfMonth={10} category="working" hasOverlap={false} isAlternative={false}
        isToday={false} inBand={false} isHighlighted={false} isBlackout={false} isOutOfRange={isOutOfRange}
        marginalValue={null} holidayName={undefined} hasHover={false} onToggle={onToggle}
      />,
    );
    return onToggle;
  }

  it('is not exposed as a button (or any control) to assistive tech', () => {
    cell(true);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText(/outside the selected date range/)).toBeNull();
    // Still visible as a muted numeral, so the month grid keeps its shape.
    expect(screen.getByText('10').closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('ignores pointer input', () => {
    const onToggle = cell(true);
    fireEvent.click(screen.getByText('10'));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('an in-range day stays a named button', () => {
    cell(false);
    expect(screen.getByRole('button', { name: /November 10/ })).toBeTruthy();
  });
});

describe('calendar keyboard grid with out-of-range padding (F27)', () => {
  function mount() {
    render(
      <Calendar
        rangeStart="2026-11-15" rangeEnd="2026-11-30" weekStart={1} today="2026-11-15"
        offRuns={[]} previewRun={null} breakBandByRunIndex={new Map()} hoveredBreakDaySet={new Set()}
        onHoverBreak={() => {}} categoryOf={() => 'working'} isBlackoutDay={() => false} overlapSet={new Set()}
        marginalValues={new Map()} holidayNameFor={() => undefined} hasHover={true} onDayClick={() => {}}
        alternativeForDate={() => undefined} onSwapAlternative={() => {}} onHoverAlternative={() => {}}
      />,
    );
  }

  it('lists only in-range days as buttons, with one tab stop', () => {
    mount();
    const days = screen.getAllByRole('button');
    expect(days).toHaveLength(16); // Nov 15-30
    expect(days.filter((d) => d.tabIndex === 0)).toHaveLength(1);
  });

  it('arrow keys move between in-range days and stop at the range edge', () => {
    mount();
    const first = document.getElementById('day-2026-11-15')!;
    act(() => first.focus());
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(document.activeElement?.id).toBe('day-2026-11-16');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    expect(document.activeElement?.id).toBe('day-2026-11-15');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement?.id).toBe('day-2026-11-22');
  });
});
