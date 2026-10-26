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
import { PeakCapBanner } from './PeakCapBanner';
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { sortByContestedness, mostContestedBreakId } from './requestDeadline';
import { useAppState, todayISO } from './useAppState';
import { useHasHover } from './useHasHover';
import { activeCountryPreset } from '../data/countryPresets';

const DEFAULT_INTRO = 'Turn your PTO into more time off — set your dates and budget below, no sign-up needed.';

export function App() {
  // UI density pass: the old two-level "Adjust" (-> nested "More options") disclosure
  // collapsed into one - a single toggle, clearly named for what it contains, instead of a
  // vague "Adjust" that opened a small panel which then had its OWN "More options" button
  // inside it. See the button's own label below for the stated contents.
  const [optionsOpen, setOptionsOpen] = useState(false);
  const state = useAppState();
  const hasHover = useHasHover();
  const today = todayISO();

  const previewRun = state.hoveredAlternative
    ? { start: state.hoveredAlternative.start, end: state.hoveredAlternative.end }
    : null;

  const introText = activeCountryPreset()?.copy ?? DEFAULT_INTRO;

  // Phase 4.2: the most contested break appears FIRST in the rendered list, not
  // chronologically - but each card keeps the NUMBER it has in chronological order
  // (orderedBreaks), the same number the calendar's own badges use, so a card's number
  // never changes just because of where it's drawn in the list.
  const mostContestedId = mostContestedBreakId(state.breaks);
  const chronologicalIndexById = new Map(state.orderedBreaks.map(({ index, brk }) => [brk.id, index]));
  const breaksByContestedness = sortByContestedness(state.breaks).map((brk) => ({
    index: chronologicalIndexById.get(brk.id)!,
    brk,
  }));

  const { showHelp, setShowHelp } = useKeyboardShortcuts({
    onCopyLink: () => document.getElementById('shortcut-copy-link')?.click(),
    onDownloadIcs: () => document.getElementById('shortcut-download-ics')?.click(),
  });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Deliberately NOT line-length-capped like the longer prose elsewhere on the page -
          it's one short sentence that fits a single line at any width this page supports,
          and wrapping it to two lines would directly work against the header-height target
          this whole pass exists to hit. */}
      <p className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm text-slate-600 dark:text-slate-300">
        {introText}
      </p>

      {/* The answer first: large, sticky, directly under the tagline - the most prominent
          thing on the page, visible on load with nothing to configure first. Break count
          and Travel/Efficiency percentiles sit on the same line as the headline (see
          Headline.tsx); "Pin this plan" is a small control beside it, not its own row. */}
      <Headline
        budgetSpent={state.budgetSpent}
        totalDaysOff={state.totalDaysOff}
        breakCountActual={state.breakCountActual}
        scores={state.scores}
        budget={state.budget}
        reserveDays={state.reserveDays}
        canPin={state.canPin}
        onPin={state.pinPlan}
        pinnedCount={state.pinnedPlans.length}
      />

      <PinnedPlansStrip
        summaries={state.pinnedPlans.map((p) => p.summary)}
        onRestore={state.restorePlan}
        onRemove={state.removePinnedPlan}
      />

      {/* UI density pass: country/date-range/PTO-days/reserve and the two plan-shaping
          sliders now share ONE flex row (wrapping to two rows below ~1100px, stacking
          below 768px) instead of two stacked full-width bands. */}
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5">
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
          reserveDays={state.reserveDays}
          onChangeReserveDays={state.setReserveDays}
          effectiveBudget={state.effectiveBudget}
          unlimitedPto={state.unlimitedPto}
          onToggleUnlimitedPto={state.setUnlimitedPto}
        />
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
          budget={state.effectiveBudget}
        />
      </div>

      <div className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2">
        <button
          type="button"
          onClick={() => setOptionsOpen((v) => !v)}
          className="text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100"
        >
          {optionsOpen ? 'Hide options ↑' : 'More options ↓'}
        </button>
        {!optionsOpen && (
          <span className="ml-1.5 text-xs text-slate-400 dark:text-slate-400">
            &mdash; holidays, work week, notice period, days you can&apos;t take off
          </span>
        )}
      </div>

      {optionsOpen && (
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
            noticePeriodDays={state.noticePeriodDays}
            onChangeNoticePeriodDays={state.setNoticePeriodDays}
            peakCapEnabled={state.peakCapEnabled}
            onTogglePeakCap={state.setPeakCapEnabled}
            peakCapStart={state.peakCapStart}
            onChangePeakCapStart={state.setPeakCapStart}
            peakCapEnd={state.peakCapEnd}
            onChangePeakCapEnd={state.setPeakCapEnd}
            peakCapMaxDays={state.peakCapMaxDays}
            onChangePeakCapMaxDays={state.setPeakCapMaxDays}
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
        </div>
      )}

      {state.partnerOverlapReceived && (
        <PartnerOverlapBanner overlapDayCount={state.overlapDays.length} onDismiss={state.dismissPartnerOverlapBanner} />
      )}

      <ValidationBanner issues={state.validationIssues} />

      <PeakCapBanner
        applied={state.peakCapApplied}
        maxDays={state.peakCapMaxDays}
        startDate={state.peakCapStart}
        endDate={state.peakCapEnd}
      />

      {state.holidaysDegraded && (
        <p
          role="status"
          className="border-b border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-4 py-2 text-xs text-slate-600 dark:text-slate-300"
        >
          <span className="block max-w-prose">
            Couldn&apos;t reach public holiday data for this country &mdash; showing weekends and any holidays
            already cached. You can add known holidays manually below, or try again later.
          </span>
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

        <p className="mt-2 max-w-prose text-xs text-slate-400 dark:text-slate-400">
          Click any day to pin it in or rule it out. Hover or focus a day to see what it would gain.
        </p>

        <div className="mt-4 border-t border-slate-200 dark:border-slate-700 pt-4">
          <Legend />
        </div>

        <div className="mt-4">
          <PartnerShareButton buildOverlapLink={state.buildOverlapLink} />
        </div>

        {/* UI density pass: the free export actions move here, below the calendar/break
            list - someone shouldn't be asked to download a plan they haven't looked at
            yet. "Remind me to request time off" and the "Free, no sign-up" line live
            inside ExportBar itself, not as separate bands. */}
        <div className="mt-6 border-t border-slate-200 dark:border-slate-700 pt-4">
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
            noticePeriodDays={state.noticePeriodDays}
          />
        </div>

        <div className="mt-4 flex flex-col gap-3">
          {state.breaks.length === 0 && (
            <p className="max-w-prose text-sm text-slate-500 dark:text-slate-400">
              No PTO-worthy breaks fit this range and budget yet &mdash; try widening the date range or increasing
              PTO days.
            </p>
          )}
          {breaksByContestedness.map(({ index, brk }, position) => (
            <BreakCard
              key={brk.id}
              brk={brk}
              index={index}
              highlighted={state.highlightedBreakIds.has(brk.id) || state.hoveredBreakId === brk.id}
              isPtoDay={state.isSuggestedPto}
              onHover={state.setHoveredBreakId}
              isMostContested={brk.id === mostContestedId}
              today={today}
              noticePeriodDays={state.noticePeriodDays}
              workWeek={state.workWeek}
              defaultExpanded={position === 0}
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
