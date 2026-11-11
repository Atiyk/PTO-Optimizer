import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { BreakCard } from './BreakCard';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import type { Break } from '@daysoff/engine/solver/types';

function makeBreak(overrides: Partial<Break> = {}): Break {
  return {
    id: '2026-01-05|2026-01-05',
    start: '2026-01-05',
    end: '2026-01-05',
    days: ['2026-01-05'],
    totalDaysOff: 1,
    ptoCost: 1,
    multiplier: 1,
    tags: [],
    meanDemand: 1,
    ...overrides,
  };
}

function render(brk: Break) {
  return renderToStaticMarkup(
    <BreakCard
      brk={brk}
      index={1}
      isPtoDay={() => true}
      onHover={() => {}}
      isMostContested={false}
      reason="placeholder reason"
      today="2025-12-01"
      noticePeriodDays={14}
      workWeek={DEFAULT_WORK_WEEK}
    />,
  );
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function mountInteractive(props: Partial<ComponentProps<typeof BreakCard>> = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const full = {
    brk: makeBreak(),
    index: 1,
    isPtoDay: () => true,
    onHover: () => {},
    isMostContested: false,
    reason: 'placeholder reason',
    today: '2025-12-01',
    noticePeriodDays: 14,
    workWeek: DEFAULT_WORK_WEEK,
    ...props,
  };
  act(() => {
    root!.render(<BreakCard {...full} />);
  });
  return { rerender: (next: Partial<typeof full>) => act(() => root!.render(<BreakCard {...{ ...full, ...next }} />)) };
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

describe('BreakCard defaultExpanded (regression: async holiday loading changes which break is "position 0")', () => {
  it('BUG FOUND: a plain useState(defaultExpanded) locked in a mount-time snapshot, so a break that was briefly "position 0" during an early render (before holidays loaded) stayed expanded forever, even after it moved away from position 0 once the real plan settled - leaving two cards expanded. Fixed: `expanded` now mirrors the CURRENT defaultExpanded prop every render, absent an explicit user choice.', () => {
    const { rerender } = mountInteractive({ defaultExpanded: true });
    expect(container!.textContent).toContain('Hide request tools');

    // The plan settles (e.g. holidays finish loading) and this break is no longer position 0.
    rerender({ defaultExpanded: false });
    expect(container!.textContent).toContain('Request this time off');
    expect(container!.textContent).not.toContain('Hide request tools');
  });

  it('an explicit user choice overrides the prop on every later render, in both directions', () => {
    const { rerender } = mountInteractive({ defaultExpanded: false });
    act(() => {
      container!.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container!.textContent).toContain('Hide request tools');

    // Even if the prop later says this card should collapse, the user's own expand stands.
    rerender({ defaultExpanded: false });
    expect(container!.textContent).toContain('Hide request tools');
  });
});

describe('BreakCard collapse (UI density pass: collapsed by default, request tools behind a toggle)', () => {
  it('starts collapsed by default: no request-by line, no copy dropdown, just a toggle', () => {
    const html = render(makeBreak());
    expect(html).toContain('Request this time off');
    expect(html).not.toContain('Copy request');
    expect(html).not.toContain('Request by');
    expect(html).not.toContain('already started');
  });

  it('shows only the exact PTO dates while request tools are collapsed', () => {
    const brk = makeBreak({
      start: '2026-12-25', end: '2026-12-28',
      days: ['2026-12-25', '2026-12-26', '2026-12-27', '2026-12-28'],
      totalDaysOff: 4, ptoCost: 1, multiplier: 4,
    });
    const { rerender } = mountInteractive({ brk, isPtoDay: date => date === '2026-12-28' });
    expect(container!.textContent).toContain('Dec 25 – 28, 2026');
    expect(container!.textContent).toContain('1 working day: Mon Dec 28');
    expect(container!.textContent).not.toContain('Fri Dec 25');
    expect(container!.textContent).not.toContain('Copy request');
    rerender({ requestToolsReady: false });
    expect(container!.textContent).not.toContain('PTO dates to request');
  });

  it('starts expanded when defaultExpanded is set (the first rendered card)', () => {
    const html = renderToStaticMarkup(
      <BreakCard
        brk={makeBreak()}
        index={1}
        isPtoDay={() => true}
        onHover={() => {}}
        isMostContested={false}
        reason="placeholder reason"
        today="2025-12-01"
        noticePeriodDays={14}
        workWeek={DEFAULT_WORK_WEEK}
        defaultExpanded
      />,
    );
    expect(html).toContain('Copy request');
    expect(html).toContain('Hide request tools');
    expect(html).not.toContain('Request this time off');
  });

  it('a single "Copy request" control replaces the three always-visible copy buttons', () => {
    const html = renderToStaticMarkup(
      <BreakCard
        brk={makeBreak()}
        index={1}
        isPtoDay={() => true}
        onHover={() => {}}
        isMostContested={false}
        reason="placeholder reason"
        today="2025-12-01"
        noticePeriodDays={14}
        workWeek={DEFAULT_WORK_WEEK}
        defaultExpanded
      />,
    );
    expect(html).not.toContain('Copy date list</button>');
    expect(html).not.toContain('Copy email draft</button>');
    expect(html).not.toContain('Copy detailed email draft</button>');
    expect((html.match(/Copy request/g) || []).length).toBe(1);
  });
});

describe('BreakCard reason (Phase 3 step 4: "why" line, computed by breakReason.ts and passed in as a prop)', () => {
  it('renders whatever reason it is given, visibly, on every card - not conditionally, not in a tooltip', () => {
    const html = renderToStaticMarkup(
      <BreakCard
        brk={makeBreak()}
        index={1}
        isPtoDay={() => true}
        onHover={() => {}}
        isMostContested={false}
        reason="Bridges Thanksgiving — 1 PTO day for 4 days off."
        today="2025-12-01"
        noticePeriodDays={14}
        workWeek={DEFAULT_WORK_WEEK}
      />,
    );
    expect(html).toContain('Bridges Thanksgiving — 1 PTO day for 4 days off.');
  });
});


describe('BreakCard copy-request menu keyboard and touch access', () => {
  function trigger(): HTMLButtonElement {
    const button = Array.from(container!.querySelectorAll('button')).find((el) => el.textContent?.includes('Copy request'));
    if (!button) throw new Error('Copy request trigger missing');
    return button;
  }

  function key(target: EventTarget, value: string) {
    act(() => {
      target.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
    });
  }

  it('opens with focus on first item, supports arrow/Home/End navigation, and restores trigger focus on Escape', () => {
    mountInteractive({ defaultExpanded: true });
    const button = trigger();
    expect(button.className).toContain('min-h-11');
    act(() => { button.click(); });
    const items = Array.from(container!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    expect(items).toHaveLength(3);
    expect(document.activeElement).toBe(items[0]);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.getAttribute('aria-controls')).toBe(container!.querySelector('[role="menu"]')?.id);
    for (const item of items) expect(item.className).toContain('min-h-11');

    key(items[0], 'ArrowDown');
    expect(document.activeElement).toBe(items[1]);
    key(items[1], 'End');
    expect(document.activeElement).toBe(items[2]);
    key(items[2], 'ArrowDown');
    expect(document.activeElement).toBe(items[0]);
    key(items[0], 'Home');
    expect(document.activeElement).toBe(items[0]);

    key(document, 'Escape');
    expect(container!.querySelector('[role="menu"]')).toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button);
  });

  it('ArrowUp opens at the last format and ArrowDown wraps back to the first', () => {
    mountInteractive({ defaultExpanded: true });
    const button = trigger();
    key(button, 'ArrowUp');
    const items = Array.from(container!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    expect(document.activeElement).toBe(items[2]);
    key(items[2], 'ArrowDown');
    expect(document.activeElement).toBe(items[0]);
    key(items[0], 'ArrowUp');
    expect(document.activeElement).toBe(items[2]);
  });

  it('copies the selected format, returns focus, and announces clipboard success', async () => {
    const writeText = vi.fn(async (_text: string) => undefined);
    const previous = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    try {
      mountInteractive({ defaultExpanded: true });
      const button = trigger();
      act(() => { button.click(); });
      const email = Array.from(container!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))[1];
      await act(async () => {
        email.click();
        await Promise.resolve();
      });
      expect(writeText).toHaveBeenCalledOnce();
      expect(writeText.mock.calls[0][0]).toContain("I'd like to request time off");
      expect(container!.querySelector('[role="menu"]')).toBeNull();
      expect(document.activeElement).toBe(button);
      expect(container!.querySelector('[role="status"]')?.textContent).toContain('Request copied');
    } finally {
      if (previous) Object.defineProperty(navigator, 'clipboard', previous);
      else Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it('allows Tab to leave the menu without a keyboard trap', () => {
    mountInteractive({ defaultExpanded: true });
    act(() => { trigger().click(); });
    const first = container!.querySelector<HTMLButtonElement>('[role="menuitem"]')!;
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    act(() => { first.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(false);
    expect(container!.querySelector('[role="menu"]')).toBeNull();
  });

  it('dismisses on outside pointer interaction and outside keyboard focus without trapping focus', () => {
    mountInteractive({ defaultExpanded: true });
    const button = trigger();
    act(() => { button.click(); });
    act(() => { document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })); });
    expect(container!.querySelector('[role="menu"]')).toBeNull();

    act(() => { button.click(); });
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    try {
      act(() => { outside.focus(); });
      expect(container!.querySelector('[role="menu"]')).toBeNull();
      expect(document.activeElement).toBe(outside);
    } finally {
      outside.remove();
    }
  });
});
