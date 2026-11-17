import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { COUNTRIES } from '@daysoff/engine/data/countries';
import { addDays } from '@daysoff/engine/solver/dateUtils';
import { formatCardDateRange, formatLong, formatShort } from '@daysoff/engine/calendar/dateFormat';
import { SiteHeader } from './SiteHeader';
import { Footer } from './Footer';
import { Container } from './Container';
import { Button } from './Button';
import { YearStrip } from './YearStrip';
import { geolocateCountry } from './geo';
import { todayISO } from './today';
import { bridgeLinkPhrase, bridgeSentence, findBridges, holidayDisplayName, holidayLongWeekends, holidayRunPhrase, nextHoliday, remainingHolidays } from './landingData';
import { downloadHolidaysICS } from './icsExport';
import { track } from './analytics';
import { computeLandingPlan, landingHolidayHref, landingPlanHref, landingSearch, readLandingState, validLandingRange } from './landingState';
import { employerCalendarCustomized } from '../personal/employerCalendar';
import { useEmployerHolidayProfile } from './useEmployerHolidayProfile';
import { landingObservedHolidays, useLandingHolidays } from './landingCalendar';
import { useWholeDayDraft } from './useWholeDayDraft';
import { daysOffSplit } from './Headline';
import { SHARE_LINK_SENTENCE } from './shareLinkCopy';
import { usePinnedPlans } from './pinnedPlanStore';
import { REQUEST_STORAGE_KEY } from '../personal/requestLedger';
import { HomeHolidayQuestion } from './CompanyHolidayChips';
import { YearLine } from './YearLine';
import { Chevron } from './Chevron';

// The returning-visitor dashboard (and the request, backup and wallet code behind it) loads
// only when this browser has a saved plan or request; a first visit never downloads it.
const ReturningDashboard = lazy(() => import('./ReturningDashboard').then((m) => ({ default: m.ReturningDashboard })));
const SavedDataControls = lazy(() => import('./SavedDataControls').then((m) => ({ default: m.SavedDataControls })));

/** Whether this browser holds tracked requests, read without loading the request ledger. */
function hasStoredRequests(): boolean {
  try { return typeof localStorage !== 'undefined' && localStorage.getItem(REQUEST_STORAGE_KEY) !== null; } catch { return false; }
}

/** A control set inside the sentence: it takes the sentence's own size and weight. */
const INLINE_FIELD = 'h-[1.45em] min-h-11 rounded-[6px] border border-line-strong bg-surface px-[0.3em] align-baseline font-bold text-ink hover:border-ink';
const DATE_FIELD = 'h-11 min-w-0 rounded-[6px] border border-line-strong bg-surface px-2.5 text-base font-semibold text-ink hover:border-ink';
const LINK = 'link-mark inline-flex min-h-11 items-center font-semibold';
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function breakDates(brk: { start: string; end: string }): string {
  const range = formatCardDateRange(brk.start, brk.end);
  return brk.start.slice(0, 4) === brk.end.slice(0, 4) ? `${range}, ${brk.end.slice(0, 4)}` : range;
}

/**
 * The plan's one assumption that most often differs from real life, stated beside the
 * answer: which holidays the person actually gets off. One tap opens the company-holiday
 * chips in place; each chip re-plans at once and saves in this browser for the planner too.
 */
function HolidayCheck({ id, summary, open, onToggle, className = '', children }: {
  id: string; summary: string; open: boolean; onToggle: () => void; className?: string; children: ReactNode;
}) {
  return <div data-holiday-check className={`mt-4 rounded-[12px] bg-surface-alt px-3 sm:px-4 ${className}`}>
    <div className="flex flex-wrap items-center justify-between gap-x-3 py-1">
      <p className="min-w-0 py-1.5 text-[15px] text-ink">{summary}</p>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={onToggle}
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
        {open ? 'Done' : 'Check company holidays'} <Chevron direction={open ? 'up' : 'down'} />
      </button>
    </div>
    {!open && <p data-testid="holiday-policy-warning" className="pb-2 text-xs leading-5 text-muted">
      Public holidays are not necessarily paid days off at your workplace. Check before requesting leave.
    </p>}
    <div id={id} hidden={!open} className="flex flex-col gap-2 pb-3 [&_[data-holiday-chips]]:mt-0 [&>div:first-child]:mt-0 [&>div:first-child]:border-t-0 [&>div:first-child]:pt-0">{open && children}</div>
  </div>;
}

