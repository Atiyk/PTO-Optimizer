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
    expect(container!.textContent).toContain('Hide request steps');

    // The plan settles (e.g. holidays finish loading) and this break is no longer position 0.
    rerender({ defaultExpanded: false });
    expect(container!.textContent).toContain('Request this time off');
    expect(container!.textContent).not.toContain('Hide request steps');
  });

  it('an explicit user choice overrides the prop on every later render, in both directions', () => {
    const { rerender } = mountInteractive({ defaultExpanded: false });
    act(() => {
      container!.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container!.textContent).toContain('Hide request steps');

    // Even if the prop later says this card should collapse, the user's own expand stands.
    rerender({ defaultExpanded: false });
    expect(container!.textContent).toContain('Hide request steps');
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
    expect(html).toContain('Sent it? Keep track here');
    expect(html).toContain('Hide request steps');
    expect(html).not.toContain('Request this time off');
  });

  it('a single primary "Copy request" control; the other formats sit behind one disclosure', () => {
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
    expect((html.match(/>Copy request</g) || []).length).toBe(1);
    expect(html).toMatch(/<details[^>]*><summary[^>]*>Other formats and calendar file<\/summary>/);
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
        reason="Bridges Thanksgiving."
        today="2025-12-01"
        noticePeriodDays={14}
        workWeek={DEFAULT_WORK_WEEK}
      />,
    );
    expect(html).toContain('Bridges Thanksgiving.');
  });
});


