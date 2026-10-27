import { useState } from 'react';
import { SiteHeader } from './SiteHeader';
import { Headline } from './Headline';
import { SummaryMetrics } from './SummaryMetrics';
import { PrimaryControls } from './PrimaryControls';
import { PlanSliders } from './PlanSliders';
import { SubdivisionSelect } from './CountrySelect';
import { MoreOptions } from './MoreOptions';
import { Calendar } from './Calendar';
import { Legend } from './Legend';
import { BreakCard } from './BreakCard';
import { PinnedPlansStrip } from './PinnedPlansStrip';
import { ExportBar } from './ExportBar';
import { PartnerOverlapBanner } from './PartnerOverlapBanner';
import { FAQ } from './FAQ';
import { Footer } from './Footer';
import { CalendarErrorBoundary } from './CalendarErrorBoundary';
import { ValidationBanner } from './ValidationBanner';
import { PeakCapBanner } from './PeakCapBanner';
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { Container, SECTION_GAP } from './Container';
import { mostContestedBreakId } from './requestDeadline';
import { breakReason } from './breakReason';
import { useAppState, todayISO } from './useAppState';
import { useHasHover } from './useHasHover';

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

  // Layout fix: cards render in DATE order again - badge #1 is the earliest break in the
  // year. The contested flag stays ON the card it belongs to (BreakCard's own
  // isMostContested prop, styled as a neutral inline note, not reordering/red chrome); this
  // line just tells a visitor which card number to look for first, so the information the
  // old reordering carried survives without disturbing the scannable chronological list.
  const mostContestedId = mostContestedBreakId(state.breaks);
  const mostContestedIndex = state.orderedBreaks.find(({ brk }) => brk.id === mostContestedId)?.index;

  const { showHelp, setShowHelp } = useKeyboardShortcuts({
    onCopyLink: () => document.getElementById('shortcut-copy-link')?.click(),
    onDownloadIcs: () => document.getElementById('shortcut-download-ics')?.click(),
  });

  return (
    <div className="min-h-screen bg-white">
      <SiteHeader active="pto" />
      {/* Semantic HTML pass (Phase 5): everything above the workspace - headline, pinned
          plans, controls, banners - is genuinely page-header content, not part of <main>.
          Site restructure: the old per-route tagline paragraph is gone - "no page has a
          subtitle under its h1 except the landing page," and this one only ever restated
          what the headline below it already says. */}
      <header>

      {/* The answer first: large, sticky, directly under the site header - the most prominent
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
          sliders share ONE flex row (wrapping to two rows below ~1100px, stacking below
          768px) instead of two stacked full-width bands. */}
      <div className="border-b border-slate-200 bg-slate-50">
        <Container className="flex flex-wrap items-start gap-x-6 gap-y-3 px-4 py-4">
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
        </Container>
      </div>

      <div className="border-b border-slate-200 bg-slate-50">
        <Container className="px-4 py-4">
          <button
            type="button"
            onClick={() => setOptionsOpen((v) => !v)}
            className="text-sm font-medium text-slate-500 hover:text-slate-800"
          >
            {optionsOpen ? 'Hide options ↑' : 'More options ↓'}
          </button>
          {!optionsOpen && (
            <span className="ml-1.5 text-xs text-slate-400">
              &mdash; holidays, work week, notice period, days you can&apos;t take off
            </span>
          )}
        </Container>
      </div>

      {optionsOpen && (
        <div className="border-b border-slate-200 bg-white">
          <Container className="flex flex-col gap-4 px-4 py-4">
            <SubdivisionSelect
              subdivisions={state.discoveredSubdivisions}
              subdivision={state.subdivision}
              onChangeSubdivision={state.setSubdivision}
            />

            <label className="flex items-center gap-2 text-sm text-slate-600">
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
          </Container>
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
        <div className="border-b border-slate-200 bg-slate-50">
          <Container className="px-4 py-2">
            <p role="status" className="text-xs text-slate-600">
              <span className="block max-w-prose">
                Couldn&apos;t reach public holiday data for this country &mdash; showing weekends and any holidays
                already cached. You can add known holidays manually below, or try again later.
              </span>
            </p>
          </Container>
        </div>
      )}
      </header>

      <main>
        <Container className="p-4">
          <SummaryMetrics
            budgetSpent={state.budgetSpent}
            totalDaysOff={state.totalDaysOff}
            breakCountActual={state.breakCountActual}
            scores={state.scores}
          />

          {/* Phase 3 step 6: export actions sit directly beneath the metrics now, not below
              the calendar/break list - "free, no sign-up, no email" is as much a part of
              the page's first impression as the metrics it sits next to. */}
          <div className={`${SECTION_GAP} border-t border-slate-200 pt-4`}>
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
              buildOverlapLink={state.buildOverlapLink}
            />
          </div>

          {/* Phase 2: the two-column workspace. Calendar (~60%) and recommendations (~40%)
              side by side at lg (1024px) and up - both visible at once, which is what reads
              as a workspace rather than a scroll. Below lg, this collapses to one column
              (recommendations following the calendar) automatically, since the grid itself
              doesn't apply until lg:grid. The recommendations column gets its own
              lg:sticky/overflow-y-auto scroll region so a long list never pushes the
              calendar out of view - overscroll-behavior is left at its default (auto), so
              scrolling past either end of that region falls through to the page as normal,
              never trapped. */}
          <div className={`${SECTION_GAP} lg:grid lg:grid-cols-5 lg:gap-6 lg:items-start`}>
            <div className="flex flex-col gap-4 lg:col-span-3">
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

              <p className="max-w-prose text-xs text-slate-400">
                Click any day to pin it in or rule it out. Hover or focus a day to see what it would gain.
              </p>

              <div className="border-t border-slate-200 pt-4">
                <Legend />
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3 lg:col-span-2 lg:mt-0 lg:sticky lg:top-16 lg:max-h-[calc(100vh-4.5rem)] lg:overflow-y-auto lg:pb-2 lg:pl-1">
              {state.breaks.length === 0 && (
                <p className="max-w-prose text-sm text-slate-500">
                  No PTO-worthy breaks fit this range and budget yet &mdash; try widening the date range or increasing
                  PTO days.
                </p>
              )}
              {state.breaks.length > 1 && mostContestedIndex !== undefined && (
                <p className="text-sm text-slate-600">
                  Request break {mostContestedIndex} first &mdash; it&apos;s the most contested.
                </p>
              )}
              {/* Semantic HTML pass (Phase 5): recommendations are a real list, not div soup -
                  list-none/p-0/m-0 keep it visually identical to the plain flex column it
                  replaces. */}
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {state.orderedBreaks.map(({ index, brk }) => (
                  <li key={brk.id}>
                    <BreakCard
                      brk={brk}
                      index={index}
                      highlighted={state.highlightedBreakIds.has(brk.id) || state.hoveredBreakId === brk.id}
                      isPtoDay={state.isSuggestedPto}
                      onHover={state.setHoveredBreakId}
                      isMostContested={brk.id === mostContestedId}
                      reason={breakReason(brk, state.holidayNameFor)}
                      today={today}
                      noticePeriodDays={state.noticePeriodDays}
                      workWeek={state.workWeek}
                      defaultExpanded={index === 1}
                    />
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className={SECTION_GAP}>
            <FAQ />
          </div>
        </Container>
      </main>

      <Footer onShowShortcuts={() => setShowHelp(true)} />
      <KeyboardShortcutsHelp open={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
}