/** The holidays list starts with this many rows; the rest sit behind one disclosure. */
const HOLIDAYS_SHOWN = 3;

/** One live engine calculation drives the preview and full-plan handoff. */
function ToolGroup({ title, rows }: { title: string; rows: { href: string; title: string; body: string }[] }) {
  return <div className="min-w-0">
    <h3 className="mb-3 text-sm font-semibold text-muted">{title}</h3>
    <ul className="divide-y divide-line overflow-hidden rounded-[14px] border border-line bg-surface">
      {rows.map((row) => <li key={row.title}>
        <a href={row.href} className="group flex min-h-14 items-center gap-4 px-4 py-3 transition-colors duration-150 hover:bg-surface-alt focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)] sm:px-5">
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-semibold text-ink">{row.title}</span>
            <span className="mt-0.5 block text-[15px] leading-6 text-muted max-sm:sr-only">{row.body}</span>
          </span>
          <span aria-hidden="true" className="text-xl text-muted transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-accent">→</span>
        </a>
      </li>)}
    </ul>
  </div>;
}

export function Landing() {
  const today = todayISO();
  const [allHolidays, setAllHolidays] = useState(false);
  const { pinnedPlans } = usePinnedPlans();
  const [storedRequests, setStoredRequests] = useState(hasStoredRequests);
  // A request tracked in another tab shows the dashboard here too, as before.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => { if (event.key === null || event.key === REQUEST_STORAGE_KEY) setStoredRequests(hasStoredRequests()); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const [state, setState] = useState(() => readLandingState(typeof window === 'undefined' ? '' : window.location.search, today, geolocateCountry()));
  const { country, budget, rangeStart, rangeEnd } = state;
  const holidayProfile = useEmployerHolidayProfile(country); const employer = holidayProfile.calendar;
  const customizedHolidays = employerCalendarCustomized(employer);
  const validRange = validLandingRange(rangeStart, rangeEnd);
  const calendar = useLandingHolidays(country, rangeStart, rangeEnd, validRange);
  const engaged = useRef(false);
  // The 15 days and the country are our guesses until the visitor sets either one, or a
  // homepage link names the country. Read once at mount: the page rewrites its own URL.
  const [guessing, setGuessing] = useState(() => {
    if (typeof window === 'undefined') return true;
    const params = new URLSearchParams(window.location.search);
    return !(params.get('home') === '1' && params.has('c'));
  });
  const update = (next: Partial<typeof state>) => {
    if (!engaged.current) { engaged.current = true; track('quick_plan_engaged'); }
    if ('budget' in next || 'country' in next) setGuessing(false);
    setState((previous) => ({ ...previous, ...next }));
  };
  // Issue 15: an emptied field is "not entered yet", never a 0-day plan.
  // N-P1-1: blank stays blank on blur, so the answer and the call to action hold still
  // while a tap or a Tab leaves the field.
  const budgetDraft = useWholeDayDraft(state.budget, (n) => update({ budget: Math.max(0, Math.min(60, Math.round(n))) }), { keepBlankOnBlur: true });

  useEffect(() => {
    if (!validRange) return;
    const query = landingSearch(state, budgetDraft.empty);
    if (window.location.search !== query) window.history.replaceState(null, '', `/${query}${window.location.hash}`);
  }, [state, validRange, budgetDraft.empty]);
  useEffect(() => {
    const onPopState = () => setState(readLandingState(window.location.search, today, geolocateCountry()));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [today]);

  const { loading } = calendar;
  // Local holiday names (US "Labor Day", UK "Boxing Day"), applied to each name a date carries.
  const holidays = useMemo(() => landingObservedHolidays(calendar.holidays, employer, rangeStart, rangeEnd)
    .map((holiday) => ({ ...holiday, name: holiday.name.split(' / ').map((name) => holidayDisplayName(name, country)).join(' / ') })),
  [calendar.holidays, employer, rangeStart, rangeEnd, country]);
  const holidaySet = useMemo(() => new Set(holidays.map((holiday) => holiday.date)), [holidays]);
  const plan = useMemo(() => validRange && !loading ? computeLandingPlan(state, holidays) : null, [state, validRange, loading, holidays]);
  const bestBreak = useMemo(() => plan?.result.primary.slice().sort((a, b) => b.totalDaysOff - a.totalDaysOff || b.multiplier - a.multiplier || a.start.localeCompare(b.start))[0], [plan]);
  const used = plan?.result.primary.reduce((total, brk) => total + brk.ptoCost, 0) ?? 0;
  const breakCount = plan?.result.primary.length ?? 0;
  const planDaysOff = plan?.result.primary.reduce((total, brk) => total + brk.totalDaysOff, 0) ?? 0;
  const periodStart = rangeStart > today ? addDays(rangeStart, -1) : today;
  const upcoming = useMemo(() => validRange ? remainingHolidays(periodStart, rangeEnd, holidays) : [], [validRange, periodStart, rangeEnd, holidays]);
  const next = useMemo(() => validRange ? nextHoliday(periodStart, rangeEnd, holidays) : undefined, [validRange, periodStart, rangeEnd, holidays]);
  const bridges = useMemo(() => validRange ? findBridges(periodStart, rangeEnd, holidaySet) : [], [validRange, periodStart, rangeEnd, holidaySet]);
  const bridgeableDates = useMemo(() => new Set(upcoming.filter((entry) => entry.isBridgeable || entry.runLength >= 3).map((entry) => entry.holiday.date)), [upcoming]);
  const budgetBlank = budgetDraft.empty;
  // R2: a blank field has no number to carry, so the planner opens on its own defaults.
  const href = validRange ? landingPlanHref(state, undefined, budgetBlank) : '/pto';
  const holidayDates = useMemo(() => holidays.map((holiday) => holiday.date), [holidays]);
  const shownHolidays = allHolidays ? upcoming : upcoming.slice(0, HOLIDAYS_SHOWN);
  const countryName = COUNTRIES.find((entry) => entry.code === country)?.name ?? country;
  const showGuess = guessing && budget === 15 && !budgetBlank;
  // With 0 PTO days there is nothing to place, but the holidays still make long weekends.
  const longWeekends = useMemo(() => holidayLongWeekends(upcoming), [upcoming]);
  const zeroBudget = budget === 0 && validRange && !loading;
  const orderedPlan = useMemo(() => plan?.result.primary.slice().sort((a, b) => a.start.localeCompare(b.start)) ?? [], [plan]);
  const [holidayCheckOpen, setHolidayCheckOpen] = useState(false);
  // Recovery must work in a fresh browser too, with no saved plan to trigger Welcome back.
  // Load the backup tools only when explicitly requested: keep the first visit lightweight.
  const [restoreBackupOpen, setRestoreBackupOpen] = useState(false);
  const emptyMessage = !validRange ? 'Your preview will appear once the planning dates are valid.'
    : loading ? 'Updating your holiday calendar…'
      : plan?.issue ?? 'No break of 3 days or more fits these dates and PTO days. Try a longer date range or more PTO days.';

  return <div className="min-h-dvh bg-page">
    <SiteHeader active="landing" />
    <main id="main-content" tabIndex={-1}>
      {/* First screen: what this is, the sentence that drives it, the answer, the schedule. */}
      <Container className="px-4 pt-5 sm:px-6 sm:pt-12 lg:pt-14">
        {/* P3: someone who saved a plan or a request here sees it first; the planner follows. */}
        {(pinnedPlans.length > 0 || storedRequests) && (
          <Suspense fallback={null}><ReturningDashboard pinnedPlans={pinnedPlans} today={today} offDays={holidayDates} /></Suspense>
        )}
        <section aria-labelledby="landing-heading">
          <h1 id="landing-heading" className="scroll-mt-16 max-w-[17ch] text-[clamp(2rem,0.95rem+5vw,4.75rem)] leading-[1.04] type-display text-ink">Time off that fits your year.</h1>

          <div className="mt-4 grid min-w-0 gap-x-14 gap-y-4 sm:mt-10 sm:gap-y-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:grid-rows-[auto_1fr]">
            <div className="min-w-0 lg:col-start-1 lg:row-start-1">
            <p className="min-w-0 text-[1.375rem] leading-[1.5] font-medium text-ink sm:text-[1.75rem]">
              I have{' '}
              <input id="landing-budget" aria-label="PTO days available" type="number" inputMode="numeric" min={0} max={60} step={1}
                className={`${INLINE_FIELD} w-[2.6em] text-center tabular-nums`} value={budgetDraft.text}
                onChange={(event) => budgetDraft.onChange(event.target.value)} onBlur={budgetDraft.onBlur} />
              {' '}PTO days in{' '}
              <select id="landing-country" aria-label="Country" className="select-ink h-[1.45em] max-w-full align-baseline font-bold [field-sizing:content]" value={country}
                onChange={(event) => update({ country: event.target.value })}>
                {COUNTRIES.map((entry) => <option key={entry.code} value={entry.code}>{entry.name}</option>)}
              </select>.
            </p>
            {showGuess && <p className="mt-1.5 text-sm text-muted sm:mt-2 sm:text-[15px]">A starting guess: 15 PTO days and {countryName} holidays. Change either to match yours.</p>}
            </div>

            <section aria-labelledby="landing-result" data-plan-result={!validRange ? 'unavailable' : loading ? 'pending' : 'ready'} className="plan-card flex min-w-0 flex-col p-4 sm:p-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start lg:p-7">
              {/* N-P1-1: the blank state reserves the plan's height, so the call to action
                  stays where it was when the field empties. */}
              <div className={budgetBlank ? 'min-h-[9.375rem] sm:min-h-[9.5rem] lg:min-h-[11.75rem]' : undefined}>
              {budgetBlank ? <>
                <h2 id="landing-result" className="text-h2 font-bold type-condensed text-ink">Enter your PTO days</h2>
                <p className="mt-2 text-base text-muted" role="status">Type how many PTO days you have, and your plan shows here.</p>
              </> : bestBreak ? <>
                <h2 id="landing-result" className="text-[clamp(2.5rem,1.75rem+3vw,4.5rem)] leading-none tabular-nums type-display text-ink">
                  <span className="sr-only">Your plan: </span><span className="mark">{planDaysOff} days off</span>
                </h2>
                <p className="mt-2 text-xl font-semibold tabular-nums text-ink sm:mt-3">{daysOffSplit(used, planDaysOff)}, across {plural(breakCount, 'break')}</p>
                <p data-testid="landing-calendar-days-explainer" className="mt-1 text-sm leading-5 text-muted">
                  Calendar days within these breaks, not extra PTO days to request.
                </p>
              </> : zeroBudget ? <>
                <h2 id="landing-result" className="text-h2 font-bold type-condensed text-ink">No PTO days to spend</h2>
                <p className="mt-2 text-base text-ink" role="status">{longWeekends.length > 0
                  ? <>Public holidays alone give you {plural(longWeekends.length, 'long weekend')} in these dates. The next is <strong className="font-semibold tabular-nums">{breakDates(longWeekends[0].run)}</strong>, for {longWeekends[0].holiday.name}.</>
                  : 'Public holidays don’t make any long weekends in these dates.'}</p>
              </> : <>
                <h2 id="landing-result" className="text-h2 font-bold type-condensed text-ink">Your recommended break</h2>
                <p className="mt-2 text-base text-muted" role="status">{emptyMessage}</p>
              </>}
              </div>
              {!budgetBlank && bestBreak && plan && <>
                <ol aria-label="Breaks in this plan" data-landing-breaks className="order-3 m-0 mt-4 list-none divide-y divide-line border-y border-line p-0">
                  {orderedPlan.map((brk) => <li key={brk.id} data-break-start={brk.start} data-break-end={brk.end} data-break-pto={brk.ptoCost}
                    className="flex min-h-11 flex-wrap items-baseline justify-between gap-x-4 py-2 tabular-nums">
                    <span className="font-semibold text-ink">{breakDates(brk)}</span>
                    <span className="text-[15px] text-muted"><span className="font-semibold text-ink">{brk.totalDaysOff} days off</span> · {plural(brk.ptoCost, 'PTO day')}</span>
                  </li>)}
                </ol>
                <YearLine className="order-3 mt-4" rangeStart={rangeStart} rangeEnd={rangeEnd} breaks={orderedPlan} holidayDates={holidayDates} />
              </>}
              {validRange && !loading && !budgetBlank && <HolidayCheck
                id="landing-holiday-check"
                summary={customizedHolidays
                  ? `Uses your company’s holidays: ${plural(holidays.length, 'day')} off in these dates${employer.custom.length > 0 ? ', including company days' : ''}.`
                  : `Assumes you get all ${plural(holidays.length, countryName === 'United States' ? 'US public holiday' : 'public holiday')} off in these dates.`}
                open={holidayCheckOpen}
                onToggle={() => setHolidayCheckOpen((value) => !value)}
                className="order-2"
              >
                <HomeHolidayQuestion profile={holidayProfile} publicHolidays={calendar.holidays} rangeStart={rangeStart} rangeEnd={rangeEnd} />
                <a href={`${href}#planning-assumptions`} className={`${LINK} text-sm`}>Change your workweek in the planner →</a>
              </HolidayCheck>}
              {/* F21: the action sits right under the answer at every width, so it clears the tab
                  bar on a 320x568 phone and the fold at 1440x900; the holiday check and the dates
                  follow it. */}
              <div className="order-1 mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 sm:mt-5">
                <Button href={href}>{budgetBlank ? 'Open the planner →' : 'See the full plan →'}</Button>
                <span className="text-sm text-muted">{budgetBlank ? 'It starts at 15 PTO days. Change them there.' : 'Free, no account needed.'}</span>
              </div>
              <p className="order-4 mt-4 text-[15px] text-muted">
                Planning around <a className="link-mark font-semibold" href={`/family?c=${encodeURIComponent(country)}`}>school breaks</a> or <a className="link-mark font-semibold" href={`/sabbatical?c=${encodeURIComponent(country)}`}>a sabbatical</a>?
              </p>
            </section>

            <div className="min-w-0 lg:col-start-1 lg:row-start-2">
              <div className="max-w-xl">
                <label htmlFor="landing-budget-slider" className="text-sm font-semibold text-ink">Adjust PTO days</label>
                <input id="landing-budget-slider" type="range" min={0} max={60} step={1} value={budget}
                  aria-label="Adjust PTO days available"
                  aria-valuetext={`${budget} PTO ${budget === 1 ? 'day' : 'days'} available`}
                  className="block h-11 w-full cursor-pointer"
                  onChange={(event) => update({ budget: Number(event.target.value) })} />
              </div>
              <fieldset className="mt-3 min-w-0">
                <legend className="sr-only">Planning dates</legend>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-lg text-ink">
                  <span className="flex items-center gap-3">from <input type="date" aria-label="From" className={DATE_FIELD} value={rangeStart} onChange={(event) => update({ rangeStart: event.target.value })} /></span>
                  <span className="flex items-center gap-3">through <input type="date" aria-label="Through" className={DATE_FIELD} value={rangeEnd} onChange={(event) => update({ rangeEnd: event.target.value })} /></span>
                </div>
                <p className="mt-2 text-sm text-muted">{validRange ? `Preview: ${formatLong(rangeStart)} – ${formatLong(rangeEnd)}.` : 'Choose a valid range.'} Any dates up to two years apart; the plan updates as you type.</p>
              </fieldset>
              {!validRange && <p role="alert" className="mt-2 text-sm font-semibold text-error">Choose valid start and end dates, with the end after the start and no more than two years apart.</p>}
            </div>
          </div>

          <div className="mt-6 sm:mt-8">
            <p className="max-w-3xl text-sm text-muted">Preview assumes a Monday–Friday workweek. Days off include weekends, holidays and PTO days.</p>
            {calendar.degraded && <p className="mt-2 text-sm font-semibold text-ink" role="status">Some holiday data is unavailable. This preview may miss public holidays.</p>}
          </div>
        </section>
      </Container>

      {/* What the rest of Timebower does, in the header's own structure: three ways to plan,
          then the tools that keep a plan true. Rows, not posters: each is one tap on a phone. */}
      <Container className="px-4 pt-20 sm:px-6 lg:pt-28">
        <section aria-labelledby="landing-tools">
          <h2 id="landing-tools" className="max-w-[20ch] text-h1 type-display text-ink">Plan the breaks, then keep track of the days.</h2>
          <div className="mt-8 grid gap-6 lg:grid-cols-2 lg:gap-8">
            <ToolGroup title="Plan" rows={[
              { href, title: 'Time off', body: 'Longer breaks and long weekends from your PTO budget. Pin days, rule some out, export the plan.' },
              { href: `/family?c=${encodeURIComponent(country)}`, title: 'Family', body: 'Line your PTO up with your kids’ school breaks, from 12 US district calendars or your own.' },
              { href: `/sabbatical?c=${encodeURIComponent(country)}`, title: 'Sabbatical', body: 'Where a long leave lands best, and what each extra PTO day adds to it.' },
            ]} />
            <ToolGroup title="Keep it on track" rows={[
              { href: '/policy#balance', title: 'Forecast my balance', body: 'What you could have by a future date, including planned leave.' },
              { href: '/policy', title: 'Check my policy', body: 'Accrual, carryover and expiry deadlines, with calendar reminders before days lapse.' },
              { href: '/glossary', title: 'Learn the terms', body: 'Accrual, carryover and payout, explained in plain language.' },
            ]} />
          </div>
        </section>
      </Container>

      {/* The holidays ahead, set as a timetable rather than a wall of cards. */}
      <Container className="px-4 pt-20 sm:px-6 lg:pt-28">
        <section aria-labelledby="landing-holidays">
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
            <div className="min-w-0">
              <h2 id="landing-holidays" className="text-h1 type-display text-ink">Holidays ahead in {countryName}</h2>
              <p className="mt-2 max-w-2xl text-base text-ink">
                {customizedHolidays ? 'Your saved employer-observed calendar for this planning range.' : 'Public holidays in your selected country and planning dates.'}
                {next && <> Next up: <strong className="font-semibold">{next.holiday.name}</strong> on {formatLong(next.holiday.date)}.{next.bridge ? ` ${bridgeSentence(next.bridge)}` : next.runLength > 1 ? (next.clipped ? ` ${holidayRunPhrase(next.runLength, true)}.` : ` Already a ${next.runLength}-day break.`) : ''}</>}
              </p>
            </div>
            {holidays.length > 0 && <Button variant="secondary" onClick={() => downloadHolidaysICS(holidays)}>Download holidays (.ics)</Button>}
          </div>

          {validRange && holidays.length > 0 && <div className="mt-6 min-w-0 rounded-[14px] border border-line bg-surface p-4 sm:p-5">
            <YearStrip today={rangeStart} stripEnd={rangeEnd} holidays={holidays} bridgeableHolidayDates={bridgeableDates} />
            <p className="mt-2 text-sm text-muted">Tall marked ticks are holidays that already make a long weekend or sit one PTO day from one. Shaded stretches run eight days or more without a holiday.</p>
          </div>}

          {upcoming.length > 0 ? <><ol id="landing-holiday-list" aria-label={allHolidays || upcoming.length <= HOLIDAYS_SHOWN ? `All ${upcoming.length} upcoming holidays` : `Next ${HOLIDAYS_SHOWN} of ${upcoming.length} upcoming holidays`} className="mt-6 list-none p-0">
            {shownHolidays.map((entry) => {
              const bridge = budget > 0 ? bridges.find((candidate) => candidate.combined.start === entry.run.start || candidate.combined.end === entry.run.end) : undefined;
              return <li key={entry.holiday.date} className="grid grid-cols-[4.75rem_minmax(0,1fr)] items-baseline gap-x-4 rounded-[6px] px-3 py-3 odd:bg-surface sm:px-5 sm:grid-cols-[7rem_minmax(0,1fr)_auto] sm:gap-x-8">
                <p className="text-h2 font-bold type-condensed text-ink tabular-nums">{formatShort(entry.holiday.date)}</p>
                <div className="min-w-0">
                  <p className="text-lg font-semibold text-ink">{entry.holiday.name}</p>
                  <p className="text-sm text-muted">{entry.weekday}<span className="max-sm:sr-only">, {formatLong(entry.holiday.date)}</span>{entry.isObserved ? ' · observed' : ''} · {entry.runLength >= 3 ? <span className="mark text-ink">{holidayRunPhrase(entry.runLength, entry.clipped)}</span> : holidayRunPhrase(entry.runLength, entry.clipped)}</p>
                </div>
                <a href={landingHolidayHref(state, entry.holiday.date, bridge?.bridgeDate)} className={`${LINK} col-start-2 text-sm sm:col-start-3 sm:justify-self-end`}>{bridge
                  ? <>{bridgeLinkPhrase(bridge)}<span className="sr-only"> around {entry.holiday.name}</span></>
                  : `Plan around ${entry.holiday.name}`}<span aria-hidden="true"> →</span></a>
              </li>;
            })}
          </ol>
          {upcoming.length > HOLIDAYS_SHOWN && <button type="button" aria-expanded={allHolidays} aria-controls="landing-holiday-list"
            className="mt-2 inline-flex min-h-11 items-center px-3 text-sm font-semibold text-ink underline decoration-1 underline-offset-[0.22em] hover:decoration-2 sm:px-5"
            onClick={() => setAllHolidays((open) => !open)}>
            {allHolidays ? `Show the next ${HOLIDAYS_SHOWN} only` : `Show all ${upcoming.length} holidays`}
          </button>}</> : <p className="mt-8 rounded-[10px] bg-surface p-5 text-base text-muted">{loading ? 'Updating public holidays…' : calendar.degraded ? 'Holiday data could not be loaded. You can still use the planner with your own holiday dates.' : 'No upcoming observed holidays in this range. The planner can still help you make more of your weekends.'}</p>}
        </section>
      </Container>

      {/* How it works: a plain statement, then two facts with their sources. It is the last
          section, so it sits on the page itself rather than a band that would stop short of
          the footer. */}
      <section aria-labelledby="landing-how" className="mt-14 sm:mt-20 lg:mt-28">
        <Container className="grid gap-x-16 gap-y-10 px-4 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="min-w-0">
            <h2 id="landing-how" className="max-w-[12ch] text-display-sm type-display text-ink">Same inputs, same plan.</h2>
            <p className="mt-4 max-w-sm text-lg text-ink">The planner checks every date in your range against your workweek, public holidays and PTO days. The same inputs always give the same plan.</p>
          </div>
          <div className="grid min-w-0 gap-x-10 gap-y-8 sm:grid-cols-2">
            <div>
              <h3 className="text-h2 font-bold type-condensed text-ink">Where the holidays come from.</h3>
              <p className="mt-2 text-base text-ink">Public holiday data comes from Nager.Date. We assume your employer observes those days; you can change that in the planner. Balance forecasts are estimates from the policy you enter.</p>
              <a className={LINK} href="/data-sources">About the data →</a>
            </div>
            <div>
              <h3 className="text-h2 font-bold type-condensed text-ink">What stays in your browser.</h3>
              <p className="mt-2 text-base text-ink">Employer settings and request notes save in this browser only. {SHARE_LINK_SENTENCE}</p>
              <a className={LINK} href="/privacy.html">Privacy details →</a>
              <div className="mt-2">
                <button type="button" aria-expanded={restoreBackupOpen} aria-controls="landing-backup-recovery"
                  className={LINK} onClick={() => setRestoreBackupOpen((open) => !open)}>
                  {restoreBackupOpen ? 'Hide backup recovery' : 'Restore a Timebower backup'}
                </button>
                <div id="landing-backup-recovery">
                  {restoreBackupOpen && <Suspense fallback={<p role="status" className="text-sm text-muted">Opening local backup tools…</p>}>
                    <SavedDataControls initiallyOpen />
                  </Suspense>}
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>
    </main>
    <Footer />
  </div>;
}
