import { useEffect, useRef, type ReactNode } from 'react';

/** DESIGN.md Motion: "160ms when a figure changes, nothing on load, all of it off under
 * prefers-reduced-motion". A short settle (from faint and 3px low to rest) on the house
 * ease-out, so a changed result is noticed without a counting animation. */
const FIGURE_CHANGE_MS = 160;
const FIGURE_CHANGE_KEYFRAMES: Keyframe[] = [
  { opacity: 0.35, transform: 'translateY(3px)' },
  { opacity: 1, transform: 'none' },
];
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** The last value each remembered figure showed, so a figure that is unmounted while the
 * plan updates (the planner hides old numbers until the new plan is ready) still gets its
 * cue when it comes back with a different value. Empty on page load, so nothing moves then. */
const lastShown = new Map<string, unknown>();

/**
 * Plays the figure-change cue on the returned element whenever `value` changes, never on
 * the first render (or, with `memoryKey`, the first time that figure is ever shown). Web
 * Animations, not a re-keyed node: the element (and the live region it sits in) stays the
 * same DOM node, a rapid run of changes (a slider drag) retargets instead of stacking, and
 * nothing runs at all under reduced motion.
 */
function useFigureChangeCue<T extends HTMLElement>(value: unknown, memoryKey?: string) {
  const ref = useRef<T>(null);
  const previous = useRef(memoryKey !== undefined && lastShown.has(memoryKey) ? lastShown.get(memoryKey) : value);
  const running = useRef<Animation | null>(null);
  useEffect(() => {
    if (memoryKey !== undefined) lastShown.set(memoryKey, value);
    if (Object.is(previous.current, value)) return;
    previous.current = value;
    const el = ref.current;
    if (!el || typeof el.animate !== 'function' || prefersReducedMotion()) return;
    running.current?.cancel();
    running.current = el.animate(FIGURE_CHANGE_KEYFRAMES, { duration: FIGURE_CHANGE_MS, easing: EASE_OUT });
  }, [value, memoryKey]);
  useEffect(() => () => running.current?.cancel(), []);
  return ref;
}

/** An inline wrapper that plays the figure-change cue on its contents when `value` changes.
 * Give `memoryKey` when the figure is unmounted between values (see lastShown). */
export function FigureChange({ value, memoryKey, children, className = '' }: { value: unknown; memoryKey?: string; children: ReactNode; className?: string }) {
  const ref = useFigureChangeCue<HTMLSpanElement>(value, memoryKey);
  return <span ref={ref} data-figure-change="" className={`inline-block ${className}`}>{children}</span>;
}

/**
 * Redesign Phase 1: a huge numeral with its label (Apple Weather-style). The number is
 * always passed in from engine output; this only displays it. When the value changes (not
 * on first render) it plays the figure-change cue above.
 */
export function StatNumber({
  value,
  label,
  prefix,
  suffix,
  size = 'display',
  className = '',
}: {
  value: number | string;
  label: ReactNode;
  prefix?: ReactNode;
  suffix?: ReactNode;
  size?: 'display' | 'lg' | 'md';
  className?: string;
}) {
  const numeralRef = useFigureChangeCue<HTMLSpanElement>(value);

  const numeralCls =
    size === 'display'
      ? 'text-display-sm sm:text-display type-display'
      : size === 'lg'
        ? 'text-h1 type-display'
        : 'text-h2 font-bold type-condensed';

  return (
    <div className={`flex flex-col ${className}`}>
      <span className="flex items-baseline gap-2 text-ink">
        {prefix && <span className="text-lg font-medium text-muted">{prefix}</span>}
        <span ref={numeralRef} className={`${numeralCls} tabular-nums`}>
          {value}
        </span>
        {suffix && <span className="text-lg font-medium text-ink">{suffix}</span>}
      </span>
      <span className="mt-1 text-sm text-muted">{label}</span>
    </div>
  );
}
