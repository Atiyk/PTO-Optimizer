import { describe, it, expect, afterEach } from 'vitest';
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { BreakCard } from './BreakCard';
import { DEFAULT_WORK_WEEK } from '../solver/types';
import type { Break } from '../solver/types';

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
    expect(container!.textContent).toContain('Hide ↑');

    // The plan settles (e.g. holidays finish loading) and this break is no longer position 0.
    rerender({ defaultExpanded: false });
    expect(container!.textContent).toContain('Request this time off ↓');
    expect(container!.textContent).not.toContain('Hide ↑');
  });

  it('an explicit user choice overrides the prop on every later render, in both directions', () => {
    const { rerender } = mountInteractive({ defaultExpanded: false });
    act(() => {
      container!.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container!.textContent).toContain('Hide ↑');

    // Even if the prop later says this card should collapse, the user's own expand stands.
    rerender({ defaultExpanded: false });
    expect(container!.textContent).toContain('Hide ↑');
  });
});

describe('BreakCard collapse (UI density pass: collapsed by default, request tools behind a toggle)', () => {
  it('starts collapsed by default: no request-by line, no copy dropdown, just a toggle', () => {
    const html = render(makeBreak());
    expect(html).toContain('Request this time off ↓');
    expect(html).not.toContain('Copy request');
    expect(html).not.toContain('Request by');
    expect(html).not.toContain('already started');
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
    expect(html).toContain('Hide ↑');
    expect(html).not.toContain('Request this time off ↓');
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
