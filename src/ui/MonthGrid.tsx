import { addDays } from '@daysoff/engine/solver/dateUtils';
import type { MarginalValue } from '@daysoff/engine/solver/marginalValue';
import { computeBandSegments, monthLabel, type MonthDescriptor, type OffRun, type WeekStart } from '@daysoff/engine/calendar/calendarMath';
import { COLORS } from './colorScheme';
import { formatCardDateRange } from '@daysoff/engine/calendar/dateFormat';
import { DayCell } from './DayCell';
import type { Alternative, Break } from '@daysoff/engine/solver/types';
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
  /** Public holiday or an employer-added day off; undefined on ordinary days. */
  holidayKindFor?: (iso: string) => 'public' | 'company' | undefined;
  hasHover: boolean;
  onDayClick: (date: string) => void;
  alternativeForDate: (iso: string) => Alternative | undefined;
  onSwapAlternative: (alt: Alternative) => void;
  onHoverAlternative: (id: string | null) => void;
  /** Roving tabindex, owned by Calendar so arrow keys cross month boundaries. */
  activeDate?: string;
  onFocusDay?: (date: string) => void;
  onArrow?: (from: string, direction: 'left' | 'right' | 'up' | 'down' | 'home' | 'end') => void;
  forcedStateOf?: (iso: string) => 'include' | 'exclude' | undefined;
  onSetDayState?: (date: string, state: 'include' | 'exclude' | null) => void;
  pinPreview?: (date: string) => string | null;
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
  holidayKindFor,
  hasHover,
  onDayClick,
  alternativeForDate,
  onSwapAlternative,
  onHoverAlternative,
  activeDate,
  onFocusDay,
  onArrow,
  forcedStateOf,
  onSetDayState,
  pinPreview,
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
  const breakIndexOf = (iso: string) => {
    const runIndex = offRuns.findIndex((run) => iso >= run.start && iso <= run.end);
    return runIndex === -1 ? undefined : breakBandByRunIndex.get(runIndex)?.index;
  };

  // Standalone use (no Calendar-owned roving focus): arrows stay within this month.
  const moveFocus = (fromDate: string, direction: 'left' | 'right' | 'up' | 'down' | 'home' | 'end') => {
    if (onArrow) return onArrow(fromDate, direction);
    if (direction === 'home' || direction === 'end') return;
    const delta = direction === 'left' ? -1 : direction === 'right' ? 1 : direction === 'up' ? -7 : 7;
    const target = addDays(fromDate, delta);
    if (!validDates.has(target)) return;
    document.getElementById(`day-${target}`)?.focus();
  };

  return (
    <div className="min-w-0">
      <h3 className="mb-2 border-b border-line pb-1.5 text-lg font-bold leading-6 text-ink type-condensed">{monthLabel(descriptor.year, descriptor.month)}</h3>
      <div className="mb-1 grid grid-cols-7 gap-x-1 text-center text-xs font-medium text-muted">
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
                      {/* A label, not a tab stop: each day in the run says "part of break N"
                          in its own accessible name, so the badge is a picture of that. */}
                      <span
                        aria-hidden="true"
                        title={`Break ${band.index}, ${formatCardDateRange(band.brk.start, band.brk.end)}`}
                        onMouseEnter={() => onHoverBreak(band.brk.id)}
                        onMouseLeave={() => onHoverBreak(null)}
                        className="flex h-6 min-w-6 items-center justify-center rounded-[6px] bg-accent px-1 text-xs font-bold leading-none tabular-nums text-white"
                      >
                        {band.index}
                      </span>
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
                    className={`border-b-[3px] border-[var(--accent)] ${COLORS.bandBg} ${seg.roundedLeft ? 'rounded-l-[8px]' : ''} ${
                      seg.roundedRight ? 'rounded-r-[8px]' : ''
                    }`}
                  />
                ))}
                {previewSegments.map((seg, i) => (
                  <div
                    key={`preview-${i}`}
                    style={{ gridColumn: `${seg.colStart + 1} / ${seg.colEnd + 2}`, gridRow: '1' }}
                    className={`${COLORS.previewBandBg} ${seg.roundedLeft ? 'rounded-l-[8px]' : ''} ${
                      seg.roundedRight ? 'rounded-r-[8px]' : ''
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
                          holidayKind={holidayKindFor?.(iso)}
                          hasHover={hasHover}
                          onToggle={onDayClick}
                          onSwapAlternative={alt ? () => onSwapAlternative(alt) : undefined}
                          onHoverAlternativeStart={alt ? () => onHoverAlternative(alt.id) : undefined}
                          onHoverAlternativeEnd={alt ? () => onHoverAlternative(null) : undefined}
                          onArrowKey={(direction) => moveFocus(iso, direction)}
                          tabIndex={activeDate === undefined ? undefined : iso === activeDate ? 0 : -1}
                          onFocusDay={onFocusDay}
                          breakIndex={breakIndexOf(iso)}
                          forcedState={forcedStateOf?.(iso)}
                          onSetState={onSetDayState}
                          pinPreview={pinPreview}
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
