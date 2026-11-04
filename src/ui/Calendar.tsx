import { useMemo } from 'react';
import { buildMonths, type OffRun, type WeekStart } from '@daysoff/engine/calendar/calendarMath';
import { MonthGrid } from './MonthGrid';
import type { MarginalValue } from '@daysoff/engine/solver/marginalValue';
import type { Alternative, Break } from '@daysoff/engine/solver/types';
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
    // Two months, not three: the calendar now shares its container with the recommendations
    // column (Phase 2's two-column workspace), so a 3-month grid no longer has the width to
    // keep day cells comfortably sized - two is what actually fits well at every width this
    // component is used at, tablet's own full-width single-column layout included.
    // Months flow by the width the calendar actually has (a container query), not the
    // viewport: beside the planner's control rail it gets about 850px at 1440, full width on
    // a tablet, and the sabbatical page's own column elsewhere.
    <div className="@container">
    <div className="grid grid-cols-1 gap-x-8 gap-y-6 @min-[36rem]:grid-cols-2">
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
    </div>
  );
}
