import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useMinWidth } from './useMinWidth';

/** Classes each card's <li> adds so it sits in the phone strip; stacked from 768px up. */
export const BREAK_STRIP_ITEM = 'max-md:w-[86%] max-md:shrink-0 max-md:snap-start';

/**
 * The break cards: a horizontal, snap-aligned strip on phones (one card and the edge of the
 * next in view, "1 of 4" beside it), the stacked list from 768px up. It stays one <ul> of
 * <li>s at every width, so a screen reader hears "list, 4 items" and every card's content;
 * nothing is hidden, only laid out sideways. The strip itself takes focus, so arrow keys
 * scroll it, and tabbing into a card scrolls that card into view.
 */
export function BreakStrip({ count, label, children }: { count: number; label: string; children: ReactNode }) {
  const listRef = useRef<HTMLUListElement>(null);
  const [current, setCurrent] = useState(0);
  // Only the phone strip scrolls, so only there is the list itself a tab stop.
  const stacked = useMinWidth(768) === true;
  const indexFromScroll = useCallback(() => {
    const list = listRef.current;
    const first = list?.firstElementChild as HTMLElement | null;
    if (!list || !first) return;
    const step = first.getBoundingClientRect().width + 12;
    if (!step) return;
    setCurrent(Math.max(0, Math.min(count - 1, Math.round(list.scrollLeft / step))));
  }, [count]);
  useEffect(() => { indexFromScroll(); }, [indexFromScroll]);
  const go = (delta: number) => {
    const list = listRef.current;
    const target = list?.children[Math.max(0, Math.min(count - 1, current + delta))] as HTMLElement | undefined;
    if (!list || !target) return;
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView?.({ inline: 'start', block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  };
  const nav = 'inline-flex h-11 w-11 items-center justify-center rounded-[6px] border border-line-strong bg-surface text-ink hover:border-ink disabled:border-line disabled:text-[var(--disabled-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]';
  return (
    <>
      {count > 1 && (
        <div className="mt-2 flex items-center justify-between gap-2 md:hidden">
          <p className="text-sm font-semibold tabular-nums text-ink" aria-hidden="true">{current + 1} of {count}<span className="font-normal text-muted"> · swipe for more</span></p>
          <span className="flex gap-2">
            <button type="button" className={nav} onClick={() => go(-1)} disabled={current === 0} aria-label="Previous break">
              <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3 5 8l5 5" /></svg>
            </button>
            <button type="button" className={nav} onClick={() => go(1)} disabled={current >= count - 1} aria-label="Next break">
              <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 3 5 5-5 5" /></svg>
            </button>
          </span>
        </div>
      )}
      <ul
        ref={listRef}
        aria-label={label}
        tabIndex={count > 1 && !stacked ? 0 : undefined}
        onScroll={indexFromScroll}
        className="relative m-0 mt-3 flex list-none gap-3 p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] max-md:-mx-4 max-md:snap-x max-md:snap-mandatory max-md:items-stretch max-md:overflow-x-auto max-md:scroll-px-4 max-md:px-4 max-md:pb-1 md:flex-col"
      >
        {children}
      </ul>
    </>
  );
}
