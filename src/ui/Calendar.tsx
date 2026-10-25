import { useMemo } from 'react';
import { buildMonths, type OffRun, type WeekStart } from './calendarMath';
import { MonthGrid } from './MonthGrid';
import type { MarginalValue } from '../solver/marginalValue';
import type { Alternative, Break } from '../solver/types';
import type { DayCategory } from './types';

interface CalendarProps {
  rangeStart: string;
  rangeEnd: string;
  weekStart: WeekStart;
  today: string;
  offRuns: OffRun[];
  previewRun: OffRun | null;
  breakBandByRunIndex: Map<number, { index: number; brk: Break }>;
  hoveredBreakDaySet: Set<string>;
  onHoverBreak: (id: string | null) => void;
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

export function Calendar({
  rangeStart,
  rangeEnd,
  weekStart,
  today,
  offRuns,
  previewRun,
  breakBandByRunIndex,
  hoveredBreakDaySet,
  onHoverBreak,
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
}: CalendarProps) {
  const months = useMemo(() => buildMonths(rangeStart, rangeEnd, weekStart), [rangeStart, rangeEnd, weekStart]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {months.map((m) => (
        <MonthGrid
          key={`${m.year}-${m.month}`}
          descriptor={m}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          offRuns={offRuns}
          previewRun={previewRun}
          breakBandByRunIndex={breakBandByRunIndex}
          hoveredBreakDaySet={hoveredBreakDaySet}
          onHoverBreak={onHoverBreak}
          weekStart={weekStart}
          today={today}
          categoryOf={categoryOf}
          isBlackoutDay={isBlackoutDay}
          overlapSet={overlapSet}
          marginalValues={marginalValues}
          holidayNameFor={holidayNameFor}
          hasHover={hasHover}
          onDayClick={onDayClick}
          alternativeForDate={alternativeForDate}
          onSwapAlternative={onSwapAlternative}
          onHoverAlternative={onHoverAlternative}
        />
      ))}
    </div>
  );
}
