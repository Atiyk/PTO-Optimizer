import { useState } from 'react';
import { TopBar } from './TopBar';
import { MoreOptions } from './MoreOptions';
import { Calendar } from './Calendar';
import { Legend } from './Legend';
import { BreakCard } from './BreakCard';
import { SummaryStrip } from './SummaryStrip';
import { FAQ } from './FAQ';
import { useAppState, todayISO } from './useAppState';
import { useHasHover } from './useHasHover';

export function App() {
  const [moreOpen, setMoreOpen] = useState(false);
  const state = useAppState();
  const hasHover = useHasHover();
  const today = todayISO();

  const previewRun = state.hoveredAlternative
    ? { start: state.hoveredAlternative.start, end: state.hoveredAlternative.end }
    : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <TopBar
        country={state.country}
        subdivision={state.subdivision}
        onChangeCountry={state.setCountry}
        onChangeSubdivision={state.setSubdivision}
        rangeStart={state.rangeStart}
        rangeEnd={state.rangeEnd}
        onChangeRangeStart={state.setRangeStart}
        onChangeRangeEnd={state.setRangeEnd}
        budget={state.budget}
        onChangeBudget={state.setBudget}
        budgetSpent={state.budgetSpent}
        w={state.w}
        onChangeW={state.setW}
        manualBreakCount={state.manualBreakCount}
        onChangeManualBreakCount={state.setManualBreakCount}
        letSolverDecide={state.letSolverDecide}
        onToggleLetSolverDecide={state.setLetSolverDecide}
        breaks={state.breaks}
        breakCountRequested={state.breakCountRequested}
        breakCountActual={state.breakCountActual}
        showAlternatives={state.showAlternatives}
        onChangeShowAlternatives={state.setShowAlternatives}
        moreOpen={moreOpen}
        onToggleMore={() => setMoreOpen((v) => !v)}
      />

      {moreOpen && (
        <MoreOptions
          weekStartOverride={state.weekStartOverride}
          onChangeWeekStartOverride={state.setWeekStartOverride}
          accrualEnabled={state.accrualEnabled}
          onToggleAccrual={state.setAccrualEnabled}
          accrualPerMonth={state.accrualPerMonth}
          onChangeAccrualPerMonth={state.setAccrualPerMonth}
          expiryEnabled={state.expiryEnabled}
          onToggleExpiry={state.setExpiryEnabled}
          expiryDate={state.expiryDate}
          onChangeExpiryDate={state.setExpiryDate}
          carryoverCap={state.carryoverCap}
          onChangeCarryoverCap={state.setCarryoverCap}
          overlapDays={state.overlapDays}
          onAddOverlapDay={(d) => state.setOverlapDays([...state.overlapDays, d])}
          onRemoveOverlapDay={(d) => state.setOverlapDays(state.overlapDays.filter((x) => x !== d))}
          workWeek={state.workWeek}
          onChangeWorkWeek={state.setWorkWeek}
          blackouts={state.blackouts}
          onAddBlackout={(d) => state.setBlackouts([...state.blackouts, d])}
          onRemoveBlackout={(d) => state.setBlackouts(state.blackouts.filter((x) => x !== d))}
          holidayEntries={state.holidayEntries}
          onRemoveHoliday={state.removeHoliday}
          onToggleStateHoliday={state.toggleStateHoliday}
          onAddCustomHoliday={state.addCustomHoliday}
        />
      )}

      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <Legend />
      </div>

      <main className="mx-auto max-w-6xl p-4">
        <Calendar
          rangeStart={state.rangeStart}
          rangeEnd={state.rangeEnd}
          weekStart={state.weekStart}
          today={today}
          offRuns={state.offRuns}
          previewRun={previewRun}
          categoryOf={state.categoryOf}
          isBlackoutDay={state.isBlackoutDay}
          overlapSet={state.overlapSet}
          marginalValues={state.marginalValues}
          holidayNameFor={state.holidayNameFor}
          hasHover={hasHover}
          onDayClick={state.toggleDay}
          alternativeForDate={state.alternativeForDate}
          onSwapAlternative={state.swapAlternative}
          onHoverAlternative={state.setHoveredAlternativeId}
        />

        <p className="mt-2 text-xs text-slate-400">
          Click any day to pin it in or rule it out. Hover or focus a day to see what it would gain.
        </p>

        <div className="mt-4">
          <SummaryStrip budgetSpent={state.budgetSpent} totalDaysOff={state.totalDaysOff} scores={state.scores} />
        </div>

        <div className="mt-6 flex flex-col gap-3">
          {state.breaks.length === 0 && (
            <p className="text-sm text-slate-500">
              No PTO-worthy breaks fit this range and budget yet &mdash; try widening the date range or increasing
              PTO days.
            </p>
          )}
          {state.breaks.map((b) => (
            <BreakCard key={b.id} brk={b} highlighted={state.highlightedBreakIds.has(b.id)} />
          ))}
        </div>

        <FAQ />
      </main>
    </div>
  );
}
