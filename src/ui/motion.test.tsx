import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import css from '../index.css?raw';
import { FigureChange, StatNumber } from './StatNumber';
import { HoldHeightWhile } from './Calendar';
import { buttonClasses } from './Button';
import { DayCell } from './DayCell';

let animate: ReturnType<typeof vi.fn>;
let reduced = false;
beforeEach(() => {
  reduced = false;
  animate = vi.fn(() => ({ cancel: vi.fn() }));
  (HTMLElement.prototype as unknown as { animate: unknown }).animate = animate;
  window.matchMedia = vi.fn((query: string) => ({ matches: reduced && query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  cleanup();
  delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate;
});

describe('figure-change cue (DESIGN.md Motion: 160ms when a figure changes)', () => {
  it('does nothing on first render, then one calm 160ms settle per change', () => {
    const view = render(<StatNumber value={31} label="days off" />);
    expect(animate).not.toHaveBeenCalled();
    view.rerender(<StatNumber value={33} label="days off" />);
    expect(animate).toHaveBeenCalledTimes(1);
    const [frames, options] = animate.mock.calls[0] as [Keyframe[], KeyframeAnimationOptions];
    expect(options.duration).toBe(160);
    // No counting: the number is already the new one, only opacity and a 3px settle move.
    expect(Object.keys(frames[0]).sort()).toEqual(['opacity', 'transform']);
    expect(screen.getByText('33')).toBeTruthy();
    view.rerender(<StatNumber value={33} label="days off" />);
    expect(animate).toHaveBeenCalledTimes(1);
  });

  it('runs nothing at all under prefers-reduced-motion', () => {
    reduced = true;
    const view = render(<StatNumber value={31} label="days off" />);
    view.rerender(<StatNumber value={40} label="days off" />);
    expect(animate).not.toHaveBeenCalled();
  });

  it('with a memory key, cues a figure that comes back changed after being unmounted, but not on its first ever showing', () => {
    const key = `test-${Math.random()}`;
    const first = render(<FigureChange value={20} memoryKey={key}>20 days off</FigureChange>);
    expect(animate).not.toHaveBeenCalled();
    first.unmount();
    const same = render(<FigureChange value={20} memoryKey={key}>20 days off</FigureChange>);
    expect(animate).not.toHaveBeenCalled();
    same.unmount();
    render(<FigureChange value={24} memoryKey={key}>24 days off</FigureChange>);
    expect(animate).toHaveBeenCalledTimes(1);
  });

  it('server markup carries no animation class (nothing on load)', () => {
    expect(renderToStaticMarkup(<StatNumber value={38} label="days off" />)).not.toMatch(/animate-/);
  });
});

describe('reduced motion and press feedback in CSS', () => {
  it('turns transitions and animations off (none, not a near-zero duration that still runs)', () => {
    const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(block).toMatch(/animation:\s*none !important/);
    expect(block).toMatch(/transition:\s*none !important/);
    expect(css).not.toMatch(/stat-in/);
  });

  it('gives buttons, the stepper, slider thumbs and day cells the same 150ms ease-out feedback', () => {
    expect(buttonClasses('primary')).toContain('duration-150 ease-[var(--ease-out)] active:scale-[0.97]');
    expect(css).toMatch(/::-moz-range-thumb \{[^}]*transition: transform 150ms var\(--ease-out\)/);
    expect(css).toMatch(/::-webkit-slider-thumb \{[^}]*transition: transform 150ms var\(--ease-out\)/);
    const html = renderToStaticMarkup(
      <DayCell date="2026-07-07" dayOfMonth={7} category="working" hasOverlap={false} isAlternative={false} isToday={false} inBand={false}
        isHighlighted={false} isBlackout={false} isOutOfRange={false} marginalValue={null} holidayName={undefined} hasHover onToggle={() => {}} />,
    );
    expect(html).toContain('transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.97]');
  });
});

describe('HoldHeightWhile (no layout shift while the plan updates)', () => {
  it('keeps the last settled height while holding and lets go after', () => {
    let resize: () => void = () => {};
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { constructor(cb: () => void) { resize = cb; } observe() {} disconnect() {} };
    const view = render(<HoldHeightWhile holding={false}><div>calendar</div></HoldHeightWhile>);
    const box = view.container.firstElementChild as HTMLElement;
    box.getBoundingClientRect = () => ({ height: 640 } as DOMRect);
    act(() => resize());
    view.rerender(<HoldHeightWhile holding><p>Updating the calendar…</p></HoldHeightWhile>);
    expect(box.style.minHeight).toBe('640px');
    expect(box.getAttribute('aria-busy')).toBe('true');
    view.rerender(<HoldHeightWhile holding={false}><div>new calendar</div></HoldHeightWhile>);
    expect(box.style.minHeight).toBe('');
    expect(box.hasAttribute('aria-busy')).toBe(false);
  });
});
