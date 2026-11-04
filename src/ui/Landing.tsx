import { getConsumerHolidaysWithStatus as getHolidaysWithStatus } from '../personal/consumerHolidays';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { COUNTRIES } from '@daysoff/engine/data/countries';
import { getPreloadedHolidays, type Holiday } from '@daysoff/engine/data/holidays';
import { addDays, mondayIndexedDow, rangeISO } from '@daysoff/engine/solver/dateUtils';
import { DEFAULT_WORK_WEEK, type Break } from '@daysoff/engine/solver/types';
import { formatCardDateRange, formatLong, formatShort, monthShortName } from '@daysoff/engine/calendar/dateFormat';
import { weekdayName } from '@daysoff/engine/calendar/requestDeadline';
import { SiteHeader } from './SiteHeader';
import { Footer } from './Footer';
import { Container } from './Container';
import { Button } from './Button';
import { YearStrip } from './YearStrip';
import { geolocateCountry } from './geo';
import { todayISO } from './useAppState';
import { breakReason } from './breakReason';
import { findBridges, nextHoliday, remainingHolidays, runLength } from './landingData';
import { downloadHolidaysICS } from './icsExport';
import { copyText } from './requestText';
import { track } from './analytics';
import { landingPlanHref, landingSearch, readLandingState, validLandingRange } from './landingState';
import { solveConsumer } from '../planning/optimizer';
import { readEmployerCalendar } from '../personal/employerCalendar';
import { landingObservedHolidays } from './landingCalendar';

/** A control set inside the sentence: it takes the sentence's own size and weight. */
const INLINE_FIELD = 'h-[1.45em] min-h-11 rounded-[3px] border border-line-strong bg-surface px-[0.3em] align-baseline font-bold text-ink hover:border-ink';
const DATE_FIELD = 'h-11 min-w-0 rounded-[3px] border border-line-strong bg-surface px-2.5 text-base font-semibold text-ink hover:border-ink';
const LINK = 'link-mark inline-flex min-h-11 items-center font-semibold';
const WEEKDAY_LETTER = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const monthName = (iso: string) => formatLong(iso).split(' ')[0];
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function breakDates(brk: Break): string {
  const range = formatCardDateRange(brk.start, brk.end);
  return brk.start.slice(0, 4) === brk.end.slice(0, 4) ? `${range}, ${brk.end.slice(0, 4)}` : range;
}

/**
 * The recommended break as a printed schedule: whole weeks from the Monday before it to the
 * Sunday after it, the run of days off swiped with the marker and each PTO day an ink block.
 * One row on wide screens, a seven-column week grid on phones (no sideways scroll). Category
 * is carried by shape and words too (legend, per-day screen-reader text, holiday ring).
 */
function BreakSchedule({ brk, holidayName }: { brk: Break; holidayName: ReadonlyMap<string, string> }) {
  const first = addDays(brk.start, -mondayIndexedDow(brk.start));
  const last = addDays(brk.end, 6 - mondayIndexedDow(brk.end));
  const days = rangeISO(first, last);
  const inBreak = new Set(brk.days);
  const columns = days.length > 42 ? 14 : days.length;
  const sameMonth = first.slice(0, 7) === last.slice(0, 7);
  const title = sameMonth
    ? `${monthName(first)} ${first.slice(0, 4)}`
    : `${monthName(first)}${first.slice(0, 4) === last.slice(0, 4) ? '' : ` ${first.slice(0, 4)}`} – ${monthName(last)} ${last.slice(0, 4)}`;
  const breakHolidays = brk.days.filter((date) => holidayName.has(date));

  return <figure className="min-w-0 rounded-[4px] bg-surface p-3 sm:p-5">
    <figcaption className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
      <span className="text-h2 font-bold type-condensed">{title}</span>
      <span className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
        <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="size-3.5 bg-ink" />PTO day</span>
        <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="h-3.5 w-6 bg-mark" />Day off in the break</span>
        <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="size-2 rounded-full border-[1.5px] border-ink" />Public holiday</span>
      </span>
    </figcaption>
    <ol aria-label={`Days in the recommended break, ${formatLong(brk.start)} to ${formatLong(brk.end)}`}
      className="grid list-none grid-cols-7 gap-y-1.5 p-0 lg:[grid-template-columns:var(--strip-cols)]"
      style={{ '--strip-cols': `repeat(${columns}, minmax(0, 1fr))` } as CSSProperties}>
      {days.map((date, index) => {
        const off = inBreak.has(date);
        const holiday = holidayName.has(date);
        const pto = off && !holiday && mondayIndexedDow(date) < 5;
        const dayNumber = Number(date.slice(8));
        const topLabel = index > 0 && dayNumber === 1 ? monthShortName(date) : WEEKDAY_LETTER[mondayIndexedDow(date)];
        const category = pto ? 'PTO day' : off ? (holiday ? `public holiday, ${holidayName.get(date)}` : 'weekend, day off') : holiday ? `public holiday, ${holidayName.get(date)}` : 'not in the break';
        const tone = pto ? 'bg-ink text-white' : off ? 'bg-mark text-ink' : 'text-muted';
        return <li key={date} title={holiday ? holidayName.get(date) : undefined}
          className={`flex h-14 min-w-0 flex-col items-center justify-center ${tone} ${off && !inBreak.has(addDays(date, -1)) ? 'rounded-l-[3px]' : ''} ${off && !inBreak.has(addDays(date, 1)) ? 'rounded-r-[3px]' : ''}`}>
          <span aria-hidden="true" className={`text-xs ${pto ? 'text-white/75' : off ? 'text-ink/70' : ''}`}>{topLabel}</span>
          <span aria-hidden="true" className="text-lg leading-6 font-bold type-condensed tabular-nums">{dayNumber}</span>
          <span aria-hidden="true" className={`size-1.5 rounded-full border-[1.5px] ${holiday ? 'border-current' : 'border-transparent'}`} />
          <span className="sr-only">{formatLong(date)}: {category}</span>
        </li>;
      })}
    </ol>
    {breakHolidays.length > 0 && <p className="mt-4 text-sm text-muted">
      {breakHolidays.map((date, index) => <span key={date}>{index > 0 && '; '}<span className="font-semibold text-ink">{holidayName.get(date)}</span>, {weekdayName(date)} {formatShort(date)}</span>)}
    </p>}
  </figure>;
}

