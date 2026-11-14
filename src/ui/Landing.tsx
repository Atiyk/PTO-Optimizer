import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { COUNTRIES } from '@daysoff/engine/data/countries';
import { addDays, mondayIndexedDow, rangeISO } from '@daysoff/engine/solver/dateUtils';
import type { Break } from '@daysoff/engine/solver/types';
import { formatCardDateRange, formatLong, formatShort, monthShortName } from '@daysoff/engine/calendar/dateFormat';
import { SiteHeader } from './SiteHeader';
import { Footer } from './Footer';
import { Container } from './Container';
import { Button } from './Button';
import { YearStrip } from './YearStrip';
import { geolocateCountry } from './geo';
import { todayISO } from './today';
import { breakReason } from './breakReason';
import { findBridges, nextHoliday, remainingHolidays, runLength } from './landingData';
import { downloadHolidaysICS } from './icsExport';
import { track } from './analytics';
import { computeLandingPlan, landingHolidayHref, landingPlanHref, landingSearch, readLandingState, validLandingRange } from './landingState';
import { readEmployerCalendar } from '../personal/employerCalendar';
import { landingObservedHolidays, useLandingHolidays } from './landingCalendar';
import { weekStartForCountry } from './locale';
import { HOLIDAY_DOT } from './colorScheme';
import { useWholeDayDraft } from './useWholeDayDraft';
import { daysOffSplit } from './Headline';
import type { WeekStart } from '@daysoff/engine/calendar/calendarMath';

/** A control set inside the sentence: it takes the sentence's own size and weight. */
const INLINE_FIELD = 'h-[1.45em] min-h-11 rounded-[6px] border border-line-strong bg-surface px-[0.3em] align-baseline font-bold text-ink hover:border-ink';
const DATE_FIELD = 'h-11 min-w-0 rounded-[6px] border border-line-strong bg-surface px-2.5 text-base font-semibold text-ink hover:border-ink';
const LINK = 'link-mark inline-flex min-h-11 items-center font-semibold';
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function breakDates(brk: { start: string; end: string }): string {
  const range = formatCardDateRange(brk.start, brk.end);
  return brk.start.slice(0, 4) === brk.end.slice(0, 4) ? `${range}, ${brk.end.slice(0, 4)}` : range;
}

const SUNDAY_FIRST_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_SLOTS = 37; // a month spans at most 37 weekday-aligned columns (6 offset + 31 days)

function nextMonthFirst(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}

function monthsBetween(start: string, end: string): string[] {
  const months: string[] = [];
  let [y, m] = start.split('-').map(Number);
  const last = end.slice(0, 7);
  for (;;) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    months.push(key);
    if (key >= last) return months;
    m += 1;
    if (m === 13) { m = 1; y += 1; }
  }
}

/**
 * The whole plan as a printed year schedule: one row per month, days aligned under the same
 * weekday columns (week start as on /pto: Sunday for US/CA/JP, Monday elsewhere), every
 * break of the plan drawn as a soft blue run with a Signal Blue rule and each PTO day a solid blue block; holidays sit on soft teal. The holiday dot is
 * the planner's own. The grid is a picture (aria-hidden); the visible list names
 * every break in words, so nothing depends on colour or on seeing the grid.
 */
