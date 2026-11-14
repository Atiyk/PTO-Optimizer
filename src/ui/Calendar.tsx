import { useId, useMemo, useState } from 'react';
import { buttonClasses } from './Button';
import { addDays, mondayIndexedDow } from '@daysoff/engine/solver/dateUtils';
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
  /** Public holiday or an employer-added day off; undefined on ordinary days. */
  holidayKindFor?: (iso: string) => 'public' | 'company' | undefined;
  hasHover: boolean;
  onDayClick: (date: string) => void;
  alternativeForDate: (iso: string) => Alternative | undefined;
  onSwapAlternative: (alt: Alternative) => void;
  onHoverAlternative: (id: string | null) => void;
  /** Optional planner extras: explicit per-day choices on touch, and the verified outcome
   * of pinning a day (see DayCell). The sabbatical page omits them. */
  forcedStateOf?: (iso: string) => 'include' | 'exclude' | undefined;
  onSetDayState?: (date: string, state: 'include' | 'exclude' | null) => void;
  pinPreview?: (date: string) => Promise<string | null>;
  /** Phones (under 768px): show only the months holding one of these dates, today or the
   * focused day, with a toggle for the rest. Wider screens always show every month. */
  narrowKeepDates?: readonly string[];
  /** Owned by the page, so "Show all" survives the calendar remounting while a pin re-plans. */
  narrowShowAll?: boolean;
  onNarrowShowAllChange?: (showAll: boolean) => void;
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
  holidayKindFor,
  hasHover,
  onDayClick,
  alternativeForDate,
  onSwapAlternative,
  onHoverAlternative,
  forcedStateOf,
  onSetDayState,
  pinPreview,
  narrowKeepDates,
  narrowShowAll,
  onNarrowShowAllChange,
}: CalendarProps) {
  const months = useMemo(() => buildMonths(rangeStart, rangeEnd, weekStart), [rangeStart, rangeEnd, weekStart]);

  // Roving tabindex: the whole calendar is one tab stop (a year would otherwise be ~365
  // stops). It lands on the last day focused, else today, else the first day of the range;
  // arrows move by day and week across month boundaries, Home/End to the week's ends.
  const [focused, setFocused] = useState<string | null>(null);
  const inRange = (iso: string) => iso >= rangeStart && iso <= rangeEnd;
  const activeDate = focused && inRange(focused) ? focused : inRange(today) ? today : rangeStart;

  // Collapsing is CSS (max-md:hidden), so the prerendered page is already short on a phone
  // and every month stays in the DOM for tablets and desktops. The kept set always includes
  // the roving tab stop's month, so the calendar never loses its one tab stop.
  const [localShowAll, setLocalShowAll] = useState(false);
  const showAll = narrowShowAll ?? localShowAll;
  const setShowAll = (next: boolean) => {
    setLocalShowAll(next);
    onNarrowShowAllChange?.(next);
  };
  const keptMonths = useMemo(() => {
    if (!narrowKeepDates) return null;
    const kept = new Set<string>([today.slice(0, 7), activeDate.slice(0, 7)]);
    for (const iso of narrowKeepDates) kept.add(iso.slice(0, 7));
    return kept;
  }, [narrowKeepDates, today, activeDate]);
  const monthKey = (m: { year: number; month: number }) => `${m.year}-${String(m.month).padStart(2, '0')}`;
  const hiddenCount = keptMonths && !showAll ? months.filter(m => !keptMonths.has(monthKey(m))).length : 0;
  const collapsible = keptMonths !== null && months.some(m => !keptMonths.has(monthKey(m)));
  const listId = useId();
  const onArrow = (from: string, direction: 'left' | 'right' | 'up' | 'down' | 'home' | 'end') => {
    const column = (mondayIndexedDow(from) + (weekStart === 0 ? 1 : 0)) % 7;
    const delta =
      direction === 'left' ? -1 : direction === 'right' ? 1 : direction === 'up' ? -7 : direction === 'down' ? 7 : direction === 'home' ? -column : 6 - column;
    let target = addDays(from, delta);
    if (target < rangeStart) target = direction === 'home' ? rangeStart : from;
    if (target > rangeEnd) target = direction === 'end' ? rangeEnd : from;
    // A month collapsed on a phone is display:none; step on to the next day that is shown.
    const step = direction === 'up' || direction === 'down' ? Math.sign(delta) * 7 : Math.sign(delta);
    while (step && target >= rangeStart && target <= rangeEnd && isHidden(target)) target = addDays(target, step);
    if (target < rangeStart || target > rangeEnd || isHidden(target)) return;
    if (target === from) return;
    setFocused(target);
    document.getElementById(`day-${target}`)?.focus();
  };

  const isHidden = (iso: string) => {
    const el = document.getElementById(`day-${iso}`);
    return !el || (typeof el.getClientRects === 'function' && el.getClientRects().length === 0 && el.closest('[data-collapsed-month="true"]') !== null);
  };

  return (
    // Two months, not three: the calendar now shares its container with the recommendations
    // column (Phase 2's two-column workspace), so a 3-month grid no longer has the width to
    // keep day cells comfortably sized - two is what actually fits well at every width this
    // component is used at, tablet's own full-width single-column layout included.
    // Months flow by the width the calendar actually has (a container query), not the
    // viewport: beside the planner's control rail it gets about 850px at 1440, full width on
    // a tablet, and the sabbatical page's own column elsewhere.
    // F09: below 400px the planner's calendar card runs edge to edge (App.tsx) so seven
    // columns get the whole screen width; month titles and the toggle keep their own inset.
    <div className="@container">
    <div id={listId} className="grid grid-cols-1 gap-x-8 gap-y-6 @min-[36rem]:grid-cols-2">
      {months.map((m) => {
        const collapsed = hiddenCount > 0 && !keptMonths!.has(monthKey(m));
        return (
        <div key={`${m.year}-${m.month}`} data-collapsed-month={collapsed ? 'true' : undefined} className={collapsed ? 'min-w-0 max-md:hidden' : 'min-w-0'}>
        <MonthGrid
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
          holidayKindFor={holidayKindFor}
          hasHover={hasHover}
          onDayClick={onDayClick}
          alternativeForDate={alternativeForDate}
          onSwapAlternative={onSwapAlternative}
          onHoverAlternative={onHoverAlternative}
          activeDate={activeDate}
          onFocusDay={setFocused}
          onArrow={onArrow}
          forcedStateOf={forcedStateOf}
          onSetDayState={onSetDayState}
          pinPreview={pinPreview}
        />
        </div>
        );
      })}
    </div>
    {collapsible && (
      <div className="mt-5 flex flex-col items-start gap-1 max-[400px]:px-2 md:hidden">
        {!showAll && <p className="text-sm text-muted">Showing {months.length - hiddenCount} of {months.length} months: the ones with a break, a day you set, or today.</p>}
        <button type="button" aria-expanded={showAll} aria-controls={listId} onClick={() => setShowAll(!showAll)} className={buttonClasses('secondary', 'md', 'w-full justify-center')}>
          {showAll ? 'Show fewer months' : `Show all ${months.length} months`}
        </button>
      </div>
    )}
    </div>
  );
}
