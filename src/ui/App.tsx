import { useState } from 'react';
import { Headline } from './Headline';
import { PrimaryControls } from './PrimaryControls';
import { PlanSliders } from './PlanSliders';
import { SubdivisionSelect } from './CountrySelect';
import { MoreOptions } from './MoreOptions';
import { Calendar } from './Calendar';
import { Legend } from './Legend';
import { BreakCard } from './BreakCard';
import { PinnedPlansStrip } from './PinnedPlansStrip';
import { ExportBar } from './ExportBar';
import { PartnerShareButton } from './PartnerShareButton';
import { PartnerOverlapBanner } from './PartnerOverlapBanner';
import { FAQ } from './FAQ';
import { Footer } from './Footer';
import { CalendarErrorBoundary } from './CalendarErrorBoundary';
import { ValidationBanner } from './ValidationBanner';
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { useAppState, todayISO } from './useAppState';
import { useHasHover } from './useHasHover';
import { activeCountryPreset } from '../data/countryPresets';

const DEFAULT_INTRO = 'Turn your PTO into more time off — set your dates and budget below, no sign-up needed.';

export function App() {
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const state = useAppState();
  const hasHover = useHasHover();
  const today = todayISO();

  const previewRun = state.hoveredAlternative
    ? { start: state.hoveredAlternative.start, end: state.hoveredAlternative.end }
    : null;

  const introText = activeCountryPreset()?.copy ?? DEFAULT_INTRO;

  const { showHelp, setShowHelp } = useKeyboardShortcuts({
    onCopyLink: () => document.getElementById('shortcut-copy-link')?.click(),
    onDownloadIcs: () => document.getElementById('shortcut-download-ics')?.click(),
  });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <p className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm text-slate-600 dark:text-slate-300">{introText}</p>

      {/* The answer first: large, sticky, directly under the tagline - the most prominent
          thing on the page, visible on load with nothing to configure first. */}
      <Headline
        budgetSpent={state.budgetSpent}
        totalDaysOff={state.totalDaysOff}
        breakCountActual={state.breakCountActual}
        scores={state.scores}
      />

      <PinnedPlansStrip
        pinnedCount={state.pinnedPlans.length}
        summaries={state.pinnedPlans.map((p) => p.summary)}
        canPin={state.canPin}
        onPin={state.pinPlan}
        onRestore={state.restorePlan}
        onRemove={state.removePinnedPlan}
      />

      {/* The free export actions, directly beneath the result - not buried below the
          calendar. This is the actual payoff of the tool; it shouldn't require scrolling
          past the whole plan to find it. */}
      <div className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3">
        <ExportBar
          breaks={state.breaks}
          isSuggestedPto={state.isSuggestedPto}
          categoryOf={state.categoryOf}
          rangeStart={state.rangeStart}
          rangeEnd={state.rangeEnd}
          weekStart={state.weekStart}
          budgetSpent={state.budgetSpent}
          totalDaysOff={state.totalDaysOff}
          travelPercentile={state.scores?.travel.percentile ?? null}
          efficiencyPercentile={state.scores?.efficiency.percentile ?? null}
        />
      </div>

      <PrimaryControls
        country={state.country}
        onChangeCountry={state.setCountry}
        rangeStart={state.rangeStart}
        rangeEnd={state.rangeEnd}
        onChangeRangeStart={state.setRangeStart}
        onChangeRangeEnd={state.setRangeEnd}
        budget={state.budget}
        onChangeBudget={state.setBudget}
        budgetSpent={state.budgetSpent}
      />

      {/* Always visible, not behind a disclosure - these are how most visitors actually
          shape the plan. Visual hierarchy: result -> country/date-range/PTO-days ->
          these -> the calendar. */}
      <PlanSliders
        w={state.w}
        onChangeW={state.setW}
        manualBreakCount={state.manualBreakCount}
        onChangeManualBreakCount={state.setManualBreakCount}
        letSolverDecide={state.letSolverDecide}
        onToggleLetSolverDecide={state.setLetSolverDecide}
        breaks={state.breaks}
        breakCountRequested={state.breakCountRequested}
        breakCountActual={state.breakCountActual}
        budget={state.budget}
      />

      <div className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2">
        <button
          type="button"
          onClick={() => setAdjustOpen((v) => !v)}
          className="text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100"
        >
          {adjustOpen ? 'Hide adjustments ↑' : 'Adjust ↓'}
        </button>
      </div>

      {adjustOpen && (
        <div className="flex flex-col gap-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-4">
          <SubdivisionSelect
            subdivisions={state.discoveredSubdivisions}
            subdivision={state.subdivision}
            onChangeSubdivision={state.setSubdivision}
          />

          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={state.showAlternatives}
              onChange={(e) => state.setShowAlternatives(e.target.checked)}
            />
            Show alternatives
          </label>

          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            className="self-start text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100"
          >
            {moreOpen ? 'Hide options ↑' : 'More options ↓'}
          </button>

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
              altFridayEnabled={state.altFridayEnabled}
              onToggleAltFriday={state.setAltFridayEnabled}
              altFridayStart={state.altFridayStart}
              onChangeAltFridayStart={state.setAltFridayStart}
              blackouts={state.blackouts}
              onAddBlackout={(d) => state.setBlackouts([...state.blackouts, d])}
              onAddBlackouts={(dates) => state.setBlackouts(Array.from(new Set([...state.blackouts, ...dates])))}
              onRemoveBlackout={(d) => state.setBlackouts(state.blackouts.filter((x) => x !== d))}
              holidayEntries={state.holidayEntries}
              onRemoveHoliday={state.removeHoliday}
              onToggleStateHoliday={state.toggleStateHoliday}
              onAddCustomHoliday={state.addCustomHoliday}
            />
          )}
        </div>
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

      <main className="mx-auto max-w-6xl p-4">
        <CalendarErrorBoundary>
          <Calendar
            rangeStart={state.rangeStart}
            rangeEnd={state.rangeEnd}
            weekStart={state.weekStart}
            today={today}
            offRuns={state.offRuns}
            previewRun={previewRun}
            breakBandByRunIndex={state.breakBandByRunIndex}
            hoveredBreakDaySet={state.hoveredBreakDaySet}
            onHoverBreak={state.setHoveredBreakId}
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

        <p className="mt-2 text-xs text-slate-400 dark:text-slate-400">
          Click any day to pin it in or rule it out. Hover or focus a day to see what it would gain.
        </p>

        <div className="mt-4 border-t border-slate-200 dark:border-slate-700 pt-4">
          <Legend />
        </div>

        <div className="mt-4">
          <PartnerShareButton buildOverlapLink={state.buildOverlapLink} />
        </div>

        <div className="mt-6 flex flex-col gap-3">
          {state.breaks.length === 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No PTO-worthy breaks fit this range and budget yet &mdash; try widening the date range or increasing
              PTO days.
            </p>
          )}
          {state.orderedBreaks.map(({ index, brk }) => (
            <BreakCard
              key={brk.id}
              brk={brk}
              index={index}
              highlighted={state.highlightedBreakIds.has(brk.id) || state.hoveredBreakId === brk.id}
              isPtoDay={state.isSuggestedPto}
              onHover={state.setHoveredBreakId}
            />
          ))}
        </div>

        <FAQ />
      </main>

      <Footer onShowShortcuts={() => setShowHelp(true)} />
      <KeyboardShortcutsHelp open={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
}
