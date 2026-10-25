import { addDays } from '../solver/dateUtils';
import type { MarginalValue } from '../solver/marginalValue';
import { computeBandSegments, monthLabel, type MonthDescriptor, type OffRun, type WeekStart } from './calendarMath';
import { COLORS } from './colorScheme';
import { DayCell } from './DayCell';
import type { Alternative, Break } from '../solver/types';
import type { DayCategory } from './types';

interface MonthGridProps {
  descriptor: MonthDescriptor;
  rangeStart: string;
  rangeEnd: string;
  offRuns: OffRun[];
  previewRun: OffRun | null;
  breakBandByRunIndex: Map<number, { index: number; brk: Break }>;
  hoveredBreakDaySet: Set<string>;
  onHoverBreak: (id: string | null) => void;
  weekStart: WeekStart;
  today: string;
  categoryOf: (iso: string) => DayCategory;
  isBlackoutDay: (iso: string) => boolean;
  overlapSet: Set<string>;
  marginalValues: Map<string, MarginalValue>;
  holidayNameFor: (iso: string) => string | undefined;
  hasHover: boolean;
  onDayClick: (date: string) => void;
  alternativeForDate: (iso: string) => Alternative | undefined;
  onSwapAlternative: (alt: Alternative) => void;
  onHoverAlternative: (id: string | null) => void;
}

