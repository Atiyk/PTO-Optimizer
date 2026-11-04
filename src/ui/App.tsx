import { PortraitShare } from './PortraitShare';
import { rangeISO, mondayIndexedDow } from '@daysoff/engine/solver/dateUtils';
import { PartnerPlanner } from './PartnerPlanner';
import { readPartnerAvailability } from '../planning/partner';
import { PtoTracker } from './PtoTracker';
import { useRequestLedger } from './useRequestLedger';
import { track } from './analytics';
import { useMemo, useRef, useState } from 'react';
import { SiteHeader } from './SiteHeader';
import { CompactResultBar, Headline } from './Headline';
import { buttonClasses } from './Button';
import { SummaryMetrics } from './SummaryMetrics';
import { PlanExplanation } from './PlanExplanation';
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
import { Container } from './Container';
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
  const resultRef = useRef<HTMLElement>(null);
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

  const plannable = !state.validationIssues.length && !state.solverIssue;
  const fieldLabel = 'text-sm font-semibold text-ink';
  const selectClass = 'h-11 w-full min-w-0 rounded-[3px] border border-line-strong bg-surface px-3 text-[15px] font-normal text-ink';

  return (
    <div className="min-h-screen bg-page">
      <SiteHeader active="pto" />
      <CompactResultBar watch={resultRef} totalDaysOff={state.totalDaysOff} budgetSpent={state.budgetSpent} breakCountActual={state.breakCountActual} />

      {/* Operate layout. Desktop (lg+): a sticky control rail on the left (inputs, the two
          always-visible sliders, planning style, More options) and a results column that
          leads with the result line, then the calendar, the breaks, the actions, the
          tracker and the questions. Phones: one column - result, controls (inputs and both
          sliders), the compact break list, the calendar, actions, then the rest. Results
          update live; there is no submit step anywhere. */}
      <main id="main-content" tabIndex={-1} className="focus:outline-none">
        <Container className="px-4 pb-16 pt-6 sm:px-6 lg:pb-24 lg:pt-10">
          <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)] xl:gap-x-14">

            <section ref={resultRef} aria-label="Your plan" className="flex min-w-0 flex-col gap-5 lg:col-start-2 lg:row-start-1">
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
                unlimitedPto={state.unlimitedPto}
              />
              <PinnedPlansStrip
                summaries={state.pinnedPlans.map((p) => p.summary)}
                onRestore={state.restorePlan}
                onRemove={state.removePinnedPlan}
              />
              <SummaryMetrics
                budgetSpent={state.budgetSpent}
                totalDaysOff={state.totalDaysOff}
                breakCountActual={state.breakCountActual}
                scores={state.scores}
              />
              {plannable && (
                <PlanExplanation
                  breaks={state.breaks}
                  workWeek={state.workWeek}
                  offDays={new Set(state.effectiveOffDays)}
                  budgetSpent={state.budgetSpent}
                  totalDaysOff={state.totalDaysOff}
                />
              )}
            </section>

            <aside id="plan-controls" aria-label="Plan settings" className="min-w-0 scroll-mt-16 lg:sticky lg:top-4 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto lg:overscroll-auto">
              <div className="rounded-[4px] border border-line bg-surface p-4 sm:p-5 md:grid md:grid-cols-2 md:gap-x-10 lg:block">
                <section aria-labelledby="plan-inputs-heading" className="flex min-w-0 flex-col gap-3.5">
                  <h2 id="plan-inputs-heading" className="text-xl font-bold leading-6 text-ink type-condensed">Your time off</h2>
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
                </section>

                {/* Both sliders stay on screen at every width; never behind a disclosure. */}
                <section aria-labelledby="plan-shape-heading" className="mt-5 flex min-w-0 flex-col gap-3 border-t border-line pt-4 md:mt-0 md:border-t-0 md:pt-0 lg:mt-5 lg:border-t lg:pt-4">
                  <div>
                    <h2 id="plan-shape-heading" className="text-xl font-bold leading-6 text-ink type-condensed">Shape your plan</h2>
                    <p className="mt-1 text-sm text-muted">Move either slider; the plan updates as you go.</p>
                  </div>
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
                  <label className="flex flex-col gap-1.5">
                    <span className={fieldLabel}>Planning style</span>
                    <select aria-label="Planning style" className={selectClass} value={state.planningStyle} onChange={event => state.setPlanningStyle(event.target.value as typeof state.planningStyle)}>
                      <option value="balanced">Balanced</option>
                      <option value="long-breaks">Long breaks</option>
                      <option value="more-breaks">More breaks</option>
                      <option value="custom">Custom</option>
                    </select>
                  </label>
                </section>

                {/* One clearly named disclosure for the advanced policy settings. */}
                <div className="mt-5 border-t border-line pt-4 md:col-span-2">
                  <button
                    type="button"
                    aria-expanded={optionsOpen}
                    aria-controls="planning-options"
                    onClick={() => setOptionsOpen((v) => !v)}
                    className={buttonClasses('secondary', 'md', 'w-full justify-between!')}
                  >
                    <span>{optionsOpen ? 'Hide options' : 'More options'}</span>
                    <span aria-hidden="true" className="text-lg leading-none">{optionsOpen ? '−' : '+'}</span>
                  </button>
                  {!optionsOpen && (
                    <p className="mt-2 text-sm text-muted">
                      Reserve days, employer holidays, work week, notice period, days you can&apos;t take off.
                    </p>
                  )}
                  {optionsOpen && (
                    <div id="planning-options" className="mt-5 flex scroll-mt-16 flex-col gap-5">
                      <SubdivisionSelect
                        subdivisions={state.discoveredSubdivisions}
                        subdivision={state.subdivision}
                        onChangeSubdivision={state.setSubdivision}
                      />
                      <label className="flex flex-col gap-1.5">
                        <span className={fieldLabel}>Minimum length of a break</span>
                        <select aria-label="Minimum length of a break" value={state.minimumBreakDays} onChange={event => state.setMinimumBreakDays(Number(event.target.value))} className={selectClass}>
                          <option value={0}>No minimum</option>
                          {Array.from({ length: 60 }, (_, i) => i + 1).map(days => <option key={days} value={days}>{days} calendar days</option>)}
                        </select>
                      </label>
                      <label className="-my-1 flex min-h-11 w-fit cursor-pointer items-center gap-2 text-sm text-ink">
                        <input
                          type="checkbox"
                          checked={state.showAlternatives}
                          onChange={(e) => state.setShowAlternatives(e.target.checked)}
                        />
                        Show alternatives on the calendar
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
                    </div>
                  )}
                </div>
              </div>
            </aside>

            {/* The results body. DOM order follows the phone reading order (breaks before the
                calendar, so a screen reader hears the three breaks before ~60 day cells); on
                desktop the calendar is lifted above the breaks with `order` as the dominant
                visual. The two are independent regions, so focus order stays meaningful. */}
            <div className="flex min-w-0 flex-col gap-12 lg:col-start-2 lg:row-start-2 lg:gap-16">
              {(state.partnerOverlapReceived || partnerReceived.invalid || partnerReceived.availability || state.validationIssues.length > 0 || state.solverIssue || state.peakCapApplied || state.holidaysDegraded) && (
                <div className="flex flex-col gap-3">
                  {state.partnerOverlapReceived && (
                    <PartnerOverlapBanner overlapDayCount={state.overlapDays.length} onDismiss={state.dismissPartnerOverlapBanner} />
                  )}
                  {partnerReceived.invalid && <p role="alert" className="rounded-[4px] border border-ink bg-surface p-4 text-sm text-ink">This partner availability link is invalid or too large. Ask for a new link with fewer dates.</p>}
                  {partnerReceived.availability && <p role="status" className="rounded-[4px] bg-accent-soft p-4 text-sm text-ink">Someone shared {partnerReceived.availability.days.length} {partnerReceived.availability.status} available dates. Your own PTO budget and calendar apply. <a className="link-mark font-semibold" href="#partner-planner">See dates you can both take off</a></p>}
                  <ValidationBanner issues={state.validationIssues} />
                  {state.solverIssue && (
                    <PlanRecoveryNotice
                      issue={state.solverIssue}
                      hasForcedDays={Object.keys(state.forced).length > 0}
                      onClearForcedDays={() => {
                        state.clearForcedDays();
                        requestAnimationFrame(() => document.getElementById('complete-plan-heading')?.focus());
                      }}
                      onReviewSettings={() => {
                        setOptionsOpen(true);
                        requestAnimationFrame(() => document.getElementById('planning-options')?.scrollIntoView({ block: 'start' }));
                      }}
                    />
                  )}
                  <PeakCapBanner
                    applied={state.peakCapApplied}
                    maxDays={state.peakCapMaxDays}
                    startDate={state.peakCapStart}
                    endDate={state.peakCapEnd}
                  />
                  {state.holidaysDegraded && (
                    <p role="status" className="rounded-[4px] bg-surface-alt p-4 text-sm text-ink">
                      Couldn&apos;t reach public holiday data for this country &mdash; showing weekends and any holidays
                      already cached. You can add known holidays manually in More options, or try again later.
                    </p>
                  )}
                </div>
              )}

              <section aria-labelledby="breaks-heading" className="order-1 min-w-0 lg:order-2">
                <h2 id="breaks-heading" className="text-h2 font-bold text-ink type-condensed">
                  {state.breaks.length === 1 ? 'Your break' : 'Your breaks'}
                </h2>
                <p className="mt-1 max-w-prose text-sm text-muted">
                  {state.breaks.length > 0
                    ? 'In date order, numbered as on the calendar. They belong to one plan and fit together. Public holidays are assumed observed; customize your employer calendar in More options.'
                    : state.solverIssue
                      ? 'Your current constraints prevent a valid plan. Adjust your selected dates or review the settings.'
                      : 'No PTO-worthy breaks fit this range and budget yet — try widening the date range or increasing PTO days.'}
                </p>
                {state.breaks.length > 1 && mostContestedIndex !== undefined && (
                  <p className="mt-2 max-w-prose text-sm text-muted">
                    Break {mostContestedIndex} falls in an estimated popular vacation period. This reflects public demand, not coworkers&apos; plans.
                  </p>
                )}
                {state.breaks.length > 0 && (
                  <ul className="m-0 mt-4 flex list-none flex-col divide-y divide-line border-y border-line p-0">
                    {state.orderedBreaks.map(({ index, brk }) => (
                      <li key={brk.id} className="py-1">
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
                )}
              </section>

              <section aria-labelledby="complete-plan-heading" className="order-2 min-w-0 lg:order-1">
                <h2 id="complete-plan-heading" tabIndex={-1} className="text-h2 font-bold text-ink type-condensed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">Your complete plan</h2>
                <p className="mt-1 max-w-prose text-sm text-muted">
                  Click any day to pin it in or rule it out. Hover or focus a day to see what it would gain.
                </p>
                <div className="mt-4 rounded-[4px] border border-line bg-surface p-3 sm:p-5">
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
                  <div className="mt-5 border-t border-line pt-4">
                    <Legend />
                  </div>
                </div>
              </section>

              <section aria-labelledby="take-it-heading" className="order-3 flex min-w-0 flex-col gap-5">
                <div>
                  <h2 id="take-it-heading" className="text-h2 font-bold text-ink type-condensed">Take it with you</h2>
                  <p className="mt-1 text-sm text-muted">Free, no sign-up, no email. Everything stays in this browser until you share it.</p>
                </div>
                {plannable ? <ExportBar
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

                {plannable && state.holidaysReady && !state.holidaysDegraded && (
                  <PortraitShare breaks={state.breaks} rangeStart={state.rangeStart} rangeEnd={state.rangeEnd} holidayAssumption={state.employerCalendar.custom.length ? 'company' : state.employerCalendar.excluded.length ? 'customized' : 'public'} remainingBalance={state.unlimitedPto ? undefined : Math.max(0, state.budget - state.budgetSpent)} holidayNamesOf={brk => [...new Set(state.holidayEntries.filter(holiday => holiday.checked && holiday.date >= brk.start && holiday.date <= brk.end).map(holiday => holiday.source === 'custom' ? 'Company holiday' : holiday.name))]} />
                )}
                <div id="partner-planner" className="scroll-mt-16">
                  {state.holidaysReady && !state.holidaysDegraded && !state.validationIssues.length ? <PartnerPlanner breaks={state.breaks} freeDays={freeDays} input={state.solveInput} minimumBreakLength={state.minimumBreakDays} /> : <p role="status" className="text-sm text-muted">Partner planning will be available after your calendar loads with valid dates and holiday data.</p>}
                </div>
              </section>

              <div id="requests" className="order-4 flex min-w-0 scroll-mt-16 flex-col gap-3">
                <PtoTracker today={today} ledger={ledger} calendar={requestCalendar} calendarReady={state.holidaysReady && !state.holidaysDegraded} calendarNotice={!state.holidaysReady ? 'Loading your employer calendar…' : state.holidaysDegraded ? 'Holiday data is incomplete. Check your employer calendar before adding or changing request dates.' : undefined} onTrackingStarted={() => track('request_tracking_started')} onStatusChanged={() => track('request_status_updated')} />
                <p className="text-sm text-muted"><a href="/policy#balance" className="link-mark font-semibold">Forecast my balance and check expiration</a></p>
              </div>

              <div className="order-5 min-w-0">
                <FAQ />
              </div>
            </div>
          </div>
        </Container>
      </main>

      <Footer onShowShortcuts={() => setShowHelp(true)} />
      <KeyboardShortcutsHelp open={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
}