/** One live engine calculation drives the preview and full-plan handoff. */
export function Landing() {
  const today = todayISO();
  const [state, setState] = useState(() => readLandingState(typeof window === 'undefined' ? '' : window.location.search, today, geolocateCountry()));
  const { country, budget, rangeStart, rangeEnd } = state;
  const employer = useMemo(() => readEmployerCalendar(country), [country]);
  const customizedHolidays = employer.excluded.length > 0 || employer.custom.length > 0;
  const validRange = validLandingRange(rangeStart, rangeEnd);
  const calendarKey = `${country}:${rangeStart}:${rangeEnd}`;
  const [calendar, setCalendar] = useState<{ key: string; holidays: Holiday[]; loading: boolean; degraded: boolean }>(() => ({
    key: calendarKey, holidays: getPreloadedHolidays(country).filter((holiday) => !holiday.counties),
    loading: getPreloadedHolidays(country).length === 0, degraded: false,
  }));
  const engaged = useRef(false);
  const [copyMessage, setCopyMessage] = useState('');
  const update = (next: Partial<typeof state>) => {
    if (!engaged.current) { engaged.current = true; track('quick_plan_engaged'); }
    setState((previous) => ({ ...previous, ...next }));
  };

  useEffect(() => {
    if (!validRange) return;
    const query = landingSearch(state);
    if (window.location.search !== query) window.history.replaceState(null, '', `/${query}${window.location.hash}`);
  }, [state, validRange]);
  useEffect(() => {
    if (!validRange) return;
    let cancelled = false;
    getHolidaysWithStatus(country, rangeStart, rangeEnd).then((result) => {
      if (!cancelled) setCalendar({ key: calendarKey, ...result, loading: false });
    }).catch(() => {
      if (!cancelled) setCalendar({ key: calendarKey, holidays: [], degraded: true, loading: false });
    });
    return () => { cancelled = true; };
  }, [country, rangeStart, rangeEnd, calendarKey, validRange]);
  useEffect(() => {
    const onPopState = () => setState(readLandingState(window.location.search, today, geolocateCountry()));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [today]);

  const loading = calendar.key !== calendarKey || calendar.loading;
  const holidays = useMemo(() => landingObservedHolidays(calendar.key === calendarKey ? calendar.holidays : [], employer, rangeStart, rangeEnd), [calendar, calendarKey, employer, rangeStart, rangeEnd]);
  const holidaySet = useMemo(() => new Set(holidays.map((holiday) => holiday.date)), [holidays]);
  const holidayName = useMemo(() => new Map(holidays.map((holiday) => [holiday.date, holiday.name])), [holidays]);
  const plan = useMemo(() => validRange && !loading ? solveConsumer({ offDays: [...holidaySet], rangeStart, rangeEnd, budget, country, workWeek: DEFAULT_WORK_WEEK }, { minimumBreakDays: 3, style: 'balanced' }) : null, [validRange, loading, holidaySet, rangeStart, rangeEnd, budget, country]);
  const bestBreak = useMemo(() => plan?.result.primary.slice().sort((a, b) => b.totalDaysOff - a.totalDaysOff || b.multiplier - a.multiplier || a.start.localeCompare(b.start))[0], [plan]);
  const used = plan?.result.primary.reduce((total, brk) => total + brk.ptoCost, 0) ?? 0;
  const breakCount = plan?.result.primary.length ?? 0;
  const periodStart = rangeStart > today ? addDays(rangeStart, -1) : today;
  const upcoming = useMemo(() => validRange ? remainingHolidays(periodStart, rangeEnd, holidays) : [], [validRange, periodStart, rangeEnd, holidays]);
  const next = useMemo(() => validRange ? nextHoliday(periodStart, rangeEnd, holidays) : undefined, [validRange, periodStart, rangeEnd, holidays]);
  const bridges = useMemo(() => validRange ? findBridges(periodStart, rangeEnd, holidaySet) : [], [validRange, periodStart, rangeEnd, holidaySet]);
  const bridgeableDates = useMemo(() => new Set(upcoming.filter((entry) => entry.isBridgeable || entry.runLength >= 3).map((entry) => entry.holiday.date)), [upcoming]);
  const href = validRange ? landingPlanHref(state, undefined, employer) : '/pto';
  const countryName = COUNTRIES.find((entry) => entry.code === country)?.name ?? country;
  const emptyMessage = !validRange ? 'Your preview will appear once the planning dates are valid.'
    : loading ? 'Updating your holiday calendar…'
      : plan?.issue ?? (budget === 0 ? 'No PTO days allocated. You can still explore the holidays below.' : 'No qualifying break fits these dates and PTO days. Try a longer range or more available PTO.');

  return <div className="min-h-dvh bg-page">
    <SiteHeader active="landing" />
    <main id="main-content" tabIndex={-1}>
      {/* First screen: what this is, the sentence that drives it, the answer, the schedule. */}
      <Container className="px-4 pt-7 sm:px-6 sm:pt-12 lg:pt-14">
        <section aria-labelledby="landing-heading">
          <h1 id="landing-heading" className="max-w-[17ch] text-[clamp(2.5rem,0.6rem+7.6vw,7.5rem)] leading-[0.92] type-display text-ink">More days off from the same PTO.</h1>

          <div className="mt-6 grid min-w-0 gap-x-14 gap-y-6 sm:mt-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <p className="min-w-0 text-[1.625rem] leading-[1.6] font-semibold type-condensed text-ink sm:text-[2.125rem] lg:col-start-1 lg:row-start-1">
              I have{' '}
              <input id="landing-budget" aria-label="PTO days available" type="number" inputMode="numeric" min={0} max={60} step={1}
                className={`${INLINE_FIELD} w-[2.6em] text-center tabular-nums`} value={budget}
                onChange={(event) => update({ budget: Math.max(0, Math.min(60, Math.round(Number(event.target.value) || 0))) })} />
              {' '}PTO days in{' '}
              <span className="relative inline-block max-w-full align-baseline">
                <select id="landing-country" aria-label="Country" className={`${INLINE_FIELD} max-w-full appearance-none pr-[1.1em] [field-sizing:content]`} value={country}
                  onChange={(event) => update({ country: event.target.value })}>
                  {COUNTRIES.map((entry) => <option key={entry.code} value={entry.code}>{entry.name}</option>)}
                </select>
                <svg aria-hidden="true" viewBox="0 0 10 6" className="pointer-events-none absolute top-1/2 right-[0.3em] w-[0.42em] -translate-y-1/2"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
              </span>.
            </p>

            <section aria-labelledby="landing-result" className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:pt-1">
              {bestBreak ? <>
                <h2 id="landing-result" className="text-[clamp(2.75rem,1.6rem+3.8vw,4.75rem)] leading-[0.95] type-display text-ink">
                  <span className="sr-only">Your recommended break: </span><span className="mark">{bestBreak.totalDaysOff} days off</span>
                </h2>
                <p className="mt-3 text-xl font-semibold text-ink">for {plural(bestBreak.ptoCost, 'PTO day')}, <span className="whitespace-nowrap">{breakDates(bestBreak)}</span></p>
                <p className="mt-2 text-base text-muted">{breakReason(bestBreak, (date) => holidayName.get(date))} Full plan: <strong className="font-semibold text-ink">{used} of {budget} PTO days</strong> across {plural(breakCount, 'break')}.</p>
              </> : <>
                <h2 id="landing-result" className="text-h2 font-bold type-condensed text-ink">Your recommended break</h2>
                <p className="mt-2 text-base text-muted" role="status">{emptyMessage}</p>
              </>}
              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1">
                <Button href={href}>See the full plan →</Button>
                <span className="text-sm text-muted">Free, no account needed.</span>
              </div>
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
              {!validRange && <p role="alert" className="mt-2 text-sm font-semibold text-ink">Choose valid start and end dates, with the end after the start and no more than two years apart.</p>}
            </div>
          </div>

          <div className="mt-8 sm:mt-10">
            {bestBreak && <BreakSchedule brk={bestBreak} holidayName={holidayName} />}
            <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1">
              <p className="max-w-3xl text-sm text-muted">Preview assumes a Monday–Friday workweek. {customizedHolidays ? 'Your saved employer holiday calendar is applied' : 'National public holidays are assumed to be observed by your employer'}{employer.custom.length > 0 ? ', including additional company days off' : ''}. Calendar days off include weekends, observed holidays, and PTO days.</p>
              <a href={href} className={`${LINK} text-sm`}>Customize workweek and employer holidays →</a>
            </div>
            {calendar.degraded && <p className="mt-2 text-sm font-semibold text-ink" role="status">Some holiday data is unavailable. This preview may miss public holidays.</p>}
          </div>
        </section>
      </Container>

      {/* What the rest of Gapless does: one large tool, then the others as a reading list. */}
      <Container className="px-4 pt-24 sm:px-6 lg:pt-36">
        <section aria-labelledby="landing-tools" className="grid gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
          <div className="min-w-0">
            <h2 id="landing-tools" className="max-w-[16ch] text-h1 type-display text-ink">Plan the breaks, then keep track of the days.</h2>
            <div className="mt-8 rounded-[4px] bg-surface p-6 sm:p-9">
              <h3 className="text-display-sm type-display text-ink">Plan PTO</h3>
              <p className="mt-3 max-w-md text-lg text-ink">Find longer vacations and useful long weekends around the dates that work for you. Pin the days you want, rule out the ones you can’t, then add the plan to your calendar or copy a request.</p>
              <a href={href} className={`${LINK} mt-4 text-lg`}>Explore my plan →</a>
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-10 lg:pt-28">
            <div>
              <h3 className="text-h2 font-bold type-condensed text-ink">Track my PTO balance</h3>
              <p className="mt-2 max-w-md text-base text-ink">See what you could have available by a future date, including planned leave, and set reminders before days expire.</p>
              <a className={LINK} href="/policy#balance">Forecast my balance →</a>
            </div>
            <div>
              <h3 className="text-h2 font-bold type-condensed text-ink">Understand my policy</h3>
              <p className="mt-2 max-w-md text-base text-ink">Make sense of accrual, carryover, and deadlines before your days slip away.</p>
              <a className={LINK} href="/policy">Check my policy →</a>
            </div>
            <div className="rounded-[4px] bg-surface-alt p-5 sm:p-6">
              <h3 className="text-h2 font-bold type-condensed text-ink">Planning something bigger?</h3>
              <p className="mt-2 max-w-md text-base text-ink">Find where a sabbatical lands best and what each extra PTO day adds to it. New to the terms? The guides explain accrual, carryover, and payout in plain language.</p>
              <div className="flex flex-wrap gap-x-6">
                <a href="/sabbatical" className={LINK}>Explore sabbatical planning →</a>
                <a href="/glossary" className={LINK}>Read the guides →</a>
              </div>
            </div>
          </div>
        </section>
      </Container>

      {/* The holidays ahead, set as a timetable rather than a wall of cards. */}
      <Container className="px-4 pt-24 sm:px-6 lg:pt-36">
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

          {validRange && holidays.length > 0 && <div className="mt-8 min-w-0 rounded-[4px] bg-surface p-4 sm:p-5">
            <YearStrip today={rangeStart} stripEnd={rangeEnd} holidays={holidays} bridgeableHolidayDates={bridgeableDates} />
            <p className="mt-2 text-sm text-muted">Tall marked ticks are holidays that already make a long weekend or sit one PTO day from one. Shaded stretches run eight days or more without a holiday.</p>
          </div>}

          {upcoming.length > 0 ? <ol aria-label={`All ${upcoming.length} upcoming holidays`} className="mt-8 list-none p-0">
            {upcoming.map((entry) => {
              const bridge = bridges.find((candidate) => candidate.combined.start === entry.run.start || candidate.combined.end === entry.run.end);
              return <li key={entry.holiday.date} className="grid grid-cols-[4.75rem_minmax(0,1fr)] items-baseline gap-x-4 rounded-[3px] px-3 py-4 odd:bg-surface sm:px-5 sm:grid-cols-[7rem_minmax(0,1fr)_auto] sm:gap-x-8">
                <p className="text-h2 font-bold type-condensed text-ink tabular-nums">{formatShort(entry.holiday.date)}</p>
                <div className="min-w-0">
                  <p className="text-lg font-semibold text-ink">{entry.holiday.name}</p>
                  <p className="text-sm text-muted">{entry.weekday}, {formatLong(entry.holiday.date)}{entry.isObserved ? ' · observed' : ''} · {entry.runLength >= 3 ? <span className="mark text-ink">{entry.runLength} calendar days off</span> : `${plural(entry.runLength, 'calendar day')} off`} before PTO</p>
                </div>
                <a href={landingPlanHref(state, bridge?.bridgeDate, employer)} className={`${LINK} col-start-2 text-sm sm:col-start-3 sm:justify-self-end`}>{bridge ? `Connect a ${runLength(bridge.combined)}-day break` : 'Plan around this holiday'} →</a>
              </li>;
            })}
          </ol> : <p className="mt-8 rounded-[4px] bg-surface p-5 text-base text-muted">{loading ? 'Updating public holidays…' : calendar.degraded ? 'Holiday data could not be loaded. You can still use the planner with your own holiday dates.' : 'No upcoming observed holidays in this range. The planner can still help you make more of your weekends.'}</p>}
        </section>
      </Container>

      {/* How it works: a field one tone down, a plain statement, three facts. */}
      <section aria-labelledby="landing-how" className="mt-24 bg-surface-alt lg:mt-36">
        <Container className="grid gap-x-16 gap-y-10 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:py-24">
          <div className="min-w-0">
            <h2 id="landing-how" className="max-w-[12ch] text-display-sm type-display text-ink">Same inputs, same plan.</h2>
            <p className="mt-4 max-w-sm text-lg text-ink">Every setting lives in the link, so a plan reproduces exactly when you open it again or send it on.</p>
          </div>
          <div className="grid min-w-0 gap-x-10 gap-y-8 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <h3 className="text-h2 font-bold type-condensed text-ink">Real calendar, clear calculations.</h3>
              <p className="mt-2 max-w-2xl text-base text-ink">Our deterministic planner searches your dates, workweek, holidays, and PTO budget. Identical inputs produce the same plan.</p>
            </div>
            <div>
              <h3 className="text-h2 font-bold type-condensed text-ink">Your employer sets the rules.</h3>
              <p className="mt-2 text-base text-ink">Public holiday data comes from Nager.Date. We assume those days are observed; adjust them in the planner. Forecasts estimate the policy you enter.</p>
              <a className={LINK} href="/data-sources">About the data →</a>
            </div>
            <div>
              <h3 className="text-h2 font-bold type-condensed text-ink">Personal planning stays personal.</h3>
              <p className="mt-2 text-base text-ink">Employer preferences and request notes save in this browser. Planning links contain the settings you choose to share, so review them before sharing.</p>
              <a className={LINK} href="/privacy.html">Privacy details →</a>
            </div>
          </div>
        </Container>
      </section>

      {/* The close: the visitor's own numbers, and the way into the full planner. */}
      <Container className="px-4 pt-24 sm:px-6 lg:pt-32">
        <section aria-labelledby="landing-close" className="grid items-end gap-x-16 gap-y-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <div className="min-w-0">
            <h2 id="landing-close" className="max-w-[14ch] text-display-sm type-display text-ink">Put your days off on the calendar.</h2>
            <p className="mt-4 max-w-xl text-lg text-ink">{bestBreak
              ? <>This preview plans {used} of your {budget} PTO days across {plural(breakCount, 'break')}. The full planner lets you pin days, compare alternatives, and export the plan.</>
              : 'Start with a plan. Make it yours.'}</p>
          </div>
          <div className="flex min-w-0 flex-col items-start gap-3">
            <Button href={href}>Plan my time off →</Button>
            <div className="flex flex-wrap items-center gap-x-3">
              <Button variant="quiet" onClick={async () => { const copied = await copyText(new URL(href, window.location.origin).href); setCopyMessage(copied ? 'Link copied.' : 'Could not copy. You can copy the address from your browser.'); }}>Copy this PTO plan</Button>
              {copyMessage && <span role="status" className="text-sm text-muted">{copyMessage}</span>}
            </div>
          </div>
        </section>
      </Container>
    </main>
    <Footer />
  </div>;
}