const WEEKDAY_LABELS_MONDAY = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const WEEKDAY_LABELS_SUNDAY = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function MonthGrid({
  descriptor,
  rangeStart,
  rangeEnd,
  offRuns,
  previewRun,
  breakBandByRunIndex,
  hoveredBreakDaySet,
  onHoverBreak,
  weekStart,
  today,
  categoryOf,
  isBlackoutDay,
  overlapSet,
  marginalValues,
  holidayNameFor,
  hasHover,
  onDayClick,
  alternativeForDate,
  onSwapAlternative,
  onHoverAlternative,
}: MonthGridProps) {
  const labels = weekStart === 0 ? WEEKDAY_LABELS_SUNDAY : WEEKDAY_LABELS_MONDAY;
  // Padding always builds exactly 6 rows (42 cells) so every month box lines up at a fixed
  // height regardless of how many real weeks that month needs - but a trailing row with no
  // real date in it at all (pure grid padding, not an out-of-range date) is dead space with
  // nothing to render. Only trailing all-null rows are dropped; a row with even one real
  // date stays, so a mid-month 5th/6th week is never cut off.
  let lastRealRow = descriptor.weeks.length - 1;
  while (lastRealRow > 0 && descriptor.weeks[lastRealRow].every((d) => d === null)) lastRealRow -= 1;
  const weeks = descriptor.weeks.slice(0, lastRealRow + 1);

  // Out-of-range days are real dates now (rendered muted/disabled), not null padding -
  // arrow-key navigation must still skip them, the same as it always skipped the null
  // padding cells, since a disabled button can't actually receive focus() anyway.
  const validDates = new Set(
    descriptor.weeks
      .flat()
      .filter((d): d is string => d !== null)
      .filter((d) => d >= rangeStart && d <= rangeEnd),
  );

  const inBand = (iso: string) => offRuns.some((run) => iso >= run.start && iso <= run.end);

  const moveFocus = (fromDate: string, direction: 'left' | 'right' | 'up' | 'down') => {
    const delta = direction === 'left' ? -1 : direction === 'right' ? 1 : direction === 'up' ? -7 : 7;
    const target = addDays(fromDate, delta);
    if (!validDates.has(target)) return; // arrow-key navigation is bounded to this month
    document.getElementById(`day-${target}`)?.focus();
  };

  return (
    <div className="rounded-lg border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-2">
      <h3 className="mb-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">{monthLabel(descriptor.year, descriptor.month)}</h3>
      <div className="mb-1 grid grid-cols-7 text-center text-xs text-slate-400 dark:text-slate-400">
        {labels.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        {weeks.map((week, wIdx) => {
          const segments = computeBandSegments(week, offRuns);
          const previewSegments = previewRun ? computeBandSegments(week, [previewRun]) : [];
          // The badge sits in a thin row directly above the week its band starts in -
          // never overlaid on top of the band/day-cell row itself, since a suggested-PTO
          // cell is routinely the band's own leading cell and would silently hide
          // anything drawn underneath it there. Text detail ("N days off - M PTO") lives
          // on the break card now, not here - at ~65px of cell width there was no room
          // for ~110px of text without truncating to illegibility; the number is the only
          // thing the calendar promises to show, and the card is the one place the detail
          // lives (see BreakCard.tsx).
          const leadingLabels = segments
            .filter((seg) => seg.roundedLeft)
            .map((seg) => ({ seg, band: breakBandByRunIndex.get(seg.runIndex) }))
            .filter((x): x is { seg: typeof x.seg; band: NonNullable<typeof x.band> } => !!x.band);
          return (
            <div key={wIdx} className="flex flex-col gap-0.5">
              {leadingLabels.length > 0 && (
                <div className="grid grid-cols-7 gap-x-1">
                  {leadingLabels.map(({ seg, band }) => (
                    <div key={`label-${seg.colStart}`} style={{ gridColumn: seg.colStart + 1 }} className="flex items-center">
                      <button
                        type="button"
                        tabIndex={-1}
                        aria-hidden
                        onMouseEnter={() => onHoverBreak(band.brk.id)}
                        onMouseLeave={() => onHoverBreak(null)}
                        className="flex h-3.5 w-3.5 cursor-default items-center justify-center rounded-full bg-slate-600 dark:bg-slate-400 text-[9px] font-semibold leading-none text-white dark:text-slate-900"
                      >
                        {band.index}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="relative grid grid-cols-7 gap-x-1" style={{ gridTemplateRows: '3rem' }}>
                {/*
                  Bands sit flush within their own row's box (no negative vertical margin).
                  A previous version used a negative margin to make the band "taller", which
                  bled into the inter-row gap and visually fused separate weeks' bands
                  together down the Sat/Su column - never let a segment extend outside its
                  own row's grid box.
                */}
                {segments.map((seg, i) => (
                  <div
                    key={`band-${i}`}
                    style={{ gridColumn: `${seg.colStart + 1} / ${seg.colEnd + 2}`, gridRow: '1' }}
                    className={`my-0.5 ${COLORS.bandBg} ${seg.roundedLeft ? 'rounded-l-xl' : ''} ${
                      seg.roundedRight ? 'rounded-r-xl' : ''
                    }`}
                  />
                ))}
                {previewSegments.map((seg, i) => (
                  <div
                    key={`preview-${i}`}
                    style={{ gridColumn: `${seg.colStart + 1} / ${seg.colEnd + 2}`, gridRow: '1' }}
                    className={`my-0.5 ${COLORS.previewBandBg} ${seg.roundedLeft ? 'rounded-l-xl' : ''} ${
                      seg.roundedRight ? 'rounded-r-xl' : ''
                    }`}
                  />
                ))}
                {week.map((iso, i) => {
                  const alt = iso ? alternativeForDate(iso) : undefined;
                  return (
                    <div key={iso ?? `empty-${i}`} style={{ gridColumn: i + 1, gridRow: '1' }}>
                      {iso && (
                        <DayCell
                          date={iso}
                          dayOfMonth={Number(iso.slice(8, 10))}
                          category={categoryOf(iso)}
                          hasOverlap={overlapSet.has(iso)}
                          isAlternative={!!alt}
                          isToday={iso === today}
                          inBand={inBand(iso)}
                          isHighlighted={hoveredBreakDaySet.has(iso)}
                          isBlackout={isBlackoutDay(iso)}
                          isOutOfRange={iso < rangeStart || iso > rangeEnd}
                          marginalValue={marginalValues.get(iso) ?? null}
                          holidayName={holidayNameFor(iso)}
                          hasHover={hasHover}
                          onToggle={onDayClick}
                          onSwapAlternative={alt ? () => onSwapAlternative(alt) : undefined}
                          onHoverAlternativeStart={alt ? () => onHoverAlternative(alt.id) : undefined}
                          onHoverAlternativeEnd={alt ? () => onHoverAlternative(null) : undefined}
                          onArrowKey={(direction) => moveFocus(iso, direction)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
