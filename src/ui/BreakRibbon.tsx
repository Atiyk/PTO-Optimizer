import { mondayIndexedDow } from '@daysoff/engine/solver/dateUtils';
import { formatShort } from '@daysoff/engine/calendar/dateFormat';

const WEEKDAY = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const WEEKDAY_NAME = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
/** Longer breaks drop the per-day labels and become one continuous bar with its two ends named. */
const LABELLED_MAX = 16;

interface BreakRibbonProps {
  /** Every calendar day of the break, in order (a Break's `days`). */
  days: readonly string[];
  isPtoDay: (iso: string) => boolean;
  holidayNameFor?: (iso: string) => string | undefined;
  /** "sm" for dense lists (the homepage plan card), "md" for a break's own card. */
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * One break, drawn day by day: the product's whole idea in one picture. Solid Signal Blue
 * cells are the PTO days you spend; the soft blue cells are the weekend days they join up;
 * teal cells are holidays. One 3px rule runs under the lot ("the line"), so the break reads
 * as a single unbroken stretch. Used wherever a break is named: the homepage plan card, the
 * planner's break cards, saved and requested breaks.
 *
 * It is a picture with one spoken sentence (role="img"); the card around it always states the
 * dates and the PTO days in words, so nothing depends on colour or on seeing the cells.
 */
export function BreakRibbon({ days, isPtoDay, holidayNameFor, size = 'md', className = '' }: BreakRibbonProps) {
  if (days.length === 0) return null;
  const pto = days.filter(isPtoDay);
  const holidays = days.filter((day) => holidayNameFor?.(day));
  const spoken = `${days.length} days off in a row, ${formatShort(days[0])} to ${formatShort(days[days.length - 1])}. `
    + (pto.length ? `PTO on ${pto.map((day) => `${WEEKDAY_NAME[mondayIndexedDow(day)]} ${formatShort(day)}`).join(', ')}. ` : 'No PTO needed. ')
    + (holidays.length ? `Holidays: ${holidays.map((day) => holidayNameFor?.(day)).join(', ')}.` : '');
  const labelled = days.length <= LABELLED_MAX;
  const height = !labelled ? 'h-5' : size === 'sm' ? 'h-10' : 'h-12';

  return (
    <div role="img" aria-label={spoken.trim()} data-break-ribbon className={`min-w-0 ${className}`}>
      <div className={`flex max-w-full overflow-hidden rounded-[8px] bg-band shadow-[inset_0_-3px_0_var(--accent)] ${labelled ? 'w-fit gap-[2px]' : 'gap-px'}`}>
        {days.map((day) => {
          const dow = mondayIndexedDow(day);
          const holiday = holidayNameFor?.(day);
          const ptoDay = isPtoDay(day);
          // A holiday is teal and ringed, so it is a shape as well as a colour.
          const tone = ptoDay ? 'bg-accent text-white' : holiday ? 'bg-holiday-soft text-holiday-ink shadow-[inset_0_0_0_1.5px_var(--holiday-dot)]' : 'text-ink';
          return (
            <span
              key={day}
              data-ribbon-day={ptoDay ? 'pto' : holiday ? 'holiday' : 'off'}
              title={`${WEEKDAY_NAME[dow]} ${formatShort(day)}${ptoDay ? ' · PTO day' : holiday ? ` · ${holiday}` : ''}`}
              className={`relative flex min-w-0 flex-col items-center justify-center pb-[3px] leading-none ${labelled ? (size === 'sm' ? 'w-9 shrink' : 'w-11 shrink') : 'flex-1'} ${height} ${tone}`}
            >
              {labelled && <>
                <span aria-hidden="true" className={`text-xs ${ptoDay ? 'text-white/85' : holiday ? 'text-holiday-ink' : 'text-muted'}`}>{WEEKDAY[dow]}</span>
                <span aria-hidden="true" className={`mt-1 tabular-nums font-semibold ${size === 'sm' ? 'text-sm' : 'text-[15px]'}`}>{Number(day.slice(8))}</span>
              </>}
            </span>
          );
        })}
      </div>
      {!labelled && (
        <div aria-hidden="true" className="mt-1 flex justify-between text-xs tabular-nums text-muted">
          <span>{WEEKDAY_NAME[mondayIndexedDow(days[0])]} {formatShort(days[0])}</span>
          <span>{WEEKDAY_NAME[mondayIndexedDow(days[days.length - 1])]} {formatShort(days[days.length - 1])}</span>
        </div>
      )}
    </div>
  );
}

/** The ribbon's key, said once per list of ribbons rather than under each one. */
export function BreakRibbonKey({ className = '' }: { className?: string }) {
  const swatch = 'inline-block size-3 rounded-[3px]';
  return (
    <p aria-hidden="true" className={`flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted ${className}`}>
      <span className="inline-flex items-center gap-1.5"><span className={`${swatch} bg-accent`} />PTO day</span>
      <span className="inline-flex items-center gap-1.5"><span className={`${swatch} bg-band shadow-[inset_0_-2px_0_var(--accent)]`} />Weekend</span>
      <span className="inline-flex items-center gap-1.5"><span className={`${swatch} bg-holiday-soft shadow-[inset_0_0_0_1.5px_var(--holiday-dot)]`} />Holiday</span>
    </p>
  );
}
