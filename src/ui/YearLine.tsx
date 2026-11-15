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
  /** The line alone, without break numbers or month names: for small comparison cards. */
  compact?: boolean;
  className?: string;
}

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
 * The plan's dates as one line: the planning range left to right, every break a solid stretch
 * placed and sized by its real dates, holidays as teal ticks above. It answers "when am I off
 * this year?" before anyone reads a list, and on the planner each stretch jumps to its break.
 *
 * Breaks are a real list for assistive tech (each named with its dates); months and holiday
 * ticks are decoration. A stretch is never narrower than 8px, and its link's hit area is the
 * full 44px row height.
 */
export function YearLine({ rangeStart, rangeEnd, breaks, holidayDates = [], hrefFor, activeId, onHover, compact = false, className = '' }: YearLineProps) {
  const origin = isoToSerial(rangeStart);
  const span = Math.max(1, isoToSerial(rangeEnd) - origin + 1);
  const at = (iso: string) => ((isoToSerial(iso) - origin) / span) * 100;
  const clamp = (iso: string) => iso < rangeStart ? rangeStart : iso > rangeEnd ? rangeEnd : iso;
  const months = monthStarts(rangeStart, rangeEnd);
  const numbered = !compact && breaks.length <= 9;

  return (
    <div data-year-line className={`min-w-0 select-none ${className}`}>
      <div className={`relative ${compact ? 'h-6' : 'h-11'}`}>
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
            const start = clamp(brk.start);
            const end = clamp(brk.end);
            const left = at(start);
            const width = ((isoToSerial(end) - isoToSerial(start) + 1) / span) * 100;
            const label = `Break ${index + 1}: ${formatCardDateRange(brk.start, brk.end)}, ${brk.totalDaysOff} days off for ${brk.ptoCost} PTO ${brk.ptoCost === 1 ? 'day' : 'days'}`;
            const active = activeId === brk.id;
            const bar = <>
              <span className={`absolute inset-x-0 top-1/2 h-3.5 -translate-y-1/2 rounded-full bg-accent transition-[height,background-color] duration-150 ease-[var(--ease-out)] group-hover:h-5 group-hover:bg-accent-hover ${active ? 'h-5 bg-accent-hover' : ''}`} />
              {numbered && <span aria-hidden="true" className="absolute bottom-0 left-1/2 -translate-x-1/2 text-xs font-semibold leading-none tabular-nums text-accent-ink">{index + 1}</span>}
              <span className="sr-only">{label}</span>
            </>;
            const style = { left: `${left}%`, width: `max(8px, ${width}%)` };
            const href = hrefFor?.(brk, index);
            return (
              <li key={brk.id} data-line-break={brk.start}>
                {href
                  ? <a href={href} title={label} className="group absolute inset-y-0 block rounded-[6px] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)]" style={style}
                      onMouseEnter={() => onHover?.(brk.id)} onMouseLeave={() => onHover?.(null)} onFocus={() => onHover?.(brk.id)} onBlur={() => onHover?.(null)}>{bar}</a>
                  : <span title={label} className="group absolute inset-y-0 block" style={style}>{bar}</span>}
              </li>
            );
          })}
        </ol>
      </div>
      {!compact && <div aria-hidden="true" className="relative mt-1 h-4 text-xs text-muted">
        <span className="absolute left-0 font-semibold text-ink">{monthShortName(rangeStart)}</span>
        {/* A name at each month's notch; phones keep every third so twelve never collide. */}
        {months.map((first, index) => {
          const left = at(first);
          if (left < 8 || left > 94) return null;
          const sparse = months.length > 13 ? index % 2 === 1 : true;
          if (!sparse) return null;
          return <span key={first} className={`absolute -translate-x-1/2 ${index % 3 === 2 ? '' : 'max-sm:hidden'}`} style={{ left: `${left}%` }}>{monthShortName(first)}</span>;
        })}
      </div>}
    </div>
  );
}
