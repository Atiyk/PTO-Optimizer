import { PortraitShare } from './PortraitShare';
import { rangeISO, mondayIndexedDow } from '@daysoff/engine/solver/dateUtils';
import { PartnerPlanner } from './PartnerPlanner';
import { readPartnerAvailability } from '../planning/partner';
import { PtoTracker } from './PtoTracker';
import { useRequestLedger } from './useRequestLedger';
import { track } from './analytics';
import { useMemo, useState } from 'react';
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
import { PlanRecoveryNotice } from './PlanRecoveryNotice';
import { PeakCapBanner } from './PeakCapBanner';
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { Container, SECTION_GAP } from './Container';
import { mostContestedBreakId } from '@daysoff/engine/calendar/requestDeadline';
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
  const ledger = useRequestLedger();
  const partnerReceived = useMemo(() => readPartnerAvailability(typeof window === 'undefined' ? '' : window.location.search), []);
  const freeDays = useMemo(() => {
    if (state.validationIssues.length) return [];
    const off = new Set(state.effectiveOffDays);
    const unavailable = new Set(state.solveInput.blackouts);
    return rangeISO(state.rangeStart, state.rangeEnd).filter(date => !unavailable.has(date) && (off.has(date) || !state.workWeek[mondayIndexedDow(date)]));
  }, [state.validationIssues, state.effectiveOffDays, state.solveInput.blackouts, state.rangeStart, state.rangeEnd, state.workWeek]);
  const requestCalendar = { workWeek: state.workWeek, offDays: state.effectiveOffDays, rangeStart: state.rangeStart, rangeEnd: state.rangeEnd };
  const trackBreak = (brk: typeof state.breaks[number]) => {
    if (!state.holidaysReady || state.holidaysDegraded) return;
    const action = ledger.addRequest({ start: brk.start, end: brk.end }, requestCalendar);
    if (action.ok) track('request_tracking_started');
    requestAnimationFrame(() => document.getElementById('requests')?.scrollIntoView?.({ block: 'start' }));
  };
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
    <div className="min-h-screen bg-page">
      <SiteHeader active="pto" />
      {/* Semantic HTML pass (Phase 5): everything above the workspace - headline, pinned
          plans, controls, banners - is genuinely page-header content, not part of <main>.
          Site restructure: the old per-route tagline paragraph is gone - "no page has a
          subtitle under its h1 except the landing page," and this one only ever restated
          what the headline below it already says. */}
      <div>

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

      {/* Primary policy inputs and live plan-shaping controls are distinct reading groups.
          Both sliders stay visible on every viewport, and no Generate step is introduced. */}
      <div className="border-b border-line bg-surface-alt">
        <Container className="px-4 py-5 sm:py-6">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:items-start lg:gap-8">
            <section aria-labelledby="plan-inputs-heading" className="min-w-0">
              <div className="mb-4">
                <h2 id="plan-inputs-heading" className="text-base font-semibold text-ink">Your time off</h2>
                <p className="mt-1 text-sm text-muted">Start with your country, dates and available PTO.</p>
              </div>
              <div className="flex min-w-0 flex-wrap items-start gap-x-4 gap-y-4">
                <PrimaryControls
                  advanced={optionsOpen}
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
              </div>
            </section>
            <section aria-labelledby="plan-shape-heading" className="min-w-0 rounded-xl border border-line bg-surface p-4 sm:p-5">
              <h2 id="plan-shape-heading" className="text-base font-semibold text-ink">Shape your plan</h2>
              <p className="mt-1 text-sm text-muted">Adjust either slider to update your results instantly.</p>
              <div className="mt-4 grid min-w-0 gap-5">
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
              <label className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-sm font-medium text-ink">
                Planning style
                <select aria-label="Planning style" className="min-h-11 min-w-0 rounded-md border border-line-strong bg-surface px-3 text-sm" value={state.planningStyle} onChange={event => state.setPlanningStyle(event.target.value as typeof state.planningStyle)}>
                  <option value="balanced">Balanced</option>
                  <option value="long-breaks">Long breaks</option>
                  <option value="more-breaks">More breaks</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
            </section>
          </div>
        </Container>
      </div>

      <div className="border-b border-slate-200 bg-slate-50">
        <Container className="px-4 py-4">
          <button
            type="button"
            aria-expanded={optionsOpen}
            aria-controls="planning-options"
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
        <div id="planning-options" className="border-b border-slate-200 bg-white">
          <Container className="flex flex-col gap-4 px-4 py-4">
            <SubdivisionSelect
              subdivisions={state.discoveredSubdivisions}
              subdivision={state.subdivision}
              onChangeSubdivision={state.setSubdivision}
            />

            <label className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
              Minimum length of a break
              <select aria-label="Minimum length of a break" value={state.minimumBreakDays} onChange={event => state.setMinimumBreakDays(Number(event.target.value))} className="min-h-11 rounded-md border border-line-strong px-3">
                <option value={0}>No minimum</option>
                {Array.from({ length: 60 }, (_, i) => i + 1).map(days => <option key={days} value={days}>{days} calendar days</option>)}
              </select>
            </label>
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
              onToggleHoliday={state.toggleHoliday}
              onSaveEmployerHolidays={state.saveEmployerHolidays}
              onResetEmployerHolidays={state.resetEmployerHolidays}
              employerCalendarMessage={state.employerCalendarMessage}
            />
          </Container>
        </div>
      )}

      {state.partnerOverlapReceived && (
        <PartnerOverlapBanner overlapDayCount={state.overlapDays.length} onDismiss={state.dismissPartnerOverlapBanner} />
      )}

      {partnerReceived.invalid && <Container className="px-4 py-3"><p role="alert" className="text-sm text-ink">This partner availability link is invalid or too large. Ask for a new link with fewer dates.</p></Container>}
      {partnerReceived.availability && <Container className="px-4 py-3"><p role="status" className="rounded-lg border border-line bg-surface p-3 text-sm text-ink">Someone shared {partnerReceived.availability.days.length} {partnerReceived.availability.status} available dates. Your own PTO budget and calendar apply. <a className="font-medium text-accent-ink underline" href="#partner-planner">See dates you can both take off →</a></p></Container>}
      <ValidationBanner issues={state.validationIssues} />
      {state.solverIssue && (
        <PlanRecoveryNotice
          issue={state.solverIssue}
          hasForcedDays={Object.keys(state.forced).length > 0}
          onClearForcedDays={state.clearForcedDays}
          onReviewSettings={() => setOptionsOpen(true)}
        />
      )}

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
      </div>

      <main>
        <Container className="p-4">
          <SummaryMetrics
            budgetSpent={state.budgetSpent}
            totalDaysOff={state.totalDaysOff}
            breakCountActual={state.breakCountActual}
            scores={state.scores}
          />

          <p className="mt-2 text-sm text-slate-600">{Math.max(0, state.budget - state.budgetSpent)} {state.unlimitedPto ? 'target days unplanned' : 'PTO days remaining'}, including {Math.min(state.budget, state.reserveDays)} reserved. Calendar days off include weekends, observed holidays, and PTO days.</p>
          {state.breaks.length > 0 && <section aria-labelledby="top-opportunities" className="mt-8">
            <h2 id="top-opportunities" className="text-xl font-semibold text-ink">Your top 3 time-off opportunities</h2>
            <p className="mt-1 text-sm text-muted">These breaks belong to one plan and fit together. Public holidays are assumed observed; customize your employer calendar in More options.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {[...state.orderedBreaks].sort((a, b) => b.brk.multiplier - a.brk.multiplier || b.brk.totalDaysOff - a.brk.totalDaysOff || a.index - b.index).slice(0, 3).map(({ brk, index }) => <BreakCard onTrack={state.holidaysReady && !state.holidaysDegraded ? trackBreak : undefined} key={brk.id} brk={brk} index={index} isPtoDay={state.isSuggestedPto} onHover={state.setHoveredBreakId} highlighted={state.hoveredBreakId === brk.id} isMostContested={false} reason={breakReason(brk, state.holidayNameFor)} today={today} noticePeriodDays={state.noticePeriodDays} workWeek={state.workWeek} />)}
            </div>
          </section>}

          {/* Phase 3 step 6: export actions sit directly beneath the metrics now, not below
              the calendar/break list - "free, no sign-up, no email" is as much a part of
              the page's first impression as the metrics it sits next to. */}
          <div className={`${SECTION_GAP} border-t border-slate-200 pt-4`}>
            {!state.validationIssues.length && !state.solverIssue ? <ExportBar
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
            /> : <p role="status" className="text-sm text-muted">Check your planning inputs before exporting.</p>}
          </div>

          {!state.validationIssues.length && !state.solverIssue && state.holidaysReady && !state.holidaysDegraded && <div className="mt-4">
            <PortraitShare breaks={state.breaks} rangeStart={state.rangeStart} rangeEnd={state.rangeEnd} holidayAssumption={state.employerCalendar.custom.length ? 'company' : state.employerCalendar.excluded.length ? 'customized' : 'public'} remainingBalance={state.unlimitedPto ? undefined : Math.max(0, state.budget - state.budgetSpent)} holidayNamesOf={brk => [...new Set(state.holidayEntries.filter(holiday => holiday.checked && holiday.date >= brk.start && holiday.date <= brk.end).map(holiday => holiday.source === 'custom' ? 'Company holiday' : holiday.name))]} />
          </div>}
          <div id="partner-planner" className="mt-5 scroll-mt-24">
            {state.holidaysReady && !state.holidaysDegraded && !state.validationIssues.length ? <PartnerPlanner breaks={state.breaks} freeDays={freeDays} input={state.solveInput} minimumBreakLength={state.minimumBreakDays} /> : <p role="status" className="text-sm text-muted">Partner planning will be available after your calendar loads with valid dates and holiday data.</p>}
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
          <h2 className="mt-8 text-xl font-semibold text-ink">Your complete plan</h2>
          <div className={`${SECTION_GAP} lg:grid lg:grid-cols-5 lg:gap-6 lg:items-start`}>
            <div className="flex flex-col gap-4 lg:col-span-3">
              {!state.validationIssues.length ? <CalendarErrorBoundary>
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
              </CalendarErrorBoundary> : <p role="status" className="text-sm text-muted">Choose valid dates and a PTO balance to display the calendar.</p>}

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
                  {state.solverIssue
                    ? 'Your current constraints prevent a valid plan. Adjust your selected dates or review the settings above.'
                    : 'No PTO-worthy breaks fit this range and budget yet — try widening the date range or increasing PTO days.'}
                </p>
              )}
              {state.breaks.length > 1 && mostContestedIndex !== undefined && (
                <p className="text-sm text-slate-600">
                  Break {mostContestedIndex} falls in an estimated popular vacation period. This reflects public demand, not coworkers&apos; plans.
                </p>
              )}
              {/* Semantic HTML pass (Phase 5): recommendations are a real list, not div soup -
                  list-none/p-0/m-0 keep it visually identical to the plain flex column it
                  replaces. */}
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {state.orderedBreaks.map(({ index, brk }) => (
                  <li key={brk.id}>
                    <BreakCard
                      onTrack={state.holidaysReady && !state.holidaysDegraded ? trackBreak : undefined}
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

          <div id="requests" className={`${SECTION_GAP} scroll-mt-24 space-y-3`}>
            <PtoTracker today={today} ledger={ledger} calendar={requestCalendar} calendarReady={state.holidaysReady && !state.holidaysDegraded} calendarNotice={!state.holidaysReady ? 'Loading your employer calendar…' : state.holidaysDegraded ? 'Holiday data is incomplete. Check your employer calendar before adding or changing request dates.' : undefined} onTrackingStarted={() => track('request_tracking_started')} onStatusChanged={() => track('request_status_updated')} />
            <p className="text-sm text-muted"><a href="/policy#balance" className="font-medium text-accent-ink underline">Forecast my balance and check expiration</a></p>
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
