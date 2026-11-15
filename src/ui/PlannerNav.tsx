import { useEffect, useState, type RefObject } from 'react';
import { compactBarDetail } from './Headline';

export interface PlannerNavItem {
  /** The id of the section this item jumps to. */
  id: string;
  label: string;
  /** Runs before the jump (open a closed disclosure the target sits in, for example). */
  onSelect?: () => void;
}

interface PlannerNavProps {
  /** The result block: the bar appears once it has scrolled out of view. */
  watch: RefObject<HTMLElement | null>;
  items: readonly PlannerNavItem[];
  /** The plan's figure, kept in view while the person works below. Omitted when there is no plan. */
  result?: { totalDaysOff: number; budgetSpent: number; breakCountActual: number };
}

/**
 * The planner's wayfinding. Once the result has scrolled away, a slim bar pins to the top with
 * the plan's figure and one tap to each part of the page (breaks, calendar, settings, sharing),
 * the current one marked. On a phone the planner is several screens long; this turns a long
 * scroll into four places.
 *
 * A real nav while visible; inert while hidden, so it is never a hidden tab stop. The current
 * section comes from scroll position (the nearest section whose top has passed the bar).
 */
export function PlannerNav({ watch, items, result }: PlannerNavProps) {
  const [visible, setVisible] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    const el = watch.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0));
    observer.observe(el);
    return () => observer.disconnect();
  }, [watch]);

  const ids = items.map((item) => item.id).join('|');
  useEffect(() => {
    if (!visible) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      // The section nearest above the bar, whatever order the items are listed in.
      let active: string | null = null;
      let nearest = -Infinity;
      for (const id of ids.split('|')) {
        const target = document.getElementById(id);
        if (!target || target.offsetParent === null) continue;
        const top = target.getBoundingClientRect().top;
        if (top <= 96 && top > nearest) { nearest = top; active = id; }
      }
      setCurrent(active);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(measure); };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); if (frame) cancelAnimationFrame(frame); };
  }, [visible, ids]);

  return (
    <nav
      aria-label="Plan sections"
      inert={!visible}
      data-planner-nav={visible ? 'shown' : 'hidden'}
      className={`fixed inset-x-0 top-0 z-30 border-b border-line bg-page/90 backdrop-blur-md transition-transform duration-200 ease-[var(--ease-out)] [@media(max-height:500px)]:hidden ${visible ? 'translate-y-0' : '-translate-y-full'}`}
    >
      <div className="mx-auto flex h-12 max-w-7xl items-center gap-3 px-4 sm:px-6">
        {result && (
          <p aria-hidden="true" className="m-0 flex shrink-0 items-baseline gap-2 tabular-nums text-ink">
            <span className="text-lg type-display"><span className="mark">{result.totalDaysOff} {result.totalDaysOff === 1 ? 'day' : 'days'} off</span></span>
            <span className="text-sm text-muted max-md:hidden">{compactBarDetail(result.budgetSpent, result.breakCountActual)}</span>
          </p>
        )}
        <ul className="m-0 ml-auto flex min-w-0 list-none items-center gap-1 overflow-x-auto p-0 [scrollbar-width:none]">
          {items.map((item) => {
            const active = current === item.id;
            return (
              <li key={item.id} className="shrink-0">
                <a
                  href={`#${item.id}`}
                  aria-current={active ? 'location' : undefined}
                  onClick={item.onSelect}
                  className={`inline-flex h-11 items-center rounded-full px-3 text-sm font-semibold transition-colors duration-150 ease-[var(--ease-out)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)] ${active ? 'bg-accent-soft text-accent-ink' : 'text-muted hover:text-ink'}`}
                >
                  {item.label}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
