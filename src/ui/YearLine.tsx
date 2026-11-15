import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { isoToSerial } from '@daysoff/engine/solver/dateUtils';
import { formatCardDateRange, monthShortName } from '@daysoff/engine/calendar/dateFormat';

export interface YearLineBreak {
  id: string;
  start: string;
  end: string;
  totalDaysOff: number;
  ptoCost: number;
}

interface YearLineProps {
  rangeStart: string;
  rangeEnd: string;
  /** Chronological. Each becomes one stretch of the line. */
  breaks: readonly YearLineBreak[];
  holidayDates?: readonly string[];
  /** Given: each stretch is a link to that break (the planner). Omitted: a picture (the homepage). */
  hrefFor?: (brk: YearLineBreak, index: number) => string;
  activeId?: string | null;
  onHover?: (id: string | null) => void;
  /** The line alone, without break numbers or month names: for small comparison cards. Always a picture. */
  compact?: boolean;
  className?: string;
}

/** WCAG 2.5.8 (target size, minimum): every link is at least this wide; the row is 44px tall. */
const MIN_TARGET_PX = 24;
/** A one-day break is under a pixel wide on a phone; the drawn stretch never goes below this. */
const MIN_BAR_PX = 6;
/** Month names: the range's first month sits at the left edge, the rest at least this far apart. */
const MONTH_LABEL_GAP_PX = 48;
const FIRST_MONTH_CLEARANCE_PX = 44;
const MONTH_LABEL_END_CLEARANCE_PX = 16;

function monthStarts(rangeStart: string, rangeEnd: string): string[] {
  const out: string[] = [];
  let [y, m] = rangeStart.split('-').map(Number);
  for (;;) {
    m += 1;
    if (m === 13) { m = 1; y += 1; }
    const first = `${y}-${String(m).padStart(2, '0')}-01`;
    if (first > rangeEnd) return out;
    out.push(first);
  }
}

/**
 * Places one hit area per break along a track `width` px wide, in order, so that none overlap.
 * Each starts centred on its stretch. Sweeping left to right, an area that would overlap the one
 * before joins it in a cluster laid edge to edge; the cluster is centred on its members'
 * stretches (so a crowded pair spreads both ways and each area still sits over its own stretch
 * where it can) and kept inside the track, pulling back from the end when it would run past it.
 * Returns each area's left edge, or null when the areas cannot all fit (the line is then drawn
 * as a picture).
 */
function layoutTargets(targets: readonly { centre: number; size: number }[], width: number): number[] | null {
  const total = targets.reduce((sum, target) => sum + target.size, 0);
  if (total > width) return null;
  // `wants` sums where each member would like the cluster to start (its stretch's centre, less
  // its offset inside the cluster, less half its size); the cluster starts at their mean.
  type Cluster = { first: number; size: number; wants: number; count: number; start: number };
  const place = (cluster: Cluster) => {
    cluster.start = Math.min(Math.max(0, cluster.wants / cluster.count), width - cluster.size);
  };
  const clusters: Cluster[] = [];
  targets.forEach(({ centre, size }, index) => {
    const cluster: Cluster = { first: index, size, wants: centre - size / 2, count: 1, start: 0 };
    place(cluster);
    clusters.push(cluster);
    for (;;) {
      const last = clusters[clusters.length - 1];
      const prev = clusters[clusters.length - 2];
      if (!prev || prev.start + prev.size <= last.start) break;
      // Merged, each member of `last` sits `prev.size` further into the cluster.
      prev.wants += last.wants - last.count * prev.size;
      prev.count += last.count;
      prev.size += last.size;
      place(prev);
      clusters.pop();
    }
  });
  const lefts: number[] = [];
  clusters.forEach((cluster, index) => {
    const end = index + 1 < clusters.length ? clusters[index + 1].first : targets.length;
    let edge = cluster.start;
    for (let member = cluster.first; member < end; member += 1) {
      lefts[member] = edge;
      edge += targets[member].size;
    }
  });
  return lefts;
}

