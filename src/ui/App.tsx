import { useState } from 'react';
import { TopBar } from './TopBar';
import { MoreOptions } from './MoreOptions';
import { Calendar } from './Calendar';
import { Legend } from './Legend';
import { BreakCard } from './BreakCard';
import { SummaryStrip } from './SummaryStrip';
import { ExportBar } from './ExportBar';
import { PartnerOverlapBanner } from './PartnerOverlapBanner';
import { FAQ } from './FAQ';
import { CalendarErrorBoundary } from './CalendarErrorBoundary';
import { ValidationBanner } from './ValidationBanner';
import { useAppState, todayISO } from './useAppState';
import { useHasHover } from './useHasHover';
import { activeCountryPreset } from '../data/countryPresets';

const DEFAULT_INTRO = 'Turn your PTO into more time off — set your dates and budget below, no sign-up needed.';

export function App() {
  const [moreOpen, setMoreOpen] = useState(false);
  const state = useAppState();
  const hasHover = useHasHover();
  const today = todayISO();

  const previewRun = state.hoveredAlternative
    ? { start: state.hoveredAlternative.start, end: state.hoveredAlternative.end }
    : null;

  const introText = activeCountryPreset()?.copy ?? DEFAULT_INTRO;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <p className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm text-slate-600 dark:text-slate-300">{introText}</p>
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

      {state.partnerOverlapReceived && (
        <PartnerOverlapBanner overlapDayCount={state.overlapDays.length} onDismiss={state.dismissPartnerOverlapBanner} />
      )}

      <ValidationBanner issues={state.validationIssues} />

      {state.holidaysDegraded && (
        <p
          role="status"
          className="border-b border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-4 py-2 text-xs text-slate-600 dark:text-slate-300"
        >
          Couldn&apos;t reach public holiday data for this country &mdash; showing weekends and any holidays already
          cached. You can add known holidays manually below, or try again later.
        </p>
      )}

      <div className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3">
        <Legend />
      </div>

      <main className="mx-auto max-w-6xl p-4">
        <CalendarErrorBoundary>
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
        </CalendarErrorBoundary>

        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
          Click any day to pin it in or rule it out. Hover or focus a day to see what it would gain.
        </p>

        <div className="mt-4">
          <SummaryStrip budgetSpent={state.budgetSpent} totalDaysOff={state.totalDaysOff} scores={state.scores} />
        </div>

        <ExportBar
          breaks={state.breaks}
          isSuggestedPto={state.isSuggestedPto}
          categoryOf={state.categoryOf}
          rangeStart={state.rangeStart}
          rangeEnd={state.rangeEnd}
          weekStart={state.weekStart}
          budget={state.budget}
          budgetSpent={state.budgetSpent}
          totalDaysOff={state.totalDaysOff}
          travelPercentile={state.scores?.travel.percentile ?? null}
          efficiencyPercentile={state.scores?.efficiency.percentile ?? null}
          buildOverlapLink={state.buildOverlapLink}
        />

        <div className="mt-6 flex flex-col gap-3">
          {state.breaks.length === 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No PTO-worthy breaks fit this range and budget yet &mdash; try widening the date range or increasing
              PTO days.
            </p>
          )}
          {state.breaks.map((b) => (
            <BreakCard key={b.id} brk={b} highlighted={state.highlightedBreakIds.has(b.id)} isPtoDay={state.isSuggestedPto} />
          ))}
        </div>

        <FAQ />
      </main>
    </div>
  );
}
