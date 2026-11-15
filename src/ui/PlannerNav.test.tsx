import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { PlannerNav } from './PlannerNav';

// jsdom has no layout: a hand-driven IntersectionObserver, a top for each section, display via
// offsetParent (null for `hidden` elements, as a browser gives for display: none), and a
// requestAnimationFrame that runs when the test says so.
type Entry = { isIntersecting: boolean; boundingClientRect: { top: number } };
let intersect: (entries: Entry[]) => void = () => {};
let frames: FrameRequestCallback[] = [];
const tops = new Map<string, number>();

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: (entries: Entry[]) => void) { intersect = callback; }
    observe() {}
    disconnect() {}
  });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
  vi.stubGlobal('cancelAnimationFrame', () => {});
  const real = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return tops.has(this.id) ? DOMRect.fromRect({ y: tops.get(this.id)!, width: 300, height: 40 }) : real.call(this);
  });
  vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockImplementation(function (this: HTMLElement) {
    return this.closest('[hidden]') ? null : document.body;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  frames = [];
  tops.clear();
});

const items = [
  { id: 'breaks-heading', label: 'Breaks' },
  { id: 'complete-plan-heading', label: 'Calendar' },
  { id: 'plan-controls', label: 'Adjust' },
];

function Page({ adjustHidden = false }: { adjustHidden?: boolean }) {
  const watch = createRef<HTMLElement>();
  return <>
    <PlannerNav watch={watch} items={items} result={{ totalDaysOff: 31, budgetSpent: 13, breakCountActual: 4 }} />
    <section ref={watch} id="saved-plans">Result</section>
    <h2 id="breaks-heading">Breaks</h2>
    <h2 id="complete-plan-heading">Calendar</h2>
    <aside id="plan-controls" hidden={adjustHidden}>Settings</aside>
  </>;
}

const nav = () => document.querySelector<HTMLElement>('[data-planner-nav]')!;
const current = () => [...nav().querySelectorAll('a[aria-current="location"]')].map((link) => link.textContent);
const scrollTo = (positions: Record<string, number>) => {
  for (const [id, top] of Object.entries(positions)) tops.set(id, top);
  act(() => {
    window.dispatchEvent(new Event('scroll'));
    const pending = frames;
    frames = [];
    pending.forEach((callback) => callback(0));
  });
};
const showBar = () => act(() => intersect([{ isIntersecting: false, boundingClientRect: { top: -400 } }]));

describe('PlannerNav', () => {
  it('is hidden and inert while the result is in view', () => {
    render(<Page />);
    expect(nav().getAttribute('data-planner-nav')).toBe('hidden');
    expect(nav().hasAttribute('inert')).toBe(true);
    act(() => intersect([{ isIntersecting: true, boundingClientRect: { top: 120 } }]));
    expect(nav().getAttribute('data-planner-nav')).toBe('hidden');
    expect(nav().hasAttribute('inert')).toBe(true);
  });

  it('stays hidden when the result is out of view below, not above (a short scroll back up)', () => {
    render(<Page />);
    act(() => intersect([{ isIntersecting: false, boundingClientRect: { top: 900 } }]));
    expect(nav().getAttribute('data-planner-nav')).toBe('hidden');
  });

  it('shows once the result has scrolled above the top, and hides again when it returns', () => {
    render(<Page />);
    tops.set('breaks-heading', 500).set('complete-plan-heading', 1500).set('plan-controls', 2500);
    showBar();
    expect(nav().getAttribute('data-planner-nav')).toBe('shown');
    expect(nav().hasAttribute('inert')).toBe(false);
    expect(screen.getByRole('navigation', { name: 'Plan sections' })).toBeTruthy();
    act(() => intersect([{ isIntersecting: true, boundingClientRect: { top: -10 } }]));
    expect(nav().getAttribute('data-planner-nav')).toBe('hidden');
    expect(nav().hasAttribute('inert')).toBe(true);
  });

  it('follows the latest of several queued intersection entries', () => {
    render(<Page />);
    act(() => intersect([
      { isIntersecting: false, boundingClientRect: { top: -400 } },
      { isIntersecting: true, boundingClientRect: { top: 20 } },
    ]));
    expect(nav().getAttribute('data-planner-nav')).toBe('hidden');
  });

  it('marks the section whose top has passed the bar as the current location, following the scroll', () => {
    render(<Page />);
    tops.set('breaks-heading', 300).set('complete-plan-heading', 1300).set('plan-controls', 2300);
    showBar();
    expect(current()).toEqual([]);

    scrollTo({ 'breaks-heading': -50, 'complete-plan-heading': 950, 'plan-controls': 1950 });
    expect(current()).toEqual(['Breaks']);

    scrollTo({ 'breaks-heading': -1100, 'complete-plan-heading': -100, 'plan-controls': 900 });
    expect(current()).toEqual(['Calendar']);

    scrollTo({ 'breaks-heading': -2200, 'complete-plan-heading': -1200, 'plan-controls': 10 });
    expect(current()).toEqual(['Adjust']);

    // Back up: the mark follows.
    scrollTo({ 'breaks-heading': -60, 'complete-plan-heading': 940, 'plan-controls': 1940 });
    expect(current()).toEqual(['Breaks']);
    expect(nav().querySelectorAll('a[aria-current]')).toHaveLength(1);
  });

  it('counts a section that a jump has just landed (its scroll-mt-16 puts it 64px down, below the 48px bar)', () => {
    render(<Page />);
    tops.set('breaks-heading', -900).set('complete-plan-heading', 64).set('plan-controls', 1200);
    showBar();
    expect(current()).toEqual(['Calendar']);
    // The bar itself is 48px (h-12): a target at 64px sits fully below it.
    expect(nav().querySelector('.h-12')).not.toBeNull();
  });

  it('skips a section that is not displayed', () => {
    render(<Page adjustHidden />);
    tops.set('breaks-heading', -2200).set('complete-plan-heading', -1200).set('plan-controls', 10);
    showBar();
    expect(current()).toEqual(['Calendar']);
  });

  it('skips a section that is not on the page at all', () => {
    const watch = createRef<HTMLElement>();
    render(<>
      <PlannerNav watch={watch} items={[{ id: 'breaks-heading', label: 'Breaks' }, { id: 'missing', label: 'Missing' }]} />
      <section ref={watch}>Result</section>
      <h2 id="breaks-heading">Breaks</h2>
    </>);
    tops.set('breaks-heading', -300);
    showBar();
    expect(current()).toEqual(['Breaks']);
  });

  it('runs an item’s onSelect before the jump', () => {
    const onSelect = vi.fn();
    const watch = createRef<HTMLElement>();
    render(<><PlannerNav watch={watch} items={[{ id: 'plan-controls', label: 'Adjust', onSelect }]} /><section ref={watch}>Result</section></>);
    showBar();
    act(() => screen.getByRole('link', { name: 'Adjust' }).click());
    expect(onSelect).toHaveBeenCalledOnce();
  });
});