/** The track's rendered width, or null before it is measured (prerender, jsdom, first paint). */
function useTrackWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const next = el.getBoundingClientRect().width;
      setWidth(next > 0 ? next : null);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * The plan's dates as one line: the planning range left to right, every break a solid stretch
 * placed and sized by its real dates (never drawn under 6px), holidays as teal ticks above. It
 * answers "when am I off this year?" before anyone reads a list, and on the planner each
 * stretch jumps to its break.
 *
 * Breaks are a real list for assistive tech (each named with its dates); months and holiday
 * ticks are decoration. Each link's hit area is the full 44px row height and at least 24px
 * wide, centred on its stretch and nudged sideways so neighbours never overlap (their numbers
 * ride on the hit areas, so they never collide either). When the breaks are too dense for that
 * at the line's measured width, the line is a picture there: the break cards below remain the
 * way to each break, and the list still names every break.
 */
export function YearLine({ rangeStart, rangeEnd, breaks, holidayDates = [], hrefFor, activeId, onHover, compact = false, className = '' }: YearLineProps) {
  const [trackRef, measured] = useTrackWidth();
  const width = compact ? null : measured;
  const origin = isoToSerial(rangeStart);
  const span = Math.max(1, isoToSerial(rangeEnd) - origin + 1);
  const at = (iso: string) => ((isoToSerial(iso) - origin) / span) * 100;
  const clamp = (iso: string) => iso < rangeStart ? rangeStart : iso > rangeEnd ? rangeEnd : iso;
  const months = monthStarts(rangeStart, rangeEnd);

  const stretches = breaks.map((brk) => {
    const start = clamp(brk.start);
    const end = clamp(brk.end);
    return { left: at(start), width: ((isoToSerial(end) - isoToSerial(start) + 1) / span) * 100 };
  });
  // Pixel layout, once the track has a width: bars at their dates, hit areas de-collided.
  const px = width === null ? null : stretches.map((stretch) => {
    const barWidth = Math.max(MIN_BAR_PX, (stretch.width / 100) * width);
    const centre = ((stretch.left + stretch.width / 2) / 100) * width;
    return { centre, barWidth, size: Math.max(MIN_TARGET_PX, barWidth) };
  });
  const targetLefts = px === null || width === null ? null : layoutTargets(px, width);
  const dense = px !== null && targetLefts === null;
  const linked = !!hrefFor && !compact && !dense;
  const numbered = !compact && !dense && breaks.length <= 9;

  return (
    <div data-year-line={dense ? 'dense' : linked ? 'linked' : 'picture'} className={`min-w-0 select-none ${className}`}>
      <div ref={trackRef} data-year-line-track className={`relative ${compact ? 'h-6' : 'h-11'}`}>
        {/* The year itself: a quiet track with a notch at each month. */}
        <span aria-hidden="true" className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-surface-alt" />
        {months.map((first) => (
          <span key={first} aria-hidden="true" className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-line" style={{ left: `${at(first)}%` }} />
        ))}
        {holidayDates.filter((date) => date >= rangeStart && date <= rangeEnd).map((date) => (
          <span key={date} aria-hidden="true" className="absolute top-[5px] size-1.5 -translate-x-1/2 rounded-full bg-holiday" style={{ left: `${at(date) + 50 / span}%` }} />
        ))}
        <ol aria-label="Breaks across your dates" className="m-0 list-none p-0">
          {breaks.map((brk, index) => {
            const stretch = stretches[index];
            const placed = px?.[index];
            const label = `Break ${index + 1}: ${formatCardDateRange(brk.start, brk.end)}, ${brk.totalDaysOff} days off for ${brk.ptoCost} PTO ${brk.ptoCost === 1 ? 'day' : 'days'}`;
            const active = activeId === brk.id;
            // Unmeasured, the same shapes in CSS: centred on the stretch, without de-collision.
            // Measured px are written as shares of the measured width, so between a resize and
            // the next measurement the layout scales with the track instead of overflowing it.
            const share = (value: number) => `${(value / (width || 1)) * 100}%`;
            const barStyle: CSSProperties = placed
              ? { left: share(Math.min(Math.max(0, placed.centre - placed.barWidth / 2), (width ?? 0) - placed.barWidth)), width: share(placed.barWidth) }
              : { left: `${stretch.left}%`, width: `max(${MIN_BAR_PX}px, ${stretch.width}%)`, marginLeft: `calc((${stretch.width}% - max(${MIN_BAR_PX}px, ${stretch.width}%)) / 2)` };
            const targetStyle: CSSProperties = placed && targetLefts
              ? { left: share(targetLefts[index]), width: share(placed.size) }
              : { left: `${stretch.left}%`, width: `max(${MIN_TARGET_PX}px, ${stretch.width}%)`, marginLeft: `calc((${stretch.width}% - max(${MIN_TARGET_PX}px, ${stretch.width}%)) / 2)` };
            const number = numbered && <span aria-hidden="true" className="absolute bottom-0 left-1/2 -translate-x-1/2 text-xs font-semibold leading-none tabular-nums text-accent-ink">{index + 1}</span>;
            const href = linked ? hrefFor?.(brk, index) : undefined;
            return (
              <li key={brk.id} data-line-break={brk.start}>
                {href
                  ? <a href={href} title={label} data-line-target className="peer absolute inset-y-0 block rounded-[6px] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)]" style={targetStyle}
                      onMouseEnter={() => onHover?.(brk.id)} onMouseLeave={() => onHover?.(null)} onFocus={() => onHover?.(brk.id)} onBlur={() => onHover?.(null)}>
                      {number}<span className="sr-only">{label}</span>
                    </a>
                  : number && <span aria-hidden="true" data-line-target className="pointer-events-none absolute inset-y-0 block" style={targetStyle}>{number}</span>}
                {/* After the link so it can follow the link's hover and focus (peer). */}
                <span aria-hidden={href ? 'true' : undefined} title={href ? undefined : label} data-line-bar
                  className={`absolute top-1/2 h-3.5 -translate-y-1/2 rounded-full bg-accent transition-[height,background-color] duration-150 ease-[var(--ease-out)] motion-reduce:transition-none peer-hover:h-5 peer-hover:bg-accent-hover peer-focus-visible:h-5 peer-focus-visible:bg-accent-hover ${href ? 'pointer-events-none' : ''} ${active ? 'h-5 bg-accent-hover' : ''}`}
                  style={barStyle} />
                {!href && <span className="sr-only">{label}</span>}
              </li>
            );
          })}
        </ol>
      </div>
      {!compact && <div aria-hidden="true" className="relative mt-1 h-4 text-xs text-muted">
        <span className="absolute left-0 font-semibold text-ink">{monthShortName(rangeStart)}</span>
        {width === null
          // Unmeasured: a name at each month's notch; phones keep every third so twelve never collide.
          ? months.map((first, index) => {
              const left = at(first);
              if (left < 8 || left > 94) return null;
              const sparse = months.length > 13 ? index % 2 === 1 : true;
              if (!sparse) return null;
              return <span key={first} data-month-label className={`absolute -translate-x-1/2 ${index % 3 === 2 ? '' : 'max-sm:hidden'}`} style={{ left: `${left}%` }}>{monthShortName(first)}</span>;
            })
          : monthLabels(months, at, width, span).map(({ first, left }) => (
              <span key={first} data-month-label className="absolute -translate-x-1/2" style={{ left: `${(left / width) * 100}%` }}>{monthShortName(first)}</span>
            ))}
      </div>}
    </div>
  );
}

/**
 * Measured: every month, every 2nd, 3rd, 4th, 6th or 12th (on calendar boundaries: Jan, Apr,
 * Jul, Oct for quarters), whichever is the densest whose names stay at least 48px apart, and
 * none crowding the range's first name or the right edge.
 */
function monthLabels(months: readonly string[], at: (iso: string) => number, width: number, span: number) {
  const monthPx = (width * 28) / span; // the shortest month, so even February keeps the gap
  const step = [1, 2, 3, 4, 6, 12].find((candidate) => candidate * monthPx >= MONTH_LABEL_GAP_PX) ?? 12;
  return months
    .map((first) => ({ first, left: (at(first) / 100) * width, month: Number(first.slice(5, 7)) }))
    .filter(({ left, month }) => (month - 1) % step === 0 && left >= FIRST_MONTH_CLEARANCE_PX && left <= width - MONTH_LABEL_END_CLEARANCE_PX);
}
