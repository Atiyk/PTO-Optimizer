import { HolidayCoverageNotice } from './HolidayCoverageNotice';
import { useUncoveredHolidayYears } from './holidayCoverage';
import { PortraitShare } from './PortraitShare';
import { addDays, rangeISO, mondayIndexedDow } from '@daysoff/engine/solver/dateUtils';
import { PartnerPlanner } from './PartnerPlanner';
import { readPartnerAvailability } from '../planning/partner';
import { usePersonalWorkspace } from './usePersonalWorkspace';
import { settleLedgerAction } from '../integration/browserWalletStore';
import { track, trackBreakAction } from './analytics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SiteHeader } from './SiteHeader';
import { CompactResultBar, Headline } from './Headline';
import { buttonClasses } from './Button';
import { SummaryMetrics } from './SummaryMetrics';
import { PlanExplanation } from './PlanExplanation';
import { PrimaryControls, ReserveControls } from './PrimaryControls';
import { PlusMinus } from './Chevron';
import { pinPreviewText } from './pinPreview';
import { planningStyleSettings } from '../planning/optimizer';
import { formatCardDateRange, formatLong } from '@daysoff/engine/calendar/dateFormat';
import { holidayLongWeekends, remainingHolidays } from './landingData';
import { weightingShort } from './weightingCaptions';
import { RelaxedMinimumNotice } from './PlanRecoveryNotice';
import { PlanSliders } from './PlanSliders';
import { SubdivisionSelect } from './CountrySelect';
import { MoreOptions } from './MoreOptions';
import { Calendar } from './Calendar';
import { Legend } from './Legend';
import { BreakCard } from './BreakCard';
import { CommittedBreakCard } from './CommittedBreakCard';
import { PinnedPlansStrip } from './PinnedPlansStrip';
import { SharedPlanNotice } from './SharedPlanNotice';
import { ExportBar } from './ExportBar';
import { PartnerOverlapBanner } from './PartnerOverlapBanner';
import { FAQ } from './FAQ';
import { Footer } from './Footer';
import { CalendarErrorBoundary } from './CalendarErrorBoundary';
import { ValidationBanner } from './ValidationBanner';
import { workWeekLinkIssue } from './validation';
import { PlanRecoveryNotice } from './PlanRecoveryNotice';
import { PeakCapBanner } from './PeakCapBanner';
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { Container } from './Container';
import { mostContestedBreakId } from '@daysoff/engine/calendar/requestDeadline';
import { breakReason } from './breakReason';
import { useAppState } from './useAppState';
import { useTodayISO } from './useTodayISO';
import { readBrowserPlanSearch } from './urlState';
import { PortfolioComparison } from '../planning/PortfolioComparison';
import { useHasHover } from './useHasHover';
import { useMinWidth } from './useMinWidth';
import { noBreaksMessage } from './noBreaksMessage';

const dayNumber = new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format;
/** Day-equivalents keep a singular unit up to one: "0.5 day", "1 day", "1.5 days". */
const dayWord = (days: number) => days > 0 && days <= 1 ? 'day' : 'days';
const dayAmount = (days: number) => `${dayNumber(days)} ${dayWord(days)}`;

