import { addDays } from '../solver/dateUtils';
import type { MarginalValue } from '../solver/marginalValue';
import { computeBandSegments, monthLabel, type MonthDescriptor, type OffRun, type WeekStart } from './calendarMath';
import { COLORS } from './colorScheme';
import { DayCell } from './DayCell';
import type { Alternative } from '../solver/types';
import type { DayCategory } from './types';

interface MonthGridProps {
  descriptor: MonthDescriptor;
  rangeStart: string;
  rangeEnd: string;
  offRuns: OffRun[];
  previewRun: OffRun | null;
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
    <div className="rounded-lg border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
      <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">{monthLabel(descriptor.year, descriptor.month)}</h3>
      <div className="mb-1 grid grid-cols-7 text-center text-xs text-slate-400 dark:text-slate-400">
        {labels.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        {descriptor.weeks.map((week, wIdx) => {
          const segments = computeBandSegments(week, offRuns);
          const previewSegments = previewRun ? computeBandSegments(week, [previewRun]) : [];
          return (
            <div key={wIdx} className="relative grid grid-cols-7 gap-x-1" style={{ gridTemplateRows: '3rem' }}>
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
          );
        })}
      </div>
    </div>
  );
}