describe('BreakCard request panel (one place to ask: workdays, ask-by date, copy, mark requested)', () => {
  const june = makeBreak({
    id: '2027-06-12|2027-06-20', start: '2027-06-12', end: '2027-06-20',
    days: ['2027-06-12', '2027-06-13', '2027-06-14', '2027-06-15', '2027-06-16', '2027-06-17', '2027-06-18', '2027-06-19', '2027-06-20'],
    totalDaysOff: 9, ptoCost: 4, multiplier: 2.25,
  });
  // Mon Jun 14 to Thu Jun 17 are PTO; Fri Jun 18 is a (Juneteenth-observed) holiday.
  const isPto = (date: string) => ['2027-06-14', '2027-06-15', '2027-06-16', '2027-06-17'].includes(date);
  const holiday = (date: string) => date === '2027-06-18' ? 'Juneteenth' : undefined;
  const open = () => {
    const toggle = Array.from(container!.querySelectorAll('button')).find((el) => el.textContent?.includes('Request this time off'))!;
    act(() => { toggle.click(); });
    return toggle;
  };
  const button = (name: string) => Array.from(container!.querySelectorAll('button')).find((el) => el.textContent?.trim() === name);

  it('names exactly the workdays to ask for, the free days around them, and one ask-by date', () => {
    mountInteractive({ brk: june, isPtoDay: isPto, holidayNameFor: holiday, today: '2027-05-01', noticePeriodDays: 14 });
    const toggle = open();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const panel = container!.querySelector('[data-request-panel]')!;
    expect(panel.querySelector('h4')?.textContent).toBe('Ask for 4 workdays off');
    expect(Array.from(panel.querySelectorAll('ul[aria-label="PTO days to request"] li')).map((li) => li.textContent))
      .toEqual(['Mon Jun 14', 'Tue Jun 15', 'Wed Jun 16', 'Thu Jun 17']);
    expect(panel.textContent).toContain('The other 5 days are already off: weekend and Juneteenth');
    // 14 calendar days before the first day away (Mon Jun 14) is Mon May 31.
    const deadline = panel.querySelector('[data-request-deadline]')!;
    expect(deadline.getAttribute('data-request-deadline')).toBe('2027-05-31');
    expect(deadline.textContent).toBe('Ask by Mon May 31, 30 days from today, for 14-day notice.');
    // One primary copy action; the other formats are behind one disclosure.
    expect(Array.from(panel.querySelectorAll('button')).filter((el) => el.textContent === 'Copy request')).toHaveLength(1);
    expect(panel.querySelector('details')?.open).toBe(false);
    expect(panel.querySelector('summary')?.textContent).toBe('Other formats and calendar file');
  });

  it('says to ask now once the notice window has opened', () => {
    mountInteractive({ brk: june, isPtoDay: isPto, today: '2027-06-05', noticePeriodDays: 14 });
    open();
    const deadline = container!.querySelector('[data-request-deadline]')!;
    expect(deadline.getAttribute('data-deadline-tone')).toBe('now');
    expect(deadline.textContent).toBe('Ask now, the 14-day notice window opened Mon May 31.');
  });

  it('copies a manager-ready request and announces it, without recording anything', async () => {
    const writeText = vi.fn(async (_text: string) => undefined);
    const onMarkRequested = vi.fn(() => ({ ok: true, message: 'Marked requested' }));
    const previous = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    try {
      const event = vi.fn();
      window.plausible = event;
      mountInteractive({ brk: june, isPtoDay: isPto, today: '2027-05-01', onMarkRequested });
      open();
      await act(async () => { button('Copy request')!.click(); await Promise.resolve(); });
      expect(event).toHaveBeenCalledWith('request_text_copied', { url: window.location.origin + '/' });
      delete window.plausible;
      expect(writeText).toHaveBeenCalledOnce();
      expect(writeText.mock.calls[0][0]).toContain("I'd like to request time off covering Jun 12 – 20, 2027");
      expect(writeText.mock.calls[0][0]).toContain('Mon Jun 14, Tue Jun 15, Wed Jun 16, Thu Jun 17');
      expect(container!.querySelector('[data-request-panel] [role="status"]')?.textContent).toBe('Request copied. Paste it into an email or your HR tool.');
      // Copying text is not asking: nothing is recorded until the person says they asked.
      expect(onMarkRequested).not.toHaveBeenCalled();
      expect(button('Copied ✓')).toBeTruthy();
    } finally {
      if (previous) Object.defineProperty(navigator, 'clipboard', previous);
      else Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it('marks requested only on the explicit action, and shows a failure in place', () => {
    const onMarkRequested = vi.fn(() => ({ ok: false, message: 'Browser storage could not be coordinated.' }));
    mountInteractive({ brk: june, isPtoDay: isPto, today: '2027-05-01', onMarkRequested });
    open();
    act(() => { button('Mark requested')!.click(); });
    expect(onMarkRequested).toHaveBeenCalledOnce();
    expect(container!.querySelector('[data-request-panel] [role="status"]')?.textContent).toBe('Browser storage could not be coordinated.');
  });

  it('never claims approval or that anything was sent', () => {
    mountInteractive({ brk: june, isPtoDay: isPto, today: '2027-05-01', onMarkRequested: () => ({ ok: true, message: '' }) });
    open();
    const text = container!.textContent!;
    expect(text).not.toMatch(/approved|request sent|submitted/i);
    expect(text).toContain('Timebower doesn’t send anything or contact your employer.');
  });

  it('shows a saved, canceled or declined record and still lets the person ask', () => {
    const { rerender } = mountInteractive({ brk: june, isPtoDay: isPto, record: 'considering', onSave: () => ({ ok: true, message: '' }) });
    expect(container!.querySelector('[data-break-record]')?.textContent).toBe('Saved');
    expect(button('Save break')).toBeUndefined();
    expect(container!.textContent).toContain('Request this time off');
    rerender({ record: 'rejected' });
    expect(container!.querySelector('[data-break-record]')?.textContent).toBe('Declined in My PTO');
    rerender({ record: 'canceled' });
    expect(container!.querySelector('[data-break-record]')?.textContent).toBe('Canceled in My PTO');
  });
});

describe('BreakCard: "Fewer flyers than usual" travel tag', () => {
  it('names 2025 TSA data for a window at least 15% below the yearly mean', () => {
    const html = render(makeBreak({ id: '2026-01-27|2026-01-31', start: '2026-01-27', end: '2026-01-31', tags: ['Low travel demand'] }));
    expect(html).toContain('Fewer flyers than usual (2025 TSA data)');
    expect(html).not.toContain('Quieter');
  });

  it('shows no quiet-travel tag when the window is not meaningfully below average', () => {
    const html = render(makeBreak({ id: '2026-07-01|2026-07-05', start: '2026-07-01', end: '2026-07-05', tags: ['Low travel demand'] }));
    expect(html).not.toContain('Fewer flyers');
    expect(html).not.toContain('Low travel demand');
  });
});
