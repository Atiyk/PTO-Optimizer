import { useMemo } from 'react';
import type { Break } from '@daysoff/engine/solver/types';
import { buildMonths, monthLabel } from '@daysoff/engine/calendar/calendarMath';
import { formatCardDateRange } from '@daysoff/engine/calendar/dateFormat';
import { COLORS } from './colorScheme';
import type { DayCategory } from './types';

interface YearOverviewProps {
  rangeStart: string;
  rangeEnd: string;
  breaks: readonly Break[];
  isPtoDay: (iso: string) => boolean;
  categoryOf: (iso: string) => DayCategory;
}

const pad = (n: number) => String(n).padStart(2, '0');
const SHORT = new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' });

/**
 * The phone calendar's default view: one row per month, one thin cell per day, so the whole
 * year and where each break falls fit on about one screen. Position and fill only (PTO is the
 * solid accent, the rest of a break the band colour), so it reads in greyscale too. It is a
 * picture of the plan, not a date picker: the full month grids, where days can be set, are one
 * tap away. Screen readers get one plain sentence per month instead of 31 cells.
 */
export function YearOverview({ rangeStart, rangeEnd, breaks, isPtoDay, categoryOf }: YearOverviewProps) {
  const months = useMemo(() => buildMonths(rangeStart, rangeEnd), [rangeStart, rangeEnd]);
  const breakOf = useMemo(() => {
    const map = new Map<string, Break>();
    for (const brk of breaks) for (const day of brk.days) map.set(day, brk);
    return map;
  }, [breaks]);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <ul aria-label="Your year at a glance" className="m-0 flex list-none flex-col gap-1 p-0">
        {months.map(({ year, month }) => {
          const key = `${year}-${pad(month)}`;
          const length = new Date(Date.UTC(year, month, 0)).getUTCDate();
          const days = Array.from({ length }, (_, i) => `${key}-${pad(i + 1)}`);
          const monthBreaks = breaks.filter((brk) => brk.days.some((d) => d.startsWith(key)));
          const pto = days.filter((d) => d >= rangeStart && d <= rangeEnd && breakOf.has(d) && isPtoDay(d)).length;
          const spoken = monthBreaks.length === 0
            ? `${monthLabel(year, month)}: no breaks.`
            : `${monthLabel(year, month)}: ${monthBreaks.map((brk) => `break ${formatCardDateRange(brk.start, brk.end)}`).join(', ')}${pto ? `, ${pto} PTO ${pto === 1 ? 'day' : 'days'} this month` : ''}.`;
          return (
            <li key={key} data-overview-month={key} className="grid min-w-0 grid-cols-[3rem_minmax(0,1fr)_3rem] items-center gap-2">
              <span aria-hidden="true" className="text-xs font-semibold text-ink">
                {SHORT.format(new Date(Date.UTC(year, month - 1, 1)))}
                {month === 1 || key === rangeStart.slice(0, 7) ? <span className="text-[10px] font-normal text-muted"> {String(year).slice(2)}&rsquo;</span> : null}
              </span>
              <span aria-hidden="true" className="grid h-4 min-w-0 grid-cols-[repeat(31,minmax(0,1fr))] gap-px">
                {days.map((day) => {
                  const inRange = day >= rangeStart && day <= rangeEnd;
                  const brk = inRange ? breakOf.get(day) : undefined;
                  const category = inRange ? categoryOf(day) : undefined;
                  const fill = !inRange ? 'bg-transparent'
                    : brk && isPtoDay(day) ? COLORS.ptoBg
                    : brk ? COLORS.bandBg
                    : category === 'public-holiday' ? 'bg-holiday-soft'
                    : category === 'weekend' ? 'bg-weekend'
                    : 'bg-surface-alt';
                  return <span key={day} data-day={day} className={`min-w-0 rounded-[2px] ${fill}`} />;
                })}
              </span>
              <span aria-hidden="true" className="text-right text-xs tabular-nums text-muted">{pto ? `${pto} PTO` : ''}</span>
              <span className="sr-only">{spoken}</span>
            </li>
          );
        })}
      </ul>
      <ul aria-hidden="true" className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs text-muted">
        <li className="flex items-center gap-1.5"><span className={`h-3 w-3 rounded-[2px] ${COLORS.ptoBg}`} />PTO day</li>
        <li className="flex items-center gap-1.5"><span className={`h-3 w-3 rounded-[2px] ${COLORS.bandBg}`} />Rest of a break</li>
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[2px] bg-holiday-soft" />Holiday</li>
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[2px] bg-weekend" />Weekend</li>
      </ul>
    </div>
  );
}