export function App() {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [allMonthsShown, setAllMonthsShown] = useState(false);
  const resultRef = useRef<HTMLElement>(null);
  const workspace = usePersonalWorkspace();
  const ledger = workspace.ledger;
  const today = useTodayISO();
  const state = useAppState(workspace.requests, today, { includesApprovedLeave: workspace.includesApprovedLeave, schedule: workspace.schedule });
  const plannable = !state.validationIssues.length && !state.solverIssue && !state.planningPending;
  // F05: a real 0-day balance has nothing to place. Say so, and give the free long weekends
  // public holidays already make - the landing page's own helper and wording, so the same
  // dates and country give the same count on both pages. Never invents leave.
  const zeroBudget = plannable && !state.unlimitedPto && state.budget === 0;
  const noPtoMessage = useMemo(() => {
    if (!zeroBudget) return undefined;
    const holidays = state.holidayEntries
      .filter((entry) => entry.checked)
      .map((entry) => ({ date: entry.date, nominalDate: entry.date, name: entry.name, countryCode: state.country, counties: null }));
    const periodStart = state.rangeStart > today ? addDays(state.rangeStart, -1) : today;
    const weekends = holidayLongWeekends(remainingHolidays(periodStart, state.rangeEnd, holidays, state.workWeek));
    if (weekends.length === 0) return 'Public holidays don’t make any long weekends in these dates.';
    const [next] = weekends;
    return `Public holidays alone give you ${weekends.length} long ${weekends.length === 1 ? 'weekend' : 'weekends'} in these dates. The next is ${datedRange(next.run.start, next.run.end)}, for ${next.holiday.name}.`;
  }, [zeroBudget, state.holidayEntries, state.country, state.rangeStart, state.rangeEnd, state.workWeek, today]);
  // F06: while the PTO field is blank the last number stays in effect; label the plan.
  const [budgetBlank, setBudgetBlank] = useState(false);
  // N1: on phones the break cards start below the first screen, so name the longest one
  // right under the result and jump to its card.
  const longest = useMemo(() => {
    if (!plannable || zeroBudget) return undefined;
    return state.orderedBreaks.slice().sort((a, b) => b.brk.totalDaysOff - a.brk.totalDaysOff || b.brk.multiplier - a.brk.multiplier || a.brk.start.localeCompare(b.brk.start))[0];
  }, [plannable, zeroBudget, state.orderedBreaks]);
  // Issue 8/17: plan years without holiday data are limited source data for the comparison.
  const uncoveredHolidayYears = useUncoveredHolidayYears(state.country, state.rangeStart, state.rangeEnd);
  const requestToolsReady = plannable && state.holidaysReady && !state.holidaysDegraded;
  const requestCount = ledger.requests.length;
  const requestsByDates = useMemo(() => new Map(ledger.requests.map(request => [`${request.start}|${request.end}`, request])), [ledger.requests]);
  const partnerReceived = useMemo(() => readPartnerAvailability(typeof window === 'undefined' ? '' : readBrowserPlanSearch(window.location.search, window.history.state)), []);
  // Issue 10: a link's all-days-off work week was replaced with Monday to Friday at decode.
  // Say so until the person picks their own working days.
  const [linkWorkWeek] = useState(() => ({
    issue: typeof window === 'undefined' ? null : workWeekLinkIssue(readBrowserPlanSearch(window.location.search, window.history.state)),
    week: state.workWeek,
  }));
  const workWeekNotice = linkWorkWeek.week === state.workWeek ? linkWorkWeek.issue : null;
  const freeDays = useMemo(() => {
    if (state.validationIssues.length) return [];
    const off = new Set(state.effectiveOffDays);
    const unavailable = new Set(state.solveInput.blackouts);
    return rangeISO(state.rangeStart, state.rangeEnd).filter(date => !unavailable.has(date) && (off.has(date) || !state.workWeek[mondayIndexedDow(date)]));
  }, [state.validationIssues, state.effectiveOffDays, state.solveInput.blackouts, state.rangeStart, state.rangeEnd, state.workWeek]);
  const requestCalendar = { workWeek: state.workWeek, offDays: state.effectiveOffDays, rangeStart: state.rangeStart, rangeEnd: state.rangeEnd };
  const [justTracked, setJustTracked] = useState<{ id: string; message: string } | null>(null);
  // Committed requests as shareable breaks: dates and saved cost only, never notes.
  const committedBreaks = useMemo(() => state.committedEntries.map(entry => {
    const days = rangeISO(entry.start, entry.end);
    return { id: `committed:${entry.id}`, start: entry.start, end: entry.end, days, totalDaysOff: days.length, ptoCost: entry.ptoDays, multiplier: entry.ptoDays ? days.length / entry.ptoDays : days.length, tags: [], meanDemand: 1 };
  }), [state.committedEntries]);
  const partnerBreaks = useMemo(() => [...committedBreaks, ...state.breaks], [committedBreaks, state.breaks]);
  const recordBreak = (brk: typeof state.breaks[number], ptoDates: string[], action: 'saved' | 'tracked') => {
    if (!requestToolsReady || ptoDates.length !== brk.ptoCost) {
      return { ok: false, message: 'Wait for your calendar to update, then try again.' };
    }
    const range = { start: brk.start, end: brk.end };
    const recorded = action === 'saved'
      ? ledger.saveBreak({ ...range, ptoDates }, requestCalendar)
      : ledger.addRequest(range, requestCalendar);
    return settleLedgerAction(recorded, result => {
      if (result.ok && !result.existing) {
        if (action === 'tracked') track('request_tracking_started');
        trackBreakAction(action);
      }
      // The tracked break moves into the committed entries; keep its confirmation there.
      if (action === 'tracked' && result.ok && result.id) setJustTracked({ id: result.id, message: result.message });
      return result;
    });
  };
  // The touch day sheet sets a day's state directly (take / never / let the planner
  // decide); the planner stores it as the same three-step pin cycle a click walks through.
  const setDayState = (date: string, target: 'include' | 'exclude' | null) => {
    const cycle: (string | undefined)[] = [undefined, 'include', 'exclude'];
    let steps = (cycle.indexOf(target ?? undefined) - cycle.indexOf(state.forced[date]) + 3) % 3;
    while (steps-- > 0) state.toggleDay(date);
  };
  const { previewPin, totalDaysOff: currentDaysOff, budgetSpent: currentBudgetSpent } = state;
  const pinPreview = useCallback(async (date: string) => {
    const preview = await previewPin(date);
    return preview ? pinPreviewText(preview, { totalDaysOff: currentDaysOff, budgetSpent: currentBudgetSpent }) : null;
  }, [previewPin, currentDaysOff, currentBudgetSpent]);
  // Opening More options from the rail scrolls the panel into view (it can open below the
  // fold inside the sticky rail).
  const optionsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const openAssumptions = () => {
      if (window.location.hash !== '#planning-assumptions') return;
      setOptionsOpen(true);
    };
    openAssumptions();
    window.addEventListener('hashchange', openAssumptions);
    return () => window.removeEventListener('hashchange', openAssumptions);
  }, []);
  useEffect(() => {
    if (!optionsOpen || window.location.hash !== '#planning-assumptions') return;
    const heading = document.getElementById('planning-assumptions');
    heading?.scrollIntoView?.({ block: 'start' });
    heading?.focus({ preventScroll: true });
  }, [optionsOpen]);
  const toggleOptions = () => {
    const next = !optionsOpen;
    setOptionsOpen(next);
    if (next && window.location.hash !== '#planning-assumptions') requestAnimationFrame(() => optionsRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }));
  };
  const [partnerOpen, setPartnerOpen] = useState<{ key: number; breakId?: string }>({ key: 0 });
  const openPartnerPlanner = (breakId?: string) => {
    setPartnerOpen((previous) => ({ key: previous.key + 1, breakId }));
    requestAnimationFrame(() => document.getElementById('partner-planner')?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }));
  };
  const hasHover = useHasHover();
  // At 1024px and up the sliders live in the sticky left rail with the inputs; narrower, they
  // follow the break cards. Unknown width (the prerender, tests) uses the narrow order, which
  // CSS grid still places in the left column on a wide screen until the script runs.
  const wide = useMinWidth(1024);
  const railHoldsShape = wide === true;
  const holidayFocusDate = state.holidayFocusDate;
  const holidayFocusRun = state.holidayFocusRun;
  useEffect(() => {
    if (!holidayFocusDate || window.location.hash !== '#holiday-focus') return;
    const heading = document.getElementById('holiday-focus');
    heading?.scrollIntoView?.({ block: 'start' });
    heading?.focus({ preventScroll: true });
  }, [holidayFocusDate]);

  // On a phone the calendar opens on the months that matter: a break, a tracked request, a
  // day the person pinned, ruled out or blacked out, or the holiday they came to plan around.
  const narrowKeepDates = useMemo(() => [
    ...state.breaks.flatMap(brk => brk.days),
    ...state.committedEntries.flatMap(entry => rangeISO(entry.start, entry.end)),
    ...Object.keys(state.forced),
    // Days the person can't take off (typed or imported from a calendar file) stay in view.
    ...(state.solveInput.blackouts ?? []),
    ...(holidayFocusDate ? [holidayFocusDate] : []),
  ], [state.breaks, state.committedEntries, state.forced, state.solveInput.blackouts, holidayFocusDate]);

  const previewRun = state.hoveredAlternative
    ? { start: state.hoveredAlternative.start, end: state.hoveredAlternative.end }
    : null;

  const mostContestedId = mostContestedBreakId(state.breaks);

  const { showHelp, setShowHelp } = useKeyboardShortcuts({
    onCopyLink: () => document.getElementById('shortcut-copy-link')?.click(),
    onDownloadIcs: () => document.getElementById('shortcut-download-ics')?.click(),
  });

  const fieldLabel = 'text-sm font-semibold text-ink';
  const selectClass = 'select-ink w-full min-w-0 text-[15px] font-normal';
  const stylePreset = planningStyleSettings(state.planningStyle);
  const sliderLabel = (count: number) => count >= 7 ? 'as many breaks as possible' : count === 1 ? '1 long break' : `${count} breaks`;
  const styleName = { balanced: 'Balanced', 'long-breaks': 'Long breaks', 'more-breaks': 'More breaks', custom: 'Custom' }[state.planningStyle];

  const inputsSection = (
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
        onBudgetBlankChange={setBudgetBlank}
      />
      <p className="text-sm text-muted">This planner works in whole days. <a href="/policy" className="link-mark">Track and forecast hourly leave in My PTO</a>.</p>
      {state.hasSharedHolidaySnapshot && (
        <p className="text-sm text-muted">
          This plan uses the holiday dates the sender chose. To edit or save it, switch to your own calendar.{' '}
          <button type="button" className="link-mark min-h-11" onClick={state.restoreMyEmployerCalendar}>Use my saved calendar</button>
        </p>
      )}
      {state.hasTrackedRequests && (
        <div className="space-y-1 text-sm text-muted">
          {(state.isSharedPlan || state.isLandingPreview) && (
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" checked={state.applyTrackedRequests} onChange={event => state.setApplyTrackedRequests(event.target.checked)} />
              Apply my tracked requests
            </label>
          )}
          {state.applyTrackedRequests && (state.approvedPtoDays > 0 || state.tentativePtoDays > 0) && (
            <p data-testid="tracked-requests-summary">
              Includes {dayNumber(state.approvedPtoDays)} approved {dayWord(state.approvedPtoDays)} off · {dayNumber(state.tentativePtoDays)} tentative
              {state.reservedPtoDays > 0 && !state.unlimitedPto ? `, ${state.reservedPtoDays} reserved from the budget` : ''}.
            </p>
          )}
          {state.applyTrackedRequests && <p>New breaks avoid the time off you’ve tracked in this browser, whether approved, requested or planned.</p>}
          {state.applyTrackedRequests && state.hasHourlyBookings && (
            <p data-testid="tracked-hourly-note">
              {workspace.schedule
                ? <>Hourly requests count as a share of that day's shift: {dayAmount(state.reservedPtoDayEquivalent)} owed.</>
                : <>Hourly requests count as whole days here until <a className="link-mark" href="/policy">My PTO</a> has your work hours.</>}
              {!state.unlimitedPto && state.reservedPtoDayEquivalent !== state.reservedPtoDays ? ` The planner budgets whole days, so it reserves ${state.reservedPtoDays}.` : ''}
            </p>
          )}
          {state.applyTrackedRequests && !state.unlimitedPto && state.approvedPtoDays > 0 && (
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" checked={state.reserveApprovedPto} onChange={event => state.setReserveApprovedPto(event.target.checked)} />
              Reserve {dayNumber(state.approvedPtoDays)} approved PTO {dayWord(state.approvedPtoDays)} from the entered budget
              <span className="text-muted">(for this plan only; My PTO keeps its own setting)</span>
            </label>
          )}
        </div>
      )}
    </section>
  );
  const shapeSection = (
    <>
      {/* Both sliders stay on screen at every width; never behind a disclosure. */}
      <section id="plan-shape" tabIndex={-1} aria-labelledby="plan-shape-heading" className={`flex min-w-0 flex-col gap-3 ${railHoldsShape ? 'mt-5 border-t border-line pt-4' : 'scroll-mt-2 md:scroll-mt-14'}`}>
        <div>
          <h2 id="plan-shape-heading" className="text-xl font-bold leading-6 text-ink type-condensed">Shape your plan</h2>
          <p className="mt-1 text-sm text-muted">The plan updates as you move the sliders.</p>
        </div>
        <div className={railHoldsShape ? 'contents' : 'grid min-w-0 gap-3 md:grid-cols-2 md:gap-x-10'}>
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
          pending={state.planningPending}
        />
        </div>
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
              ? `${styleName}: ${weightingShort(stylePreset.w)}, ${sliderLabel(stylePreset.breakCount)}. Moving a slider switches to Custom.`
              : 'Custom: the sliders keep your settings.'}
          </span>
        </label>
      </section>
    </>
  );
  const optionsBlock = (
    <>
      {/* One clearly named disclosure for the advanced policy settings. */}
      <div className="mt-5 border-t border-line pt-4">
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
              noticeUnit={state.noticeUnit}
              onChangeNoticeUnit={state.setNoticeUnit}
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
              planningWindow={{ start: state.rangeStart, end: state.rangeEnd }}
              onRemoveBlackout={(d) => state.setBlackouts(state.blackouts.filter((x) => x !== d))}
              holidayEntries={state.holidayEntries}
              sharedHolidaySnapshot={state.hasSharedHolidaySnapshot}
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
    </>
  );

  return (
    <div className="min-h-screen bg-page">
      <SiteHeader active="pto" />
      {plannable && !zeroBudget && <CompactResultBar watch={resultRef} totalDaysOff={state.totalDaysOff} budgetSpent={state.budgetSpent} breakCountActual={state.breakCountActual} />}

      <main id="main-content" tabIndex={-1} className="focus:outline-none" data-plan-ready={state.holidaysReady && !state.planningPending}>
        <Container className="px-4 pb-16 pt-6 sm:px-6 lg:pb-24 lg:pt-10">
          <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)] xl:gap-x-14">

            <section id="saved-plans" ref={resultRef} tabIndex={-1} aria-label="Your plan" data-plan-result={state.planningPending ? 'pending' : plannable ? 'ready' : 'unavailable'} className="flex min-w-0 scroll-mt-16 flex-col gap-4 sm:gap-5 lg:col-span-2 lg:col-start-1 lg:row-start-1">
              <Headline
                budgetSpent={state.budgetSpent}
                totalDaysOff={state.totalDaysOff}
                breakCountActual={state.breakCountActual}
                scores={state.scores}
                budget={state.budget}
                reserveDays={state.reserveDays}
                trackedReservedDays={state.reservedPtoDays}
                canPin={state.canPin && requestToolsReady && !budgetBlank}
                pending={state.planningPending}
                unavailable={!plannable && !state.planningPending}
                onPin={state.pinPlan}
                pinnedCount={state.pinnedPlans.length}
                unlimitedPto={state.unlimitedPto}
                noPtoMessage={noPtoMessage}
                exampleFor={budgetBlank && plannable && !zeroBudget ? state.budget : undefined}
              />
              <PinnedPlansStrip
                summaries={state.pinnedPlans.map((p) => p.summary)}
                onRestore={state.restorePlan}
                onRemove={state.removePinnedPlan}
              />
              {state.pinMessage && <p role="status" className="text-sm text-muted">{state.pinMessage}</p>}
              {plannable && !zeroBudget && (
                <SummaryMetrics
                  budgetSpent={state.budgetSpent}
                  totalDaysOff={state.totalDaysOff}
                  breakCountActual={state.breakCountActual}
                  scores={state.scores}
                  travelBasis={state.country === 'US' ? 'us' : 'estimate'}
                />
              )}
              {/* Thumb reach on phones: save and export sit with the result, not only at the
                  top-right corner. Each is a 44px target; a 2 x 2 grid on the narrowest screens. */}
              {longest && (
                <p className="text-base text-ink lg:hidden">
                  <a href={`#break-card-${longest.index}`} className="link-mark inline-flex min-h-11 items-center font-semibold tabular-nums">
                    Longest: {datedRange(longest.brk.start, longest.brk.end)} · {longest.brk.totalDaysOff} days off for {longest.brk.ptoCost} PTO {longest.brk.ptoCost === 1 ? 'day' : 'days'}
                  </a>
                </p>
              )}
              <nav aria-label="On this page" className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                {wide === false && plannable && !zeroBudget && !budgetBlank && (
                  <button type="button" onClick={state.pinPlan} disabled={!(state.canPin && requestToolsReady)} title={state.pinnedPlans.length >= 2 ? 'Remove a saved plan to make room for another.' : undefined} className={buttonClasses('secondary', 'md', 'px-3! text-sm!')}>
                    Save this plan
                  </button>
                )}
                {[
                  ['#take-it-heading', 'Export and share'],
                  [railHoldsShape ? '#plan-controls' : '#plan-shape', 'Adjust plan'],
                  ['#complete-plan-heading', 'Calendar'],
                ].map(([href, label]) => (
                  <a key={label} href={href} className={buttonClasses('secondary', 'md', 'px-3! text-sm!')}>{label}</a>
                ))}
                <a href="#compare-plans" onClick={() => setComparisonOpen(true)} className={buttonClasses('secondary', 'md', 'hidden! px-3! text-sm! lg:inline-flex!')}>Compare options</a>
              </nav>
            </section>

            {/* DOM order is reading order at every width. Desktop: the rail (inputs, sliders,
                options) is the left column, so it comes before the break cards. Narrower: the
                inputs sit right under the result, the way the landing page pairs its answer
                with "I have 15 PTO days", and the sliders follow the break cards. */}
            <aside id="plan-controls" aria-label="Plan settings" tabIndex={-1} className={`min-w-0 scroll-mt-16 lg:col-start-1 lg:row-start-2 lg:self-start ${railHoldsShape ? 'lg:sticky lg:top-4 lg:row-span-3 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:overscroll-auto' : ''}`}>
              <div className="rounded-[10px] border border-line bg-surface p-4 sm:p-5">
                {inputsSection}
                {railHoldsShape && <>{shapeSection}{optionsBlock}</>}
              </div>
            </aside>

            <div className="flex min-w-0 flex-col gap-5 lg:col-start-2 lg:row-span-2 lg:row-start-2">
              {holidayFocusDate && (
                <div id="holiday-focus" tabIndex={-1} className="scroll-mt-16 rounded-[10px] border border-line bg-surface p-4 text-sm text-ink">
                  <p className="font-semibold">Planning around {state.holidayNameFor(holidayFocusDate) ?? 'this holiday'}</p>
                  <p>{formatLong(holidayFocusDate)}</p>
                  {holidayFocusRun && holidayFocusRun.length > 1 && (
                    <p className="mt-1">{holidayFocusRun.length} days off in a row · {formatCardDateRange(holidayFocusRun.start, holidayFocusRun.end)}</p>
                  )}
                  {!state.planningPending && !state.validationIssues.length && <a className="link-mark inline-flex min-h-11 items-center" href={`#day-${holidayFocusDate}`}>Find this date on the calendar</a>}
                </div>
              )}
              {(state.partnerOverlapReceived || state.sharedPlanDifferences || partnerReceived.invalid || workWeekNotice || partnerReceived.availability || state.validationIssues.length > 0 || state.solverIssue || state.relaxedMinimum !== undefined || state.peakCapApplied || state.holidaysDegraded) && (
                <div className="flex flex-col gap-3">
                  {state.partnerOverlapReceived && (
                    <PartnerOverlapBanner overlapDayCount={state.overlapDays.length} onDismiss={state.dismissPartnerOverlapBanner} />
                  )}
                  {partnerReceived.invalid && <p role="alert" className="rounded-[10px] border border-error bg-error-soft p-4 text-sm text-ink">This partner availability link is invalid or too large. Ask for a new link with fewer dates.</p>}
                  {partnerReceived.availability && <p role="status" className="rounded-[10px] bg-surface-alt p-4 text-sm text-ink">Someone shared {partnerReceived.availability.days.length} {partnerReceived.availability.status} available dates. Your own PTO budget and calendar apply. <a className="link-mark font-semibold" href="#partner-planner">See dates you can both take off</a></p>}
                  {workWeekNotice && <p role="status" className="rounded-[10px] bg-surface-alt p-4 text-sm text-ink">{workWeekNotice}</p>}
                  {state.sharedPlanDifferences && (
                    <SharedPlanNotice
                      differences={state.sharedPlanDifferences}
                      savedCalendarOff={state.hasSavedCalendarOffForSharedPlan && !state.hasSharedHolidaySnapshot}
                      onUseSavedCalendar={state.restoreMyEmployerCalendar}
                    />
                  )}
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
                      Some public holidays could not load. Check your employer calendar before requesting these dates.
                    </p>
                  )}
                </div>
              )}
              {/* Issue 17: plan years without holiday data say so; nothing renders or loads for bundled years. */}
              {!state.hasSharedHolidaySnapshot && (
                <HolidayCoverageNotice country={state.country} rangeStart={state.rangeStart} rangeEnd={state.rangeEnd} />
              )}
              <section aria-labelledby="breaks-heading" id="summary-heading" className="min-w-0 scroll-mt-16">
                <h2 id="breaks-heading" tabIndex={-1} className="scroll-mt-16 text-h2 font-bold text-ink type-condensed">Requesting each break</h2>
                {plannable && (state.breaks.length > 0 || state.committedEntries.length > 0) ? (
                  <ul className="m-0 mt-3 flex list-none flex-col gap-3 p-0">
                    {state.committedEntries.map(entry => (
                      <li key={`committed-${entry.id}`} data-testid="committed-entry" data-committed-start={entry.start} data-committed-end={entry.end} data-committed-status={entry.status} data-break-start={entry.start} data-break-end={entry.end} data-break-pto={entry.ptoDays} className="rounded-[10px] border border-line bg-surface-alt">
                        <CommittedBreakCard
                          entry={entry}
                          message={justTracked?.id === entry.id ? justTracked.message : undefined}
                          focusLink={justTracked?.id === entry.id}
                          onPlanWithPartner={requestToolsReady ? () => openPartnerPlanner(`committed:${entry.id}`) : undefined}
                        />
                      </li>
                    ))}
                    {state.orderedBreaks.map(({ index, brk }) => {
                      const ptoDates = brk.days.filter(state.isSuggestedPto);
                      const breakReady = requestToolsReady && ptoDates.length === brk.ptoCost;
                      const request = requestsByDates.get(`${brk.start}|${brk.end}`);
                      const requestState = request ? request.status === 'considering' ? 'saved' : 'tracked' : undefined;
                      const requestDatesChanged = request && (request.ptoDates.length !== ptoDates.length
                        || request.ptoDates.some(date => !ptoDates.includes(date)));
                      return (
                        <li key={brk.id} id={`break-card-${index}`} tabIndex={-1} data-break-start={brk.start} data-break-end={brk.end} data-break-pto={brk.ptoCost} className="scroll-mt-16 rounded-[10px] border border-line bg-surface">
                          <BreakCard
                            onSave={breakReady ? () => recordBreak(brk, ptoDates, 'saved') : undefined}
                            onTrack={breakReady ? () => recordBreak(brk, ptoDates, 'tracked') : undefined}
                            requestState={requestState}
                            requestDatesChanged={requestDatesChanged}
                            requestToolsReady={breakReady}
                            onPlanWithPartner={breakReady ? () => openPartnerPlanner(brk.id) : undefined}
                            brk={brk}
                            index={index}
                            highlighted={state.highlightedBreakIds.has(brk.id) || state.hoveredBreakId === brk.id}
                            isPtoDay={state.isSuggestedPto}
                            onHover={state.setHoveredBreakId}
                            isMostContested={brk.id === mostContestedId}
                            reason={breakReason(brk, state.holidayNameFor)}
                            today={today}
                            noticePeriodDays={state.noticePeriodDays}
                            noticeUnit={state.noticeUnit}
                            workWeek={state.workWeek}
                            offDays={state.effectiveOffDays}
                            anchorId={`break-${index}`}
                          />
                        </li>
                      );
                    })}
                  </ul>
                ) : plannable && <p data-testid="no-breaks" className="mt-2 text-sm text-muted">{noBreaksMessage(state.budget, state.effectiveBudget)}</p>}
              </section>
              {plannable && <a href="#planning-assumptions" className="link-mark inline-flex min-h-11 w-fit items-center text-sm">Edit workweek and employer holidays</a>}

              {plannable && state.breaks.length > 0 && (
                <PlanExplanation
                  breaks={state.breaks}
                  workWeek={state.workWeek}
                  offDays={new Set(state.effectiveOffDays)}
                  budgetSpent={state.budgetSpent}
                  totalDaysOff={state.totalDaysOff}
                />
              )}
            </div>

            {!railHoldsShape && (
              <div className="min-w-0 rounded-[10px] border border-line bg-surface p-4 sm:p-5 lg:col-start-1 lg:row-start-3 lg:self-start">
                {shapeSection}
                {optionsBlock}
              </div>
            )}

            <div className="flex min-w-0 flex-col gap-12 lg:col-start-2 lg:row-start-4 lg:gap-16">
              <details id="compare-plans" open={comparisonOpen} className="scroll-mt-16 rounded-[10px] border border-line bg-surface px-4 py-2" onToggle={event => setComparisonOpen(event.currentTarget.open)}>
                <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 font-semibold text-ink [&::-webkit-details-marker]:hidden">
                  Compare plans <PlusMinus open={comparisonOpen} />
                </summary>
                {comparisonOpen && (plannable && state.holidaysReady ? (
                  <PortfolioComparison
                    input={state.solveInput}
                    minimumBreakDays={state.minimumBreakDays}
                    calendarIncomplete={state.holidaysDegraded || uncoveredHolidayYears.length > 0}
                    allowBudgetChange={!state.unlimitedPto}
                    budget={state.budget}
                    reservedDays={state.reserveDays + state.reservedPtoDays}
                    onSetBudget={state.setBudget}
                    onExtendEnd={state.setRangeEnd}
                  />
                ) : <p className="mb-2 text-sm text-muted">Comparison is available when your plan is ready.</p>)}
              </details>

              <section aria-labelledby="complete-plan-heading" className="min-w-0">
                <h2 id="complete-plan-heading" tabIndex={-1} className="scroll-mt-16 text-h2 font-bold text-ink type-condensed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">Your complete plan</h2>
                <p className="mt-1 max-w-prose text-sm text-muted">
                  {/* Chosen by CSS, not JS, so the prerendered page is right on touch from the first paint. */}
                  <span className="hidden [@media(hover:hover)]:inline">Click a day to cycle through take off, rule out, and let the planner decide. Arrow keys move between days.</span>
                  <span className="[@media(hover:hover)]:hidden">Tap a day to change its setting.</span>
                </p>
                <div className="mt-4 rounded-[10px] border border-line bg-surface p-3 sm:p-5 max-[400px]:-mx-4 max-[400px]:rounded-none max-[400px]:border-x-0 max-[400px]:px-1">
                  {!state.validationIssues.length && !state.planningPending ? <CalendarErrorBoundary>
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
                      narrowKeepDates={narrowKeepDates}
                      narrowShowAll={allMonthsShown}
                      onNarrowShowAllChange={setAllMonthsShown}
                    />
                  </CalendarErrorBoundary> : <p className="text-sm text-muted">{state.planningPending ? 'Updating the calendar…' : 'Check your dates and PTO balance to see the calendar.'}</p>}
                  {!state.validationIssues.length && !state.planningPending && (
                    <div className="mt-5 border-t border-line pt-4">
                      <Legend showCompany={state.holidayEntries.some((h) => h.checked && h.source === 'custom')} showBlackout={state.hasBlackouts} showPinned={Object.values(state.forced).includes('include')} showAlternatives={state.showAlternatives} />
                    </div>
                  )}
                </div>
              </section>

              <section aria-labelledby="take-it-heading" className="flex min-w-0 flex-col gap-5">
                <div>
                  <h2 id="take-it-heading" tabIndex={-1} className="scroll-mt-16 text-h2 font-bold text-ink type-condensed">Take it with you</h2>
                  <p className="mt-1 text-sm text-muted">Download your calendar, copy a shareable plan link, or plan with a partner.</p>
                </div>
                {requestToolsReady ? <ExportBar
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
                  noticeUnit={state.noticeUnit}
                  workWeek={state.workWeek}
                  offDays={state.effectiveOffDays}
                  observedHolidayDates={state.holidaysReady && !state.holidaysDegraded ? state.holidayEntries.filter(holiday => holiday.checked).map(holiday => holiday.date) : undefined}
                  onPlanWithPartner={() => openPartnerPlanner()}
                  planSearch={state.planSearch}
                  shareSnapshot={state.shareSnapshot}
                /> : <p className="text-sm text-muted">{
                  !plannable && !state.planningPending ? 'Check your planning inputs before exporting.'
                    : 'Calendar and sharing tools appear when a plan and its holidays are ready.'
                }</p>}

                {plannable && state.holidaysReady && !state.holidaysDegraded && (
                  <PortraitShare breaks={state.breaks} rangeStart={state.rangeStart} rangeEnd={state.rangeEnd} holidayAssumption={state.employerCalendar.custom.length ? 'company' : state.employerCalendar.excluded.length ? 'customized' : 'public'} remainingBalance={state.unlimitedPto ? undefined : Math.max(0, state.budget - state.budgetSpent)} holidayNamesOf={brk => [...new Set(state.holidayEntries.filter(holiday => holiday.checked && holiday.date >= brk.start && holiday.date <= brk.end).map(holiday => holiday.source === 'custom' ? 'Company holiday' : holiday.name))]} />
                )}
                <div id="partner-planner" className="scroll-mt-16">
                  {requestToolsReady && <PartnerPlanner openKey={partnerOpen.key} selectedBreakId={partnerOpen.breakId} breaks={partnerBreaks} freeDays={freeDays} input={state.solveInput} minimumBreakLength={state.minimumBreakDays} />}
                </div>
              </section>

              {/* The full request tracker lives in My PTO; the planner shows where it is and how
                  many requests it holds, so there is one place to edit them. */}
              <section id="requests" aria-labelledby="requests-heading" className="flex min-w-0 scroll-mt-16 flex-col gap-1 border-t border-line pt-5">
                <h2 id="requests-heading" className="text-xl font-bold leading-6 text-ink type-condensed">My PTO requests</h2>
                <p data-testid="request-count" className="text-sm text-muted">
                  {requestCount === 0
                    ? 'Breaks you save or track appear in My PTO, where you can update their status.'
                    : `My PTO has ${requestCount} ${requestCount === 1 ? 'request' : 'requests'} from this browser.`}
                </p>
                <p className="flex flex-wrap gap-x-5 text-sm">
                  <a href="/policy#requests" className="link-mark inline-flex min-h-11 items-center font-semibold">{requestCount === 0 ? 'Open My PTO requests' : 'Manage requests in My PTO'}</a>
                  <a href="/policy#balance" className="link-mark inline-flex min-h-11 items-center font-semibold">Forecast my balance and check expiration</a>
                </p>
              </section>

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

/** "Dec 24, 2026 – Jan 10, 2027": the landing page's date form, year included. */
function datedRange(start: string, end: string): string {
  const range = formatCardDateRange(start, end);
  return start.slice(0, 4) === end.slice(0, 4) ? `${range}, ${end.slice(0, 4)}` : range;
}