function PlanYear({ breaks, best, rangeStart, rangeEnd, holidayName, weekStart }: {
  breaks: Break[]; best: Break; rangeStart: string; rangeEnd: string;
  holidayName: ReadonlyMap<string, string>; weekStart: WeekStart;
}) {
  const offDays = new Set<string>();
  const ptoDays = new Set<string>();
  for (const brk of breaks) {
    for (const date of brk.days) {
      offDays.add(date);
      if (!holidayName.has(date) && mondayIndexedDow(date) < 5) ptoDays.add(date);
    }
  }
  const months = monthsBetween(rangeStart, rangeEnd);
  const half = months.length > 6 ? Math.ceil(months.length / 2) : months.length;
  const columns = [months.slice(0, half), months.slice(half)].filter((group) => group.length > 0);
  const chronological = breaks.slice().sort((a, b) => a.start.localeCompare(b.start));
  const slotStyle = { gridTemplateColumns: `2.75rem repeat(${MONTH_SLOTS}, minmax(0, 1fr))` } as CSSProperties;

  const block = (group: string[]) => <div key={group[0]} className="min-w-0">
    <div aria-hidden="true" className="mb-1 hidden text-center text-xs text-muted sm:grid" style={slotStyle}>
      <span />
      {Array.from({ length: MONTH_SLOTS }, (_, i) => <span key={i}>{SUNDAY_FIRST_LETTERS[(weekStart + i) % 7]}</span>)}
    </div>
    <div aria-hidden="true" className="grid gap-y-[3px]">
      {group.map((month) => {
        const first = `${month}-01`;
        const offset = (mondayIndexedDow(first) + (weekStart === 0 ? 1 : 0)) % 7;
        const days = rangeISO(first, addDays(nextMonthFirst(month), -1));
        return <div key={month} className="grid items-center" style={slotStyle}>
          <span className="text-xs font-semibold text-ink">{monthShortName(first)}{month.endsWith('-01') || month === months[0] ? ` ’${month.slice(2, 4)}` : ''}</span>
          {days.map((date, index) => {
            const inRange = date >= rangeStart && date <= rangeEnd;
            const tone = !inRange ? 'bg-transparent' : ptoDays.has(date) ? 'bg-accent' : offDays.has(date) ? 'bg-mark shadow-[inset_0_-3px_0_var(--accent)]' : holidayName.has(date) ? 'bg-holiday-soft' : mondayIndexedDow(date) >= 5 ? 'bg-surface-alt' : 'bg-page';
            return <span key={date} className={`relative h-5 lg:h-6 ${tone}`} style={index === 0 ? { gridColumnStart: offset + 2 } : undefined}>
              {inRange && holidayName.has(date) && <span className={`absolute bottom-0.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full ${HOLIDAY_DOT}`} />}
            </span>;
          })}
        </div>;
      })}
    </div>
  </div>;

  return <figure className="min-w-0 rounded-[10px] bg-surface p-3 sm:p-5">
    <figcaption className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
      <span className="text-h2 font-bold type-condensed">Every break in this plan</span>
      <span className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
        <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="size-3.5 rounded-[3px] bg-accent" />PTO day</span>
        <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="h-3.5 w-6 rounded-[3px] bg-mark shadow-[inset_0_-3px_0_var(--accent)]" />Day off in a recommended break</span>
        <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="size-3.5 bg-surface-alt" />Weekend</span>
        <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="relative size-3.5 bg-holiday-soft"><span className={`absolute bottom-0.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full ${HOLIDAY_DOT}`} /></span>Public holiday</span>
      </span>
    </figcaption>
    <ol aria-label="Breaks in this plan" className="mb-5 grid list-none gap-x-8 gap-y-1 p-0 text-base text-ink sm:grid-cols-2 lg:grid-cols-3">
      {chronological.map((brk) => <li key={brk.id} data-break-start={brk.start} data-break-end={brk.end} data-break-pto={brk.ptoCost}>
        <span className="font-semibold">{breakDates(brk)}</span>: {brk.totalDaysOff} days off for {plural(brk.ptoCost, 'PTO day')}{brk.id === best.id ? ' (longest)' : ''}
      </li>)}
    </ol>
    <div className="grid gap-x-12 gap-y-4 lg:grid-cols-2">{columns.map(block)}</div>
  </figure>;
}

/** One live engine calculation drives the preview and full-plan handoff. */
function ToolGroup({ title, rows }: { title: string; rows: { href: string; title: string; body: string }[] }) {
  return <div className="min-w-0">
    <h3 className="mb-3 text-sm font-semibold text-muted">{title}</h3>
    <ul className="divide-y divide-line overflow-hidden rounded-[10px] border border-line bg-surface">
      {rows.map((row) => <li key={row.title}>
        <a href={row.href} className="group flex min-h-16 items-center gap-4 px-4 py-4 transition-colors duration-150 hover:bg-surface-alt focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)] sm:px-5">
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-semibold text-ink">{row.title}</span>
            <span className="mt-0.5 block text-[15px] leading-6 text-muted">{row.body}</span>
          </span>
          <span aria-hidden="true" className="text-xl text-muted transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-accent">→</span>
        </a>
      </li>)}
    </ul>
  </div>;
}

