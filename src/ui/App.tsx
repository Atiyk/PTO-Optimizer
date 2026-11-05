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
import { PrimaryControls, ReserveControls } from './PrimaryControls';
import { Chevron, PlusMinus } from './Chevron';
import { pinPreviewText } from './pinPreview';
import { planningStyleSettings } from '../planning/optimizer';
import { formatCardDateRange } from '@daysoff/engine/calendar/dateFormat';
import { RelaxedMinimumNotice } from './PlanRecoveryNotice';
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
import { isContested, mostContestedBreakId } from '@daysoff/engine/calendar/requestDeadline';
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
  // Tracking confirms on the break itself ("Tracked"), without jumping down the page.
  const trackBreak = (brk: typeof state.breaks[number]) => {
    if (!state.holidaysReady || state.holidaysDegraded) return false;
    const action = ledger.addRequest({ start: brk.start, end: brk.end }, requestCalendar);
    if (action.ok) track('request_tracking_started');
    return action.ok;
  };
  // The touch day sheet sets a day's state directly (take / never / let the planner
  // decide); the planner stores it as the same three-step pin cycle a click walks through.
  const setDayState = (date: string, target: 'include' | 'exclude' | null) => {
    const cycle: (string | undefined)[] = [undefined, 'include', 'exclude'];
    let steps = (cycle.indexOf(target ?? undefined) - cycle.indexOf(state.forced[date]) + 3) % 3;
    while (steps-- > 0) state.toggleDay(date);
  };
  const pinPreview = (date: string) => {
    const preview = state.previewPin(date);
    return preview ? pinPreviewText(preview, { totalDaysOff: state.totalDaysOff, budgetSpent: state.budgetSpent }) : null;
  };
  // Opening More options from the rail scrolls the panel into view (it can open below the
  // fold inside the sticky rail).
  const optionsRef = useRef<HTMLDivElement>(null);
  const toggleOptions = () => {
    const next = !optionsOpen;
    setOptionsOpen(next);
    if (next) requestAnimationFrame(() => optionsRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }));
  };
  const [partnerOpenKey, setPartnerOpenKey] = useState(0);
  const openPartnerPlanner = () => {
    setPartnerOpenKey((k) => k + 1);
    requestAnimationFrame(() => document.getElementById('partner-planner')?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }));
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
  const mostContested = state.orderedBreaks.find(({ brk }) => brk.id === mostContestedId);
  // Only say a break is in a busy period when it actually passes the busy-dates threshold;
  // "the busiest of three quiet breaks" is not a busy period.
  const mostContestedIndex = mostContested && isContested(mostContested.brk) ? mostContested.index : undefined;

  const { showHelp, setShowHelp } = useKeyboardShortcuts({
    onCopyLink: () => document.getElementById('shortcut-copy-link')?.click(),
    onDownloadIcs: () => document.getElementById('shortcut-download-ics')?.click(),
  });

  const plannable = !state.validationIssues.length && !state.solverIssue;
  const fieldLabel = 'text-sm font-semibold text-ink';
  const selectClass = 'select-ink w-full min-w-0 text-[15px] font-normal';
  const stylePreset = planningStyleSettings(state.planningStyle);
  const sliderLabel = (count: number) => count >= 7 ? 'as many breaks as possible' : count === 1 ? '1 break (all in one)' : `${count} breaks`;

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

            <section ref={resultRef} aria-label="Your plan" className="flex min-w-0 flex-col gap-5 lg:col-span-2 lg:col-start-1 lg:row-start-1">
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
                travelBasis={state.country === 'US' ? 'us' : 'estimate'}
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
              {/* Phones: the calendar sits two screens down, below the settings, so the result
                  carries direct links to each part of the page. */}
              <nav aria-label="On this page" className="-mt-1 flex gap-2 overflow-x-auto md:hidden">
                {[['#complete-plan-heading', 'Calendar'], ['#breaks-heading', 'Request each break'], ['#take-it-heading', 'Export and share']].map(([href, label]) => (
                  <a key={href} href={href} className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-line bg-surface px-4 text-sm font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]">{label}</a>
                ))}
              </nav>
            </section>

            <aside id="plan-controls" aria-label="Plan settings" className="min-w-0 scroll-mt-16 lg:sticky lg:top-4 lg:col-start-1 lg:row-start-2 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto lg:overscroll-auto">
              <div className="rounded-[10px] border border-line bg-surface p-4 sm:p-5 md:grid md:grid-cols-2 md:gap-x-10 lg:block">
                <section aria-labelledby="plan-inputs-heading" className="flex min-w-0 flex-col gap-3.5">
                  <h2 id="plan-inputs-heading" className="text-xl font-bold leading-6 text-ink type-condensed">Your time off</h2>
                  <PrimaryControls
                    advanced={false}
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
                    <select aria-label="Planning style" aria-describedby="planning-style-note" className={selectClass} value={state.planningStyle} onChange={event => state.setPlanningStyle(event.target.value as typeof state.planningStyle)}>
                      <option value="balanced">Balanced</option>
                      <option value="long-breaks">Long breaks</option>
                      <option value="more-breaks">More breaks</option>
                      <option value="custom">Custom</option>
                    </select>
                    {/* A style is a preset for the two sliders above; say what it sets, so a
                        change never moves the sliders without explanation. */}
                    <span id="planning-style-note" className="text-sm font-normal text-muted">
                      {stylePreset
                        ? `Sets What matters more to ${stylePreset.w} and How many breaks to ${sliderLabel(stylePreset.breakCount)}. Moving a slider switches to Custom.`
                        : 'Custom: the sliders keep your own settings.'}
                    </span>
                  </label>
                </section>

                {/* One clearly named disclosure for the advanced policy settings. */}
                <div className="mt-5 border-t border-line pt-4 md:col-span-2">
                  <button
                    type="button"
                    aria-expanded={optionsOpen}
                    aria-controls="planning-options"
                    onClick={toggleOptions}
                    className={buttonClasses('secondary', 'md', 'w-full justify-between!')}
                  >
                    <span>{optionsOpen ? 'Hide options' : 'More options'}</span>
                    <PlusMinus open={optionsOpen} />
                  </button>
                  {!optionsOpen && (
                    <p className="mt-2 text-sm text-muted">
                      Reserve days, employer holidays, work week, notice period, days you can&apos;t take off.
                    </p>
                  )}
                  {optionsOpen && (
                    <div id="planning-options" ref={optionsRef} className="mt-5 flex scroll-mt-16 flex-col gap-5">
                      <ReserveControls
                        budget={state.budget}
                        reserveDays={state.reserveDays}
                        onChangeReserveDays={state.setReserveDays}
                        unlimitedPto={state.unlimitedPto}
                        onToggleUnlimitedPto={state.setUnlimitedPto}
                      />
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
              {(state.partnerOverlapReceived || partnerReceived.invalid || partnerReceived.availability || state.validationIssues.length > 0 || state.solverIssue || state.relaxedMinimum !== undefined || state.peakCapApplied || state.holidaysDegraded) && (
                <div className="flex flex-col gap-3">
                  {state.partnerOverlapReceived && (
                    <PartnerOverlapBanner overlapDayCount={state.overlapDays.length} onDismiss={state.dismissPartnerOverlapBanner} />
                  )}
                  {partnerReceived.invalid && <p role="alert" className="rounded-[10px] border border-error bg-error-soft p-4 text-sm text-ink">This partner availability link is invalid or too large. Ask for a new link with fewer dates.</p>}
                  {partnerReceived.availability && <p role="status" className="rounded-[10px] bg-surface-alt p-4 text-sm text-ink">Someone shared {partnerReceived.availability.days.length} {partnerReceived.availability.status} available dates. Your own PTO budget and calendar apply. <a className="link-mark font-semibold" href="#partner-planner">See dates you can both take off</a></p>}
                  <ValidationBanner issues={state.validationIssues} />
                  {state.relaxedMinimum !== undefined && (
                    <RelaxedMinimumNotice
                      minimum={state.relaxedMinimum}
                      onClearPins={() => {
                        state.clearForcedDays();
                        requestAnimationFrame(() => document.getElementById('complete-plan-heading')?.focus());
                      }}
                      onNoMinimum={() => {
                        state.setMinimumBreakDays(0);
                        requestAnimationFrame(() => document.getElementById('complete-plan-heading')?.focus());
                      }}
                    />
                  )}
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
                    <p role="status" className="rounded-[10px] bg-surface-alt p-4 text-sm text-ink">
                      Couldn&apos;t reach public holiday data for this country &mdash; showing weekends and any holidays
                      already cached. You can add known holidays manually in More options, or try again later.
                    </p>
                  )}
                </div>
              )}

              {/* The plan at a glance, above the calendar at every width: one line per break,
                  each linked to its full card below. DOM order is the visual order. */}
              <section aria-labelledby="summary-heading" className="min-w-0">
                <h2 id="summary-heading" className="text-h2 font-bold text-ink type-condensed">
                  {state.breaks.length === 1 ? 'Your break' : 'Your breaks'}
                </h2>
                {state.breaks.length === 0 ? (
                  <p className="mt-1 max-w-prose text-sm text-muted">
                    {state.solverIssue
                      ? 'Your current constraints prevent a valid plan. Adjust your selected dates or review the settings.'
                      : 'No PTO-worthy breaks fit this range and budget yet — try widening the date range or increasing PTO days.'}
                  </p>
                ) : (
                  <>
                    <ol className="m-0 mt-3 list-none divide-y divide-line border-y border-line p-0">
                      {state.orderedBreaks.map(({ index, brk }) => (
                        <li key={brk.id}>
                          <a
                            href={`#break-${index}`}
                            onMouseEnter={() => state.setHoveredBreakId(brk.id)}
                            onMouseLeave={() => state.setHoveredBreakId(null)}
                            onFocus={() => state.setHoveredBreakId(brk.id)}
                            onBlur={() => state.setHoveredBreakId(null)}
                            className="group grid min-h-11 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 py-2 text-ink hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                          >
                            <span aria-hidden="true" className="flex h-6 min-w-6 items-center justify-center rounded-[6px] bg-accent px-1 text-xs font-bold tabular-nums text-white">{index}</span>
                            <span className="min-w-0 tabular-nums">
                              <span className="sr-only">Break {index}: </span>
                              <span className="font-bold type-condensed text-lg leading-6">{formatCardDateRange(brk.start, brk.end)}</span>
                              <span className="ml-3 text-sm"><span className="mark font-semibold">{brk.totalDaysOff} {brk.totalDaysOff === 1 ? 'day' : 'days'} off</span> for {brk.ptoCost} PTO {brk.ptoCost === 1 ? 'day' : 'days'}</span>
                            </span>
                            <span className="flex items-center gap-1 text-sm text-muted group-hover:text-ink">
                              <span className="hidden sm:inline">Details</span>
                              <Chevron direction="right" />
                            </span>
                          </a>
                        </li>
                      ))}
                    </ol>
                    {state.breaks.length > 1 && mostContestedIndex !== undefined && (
                      <p className="mt-2 max-w-prose text-sm text-muted">
                        Break {mostContestedIndex} has the highest travel demand in this plan ({state.country === 'US' ? 'based on 2025 US airport checkpoint counts' : 'a seasonal estimate'}). It reflects public travel, not your coworkers&apos; plans.
                      </p>
                    )}
                  </>
                )}
              </section>

              <section aria-labelledby="complete-plan-heading" className="min-w-0">
                <h2 id="complete-plan-heading" tabIndex={-1} className="text-h2 font-bold text-ink type-condensed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">Your complete plan</h2>
                <p className="mt-1 max-w-prose text-sm text-muted">
                  {/* Chosen by CSS, not JS, so the prerendered page is right on touch from the first paint. */}
                  <span className="hidden [@media(hover:hover)]:inline">Click a day to take it, click again to rule it out, a third time to let the planner decide. Hover or focus a day to see what pinning it would do. Arrow keys move between days.</span>
                  <span className="[@media(hover:hover)]:hidden">Tap a day to take it, rule it out, or let the planner decide.</span>
                </p>
                <div className="mt-4 rounded-[10px] border border-line bg-surface p-3 sm:p-5">
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
                      holidayKindFor={state.holidayKindFor}
                      hasHover={hasHover}
                      onDayClick={state.toggleDay}
                      alternativeForDate={state.alternativeForDate}
                      onSwapAlternative={state.swapAlternative}
                      onHoverAlternative={state.setHoveredAlternativeId}
                      forcedStateOf={(iso) => state.forced[iso]}
                      onSetDayState={setDayState}
                      pinPreview={pinPreview}
                    />
                  </CalendarErrorBoundary> : <p role="status" className="text-sm text-muted">Choose valid dates and a PTO balance to display the calendar.</p>}
                  <div className="mt-5 border-t border-line pt-4">
                    <Legend showCompany={state.holidayEntries.some((h) => h.checked && h.source === 'custom')} showBlackout={state.hasBlackouts} />
                  </div>
                </div>
              </section>

              <section aria-labelledby="breaks-heading" className="min-w-0">
                <h2 id="breaks-heading" className="text-h2 font-bold text-ink type-condensed">Requesting each break</h2>
                <p className="mt-1 max-w-prose text-sm text-muted">
                  Why each break was chosen, when to ask for it, and a ready-made request. Public holidays are assumed observed; customize your employer calendar in More options.
                </p>
                {state.breaks.length > 0 ? (
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
                          anchorId={`break-${index}`}
                        />
                      </li>
                    ))}
                  </ul>
                ) : <p className="mt-4 text-sm text-muted">Breaks appear here once the plan has some.</p>}
              </section>

              <section aria-labelledby="take-it-heading" className="flex min-w-0 flex-col gap-5">
                <div>
                  <h2 id="take-it-heading" className="text-h2 font-bold text-ink type-condensed">Take it with you</h2>
                  <p className="mt-1 text-sm text-muted">Free, and no account needed. Your plan stays in this browser unless you share its link, subscribe to its calendar feed, or turn on email reminders.</p>
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
                  onPlanWithPartner={openPartnerPlanner}
                  planSearch={state.planSearch}
                /> : <p role="status" className="text-sm text-muted">Check your planning inputs before exporting.</p>}

                {plannable && state.holidaysReady && !state.holidaysDegraded && (
                  <PortraitShare breaks={state.breaks} rangeStart={state.rangeStart} rangeEnd={state.rangeEnd} holidayAssumption={state.employerCalendar.custom.length ? 'company' : state.employerCalendar.excluded.length ? 'customized' : 'public'} remainingBalance={state.unlimitedPto ? undefined : Math.max(0, state.budget - state.budgetSpent)} holidayNamesOf={brk => [...new Set(state.holidayEntries.filter(holiday => holiday.checked && holiday.date >= brk.start && holiday.date <= brk.end).map(holiday => holiday.source === 'custom' ? 'Company holiday' : holiday.name))]} />
                )}
                <div id="partner-planner" className="scroll-mt-16">
                  {state.holidaysReady && !state.holidaysDegraded && !state.validationIssues.length ? <PartnerPlanner openKey={partnerOpenKey} breaks={state.breaks} freeDays={freeDays} input={state.solveInput} minimumBreakLength={state.minimumBreakDays} /> : <p role="status" className="text-sm text-muted">Partner planning will be available after your calendar loads with valid dates and holiday data.</p>}
                </div>
              </section>

              <div id="requests" className="flex min-w-0 scroll-mt-16 flex-col gap-3">
                <PtoTracker today={today} ledger={ledger} calendar={requestCalendar} noticePeriodDays={state.noticePeriodDays} calendarReady={state.holidaysReady && !state.holidaysDegraded} calendarNotice={!state.holidaysReady ? 'Loading your employer calendar…' : state.holidaysDegraded ? 'Holiday data is incomplete. Check your employer calendar before adding or changing request dates.' : undefined} onTrackingStarted={() => track('request_tracking_started')} onStatusChanged={() => track('request_status_updated')} />
                <p className="text-sm text-muted"><a href="/policy#balance" className="link-mark font-semibold">Forecast my balance and check expiration</a></p>
              </div>

              <div className="min-w-0">
                <FAQ />
              </div>
            </div>
          </div>
        </Container>
      </main>

      {/* Keyboard shortcuts are offered only where a keyboard is likely (a hover pointer). */}
      <Footer onShowShortcuts={hasHover ? () => setShowHelp(true) : undefined} />
      <KeyboardShortcutsHelp open={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
}