export function Landing() {
  const today = todayISO();
  const [state, setState] = useState(() => readLandingState(typeof window === 'undefined' ? '' : window.location.search, today, geolocateCountry()));
  const { country, budget, rangeStart, rangeEnd } = state;
  const employer = useMemo(() => readEmployerCalendar(country), [country]);
  const customizedHolidays = employer.excluded.length > 0 || employer.custom.length > 0;
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
  const budgetDraft = useWholeDayDraft(state.budget, (n) => update({ budget: Math.max(0, Math.min(60, Math.round(n))) }));

  useEffect(() => {
    if (!validRange) return;
    const query = landingSearch(state);
    if (window.location.search !== query) window.history.replaceState(null, '', `/${query}${window.location.hash}`);
  }, [state, validRange]);
  useEffect(() => {
    const onPopState = () => setState(readLandingState(window.location.search, today, geolocateCountry()));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [today]);

  const { loading } = calendar;
  const holidays = useMemo(() => landingObservedHolidays(calendar.holidays, employer, rangeStart, rangeEnd), [calendar.holidays, employer, rangeStart, rangeEnd]);
  const holidaySet = useMemo(() => new Set(holidays.map((holiday) => holiday.date)), [holidays]);
  const holidayName = useMemo(() => new Map(holidays.map((holiday) => [holiday.date, holiday.name])), [holidays]);
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
  const href = validRange ? landingPlanHref(state) : '/pto';
  const countryName = COUNTRIES.find((entry) => entry.code === country)?.name ?? country;
  const budgetBlank = budgetDraft.empty;
  const showGuess = guessing && budget === 15 && !budgetBlank;
  // With 0 PTO days there is nothing to place, but the holidays still make long weekends.
  const holidayLongWeekends = useMemo(() => {
    const seen = new Set<string>();
    return upcoming.filter((entry) => entry.runLength >= 3 && !seen.has(entry.run.start) && seen.add(entry.run.start));
  }, [upcoming]);
  const zeroBudget = budget === 0 && validRange && !loading;
  const emptyMessage = !validRange ? 'Your preview will appear once the planning dates are valid.'
    : loading ? 'Updating your holiday calendar…'
      : plan?.issue ?? 'No break of 3 days or more fits these dates and PTO days. Try a longer date range or more PTO days.';

  return <div className="min-h-dvh bg-page">
    <SiteHeader active="landing" />
    <main id="main-content" tabIndex={-1}>
      {/* First screen: what this is, the sentence that drives it, the answer, the schedule. */}
      <Container className="px-4 pt-7 sm:px-6 sm:pt-12 lg:pt-14">
        <section aria-labelledby="landing-heading">
          <h1 id="landing-heading" className="max-w-[17ch] text-[clamp(2.25rem,0.95rem+5vw,4.75rem)] leading-[1.04] type-display text-ink">More days off from the same PTO.</h1>

          <div className="mt-6 grid min-w-0 gap-x-14 gap-y-6 sm:mt-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
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
            {showGuess && <p className="mt-2 text-[15px] text-muted">A starting guess: 15 PTO days and {countryName} holidays. Change either to match yours.</p>}
            </div>

            <section aria-labelledby="landing-result" data-plan-result={!validRange ? 'unavailable' : loading ? 'pending' : 'ready'} className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:pt-1">
              {budgetBlank ? <>
                <h2 id="landing-result" className="text-h2 font-bold type-condensed text-ink">Enter your PTO days</h2>
                <p className="mt-2 text-base text-muted" role="status">Type how many PTO days you have, and your plan shows here.</p>
              </> : bestBreak ? <>
                <h2 id="landing-result" className="text-[clamp(2.75rem,1.75rem+3vw,4.5rem)] leading-none tabular-nums type-display text-ink">
                  <span className="sr-only">Your plan: </span><span className="mark">{planDaysOff} days off</span>
                </h2>
                <p className="mt-3 text-xl font-semibold tabular-nums text-ink">{daysOffSplit(used, planDaysOff)}, across {plural(breakCount, 'break')}</p>
                <p className="mt-2 text-base text-muted">Longest: <strong className="font-semibold text-ink"><span className="tabular-nums">{breakDates(bestBreak)}</span>, {bestBreak.totalDaysOff} days off for {plural(bestBreak.ptoCost, 'PTO day')}</strong>. {breakReason(bestBreak, (date) => holidayName.get(date))}</p>
              </> : zeroBudget ? <>
                <h2 id="landing-result" className="text-h2 font-bold type-condensed text-ink">No PTO days to spend</h2>
                <p className="mt-2 text-base text-ink" role="status">{holidayLongWeekends.length > 0
                  ? <>Public holidays alone give you {plural(holidayLongWeekends.length, 'long weekend')} in these dates. The next is <strong className="font-semibold tabular-nums">{breakDates(holidayLongWeekends[0].run)}</strong>, for {holidayLongWeekends[0].holiday.name}.</>
                  : 'Public holidays don’t make any long weekends in these dates.'}</p>
              </> : <>
                <h2 id="landing-result" className="text-h2 font-bold type-condensed text-ink">Your recommended break</h2>
                <p className="mt-2 text-base text-muted" role="status">{emptyMessage}</p>
              </>}
              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1">
                <Button href={href}>See the full plan →</Button>
                <span className="text-sm text-muted">Free, no account needed.</span>
              </div>
              <p className="mt-4 text-[15px] text-muted">
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

          <div className="mt-8 sm:mt-10">
            {bestBreak && plan && !budgetBlank && <PlanYear breaks={plan.result.primary} best={bestBreak} rangeStart={rangeStart} rangeEnd={rangeEnd} holidayName={holidayName} weekStart={weekStartForCountry(country)} />}
            <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1">
              <p className="max-w-3xl text-sm text-muted">Preview assumes a Monday–Friday workweek. {customizedHolidays ? 'Your saved employer holiday calendar is applied' : 'National public holidays are assumed to be observed by your employer'}{employer.custom.length > 0 ? ', including additional company days off' : ''}. Calendar days off include weekends, observed holidays, and PTO days.</p>
              <a href={`${href}#planning-assumptions`} className={`${LINK} text-sm`}>Customize workweek and employer holidays →</a>
            </div>
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
                {next && <> Next up: <strong className="font-semibold">{next.holiday.name}</strong> on {formatLong(next.holiday.date)}.{next.bridge ? ` One PTO day can connect a ${runLength(next.bridge.combined)}-day break.` : next.runLength > 1 ? ` Already a ${next.runLength}-day break.` : ''}</>}
              </p>
            </div>
            {holidays.length > 0 && <Button variant="secondary" onClick={() => downloadHolidaysICS(holidays)}>Download holidays (.ics)</Button>}
          </div>

          {validRange && holidays.length > 0 && <div className="mt-6 min-w-0 rounded-[10px] bg-surface p-4 sm:p-5">
            <YearStrip today={rangeStart} stripEnd={rangeEnd} holidays={holidays} bridgeableHolidayDates={bridgeableDates} />
            <p className="mt-2 text-sm text-muted">Tall marked ticks are holidays that already make a long weekend or sit one PTO day from one. Shaded stretches run eight days or more without a holiday.</p>
          </div>}

          {upcoming.length > 0 ? <ol aria-label={`All ${upcoming.length} upcoming holidays`} className="mt-6 list-none p-0">
            {upcoming.map((entry) => {
              const bridge = budget > 0 ? bridges.find((candidate) => candidate.combined.start === entry.run.start || candidate.combined.end === entry.run.end) : undefined;
              return <li key={entry.holiday.date} className="grid grid-cols-[4.75rem_minmax(0,1fr)] items-baseline gap-x-4 rounded-[6px] px-3 py-3 odd:bg-surface sm:px-5 sm:grid-cols-[7rem_minmax(0,1fr)_auto] sm:gap-x-8">
                <p className="text-h2 font-bold type-condensed text-ink tabular-nums">{formatShort(entry.holiday.date)}</p>
                <div className="min-w-0">
                  <p className="text-lg font-semibold text-ink">{entry.holiday.name}</p>
                  <p className="text-sm text-muted">{entry.weekday}, {formatLong(entry.holiday.date)}{entry.isObserved ? ' · observed' : ''} · {entry.runLength >= 3 ? <span className="mark text-ink">{entry.runLength} calendar days off</span> : `${plural(entry.runLength, 'calendar day')} off`} before PTO</p>
                </div>
                <a href={landingHolidayHref(state, entry.holiday.date, bridge?.bridgeDate)} className={`${LINK} col-start-2 text-sm sm:col-start-3 sm:justify-self-end`}>{bridge ? `Connect a ${runLength(bridge.combined)}-day break` : 'View this holiday in the planner'} →</a>
              </li>;
            })}
          </ol> : <p className="mt-8 rounded-[10px] bg-surface p-5 text-base text-muted">{loading ? 'Updating public holidays…' : calendar.degraded ? 'Holiday data could not be loaded. You can still use the planner with your own holiday dates.' : 'No upcoming observed holidays in this range. The planner can still help you make more of your weekends.'}</p>}
        </section>
      </Container>

      {/* How it works: a plain statement, then two facts with their sources. It is the last
          section, so it sits on the page itself rather than a band that would stop short of
          the footer. */}
      <section aria-labelledby="landing-how" className="mt-20 lg:mt-28">
        <Container className="grid gap-x-16 gap-y-10 px-4 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="min-w-0">
            <h2 id="landing-how" className="max-w-[12ch] text-display-sm type-display text-ink">Same inputs, same plan.</h2>
            <p className="mt-4 max-w-sm text-lg text-ink">The planner checks every date in your range against your workweek, public holidays and PTO days. The same inputs always give the same plan, so a link opens it exactly as you left it.</p>
          </div>
          <div className="grid min-w-0 gap-x-10 gap-y-8 sm:grid-cols-2">
            <div>
              <h3 className="text-h2 font-bold type-condensed text-ink">Where the holidays come from.</h3>
              <p className="mt-2 text-base text-ink">Public holiday data comes from Nager.Date. We assume your employer observes those days; you can change that in the planner. Balance forecasts are estimates from the policy you enter.</p>
              <a className={LINK} href="/data-sources">About the data →</a>
            </div>
            <div>
              <h3 className="text-h2 font-bold type-condensed text-ink">What stays in your browser.</h3>
              <p className="mt-2 text-base text-ink">Employer settings and request notes save in this browser only. A plan link carries the planning settings you choose to share, so check it before you send it.</p>
              <a className={LINK} href="/privacy.html">Privacy details →</a>
            </div>
          </div>
        </Container>
      </section>
    </main>
    <Footer />
  </div>;
}
