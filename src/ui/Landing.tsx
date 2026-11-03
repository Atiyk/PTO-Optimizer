import { getConsumerHolidaysWithStatus as getHolidaysWithStatus } from '../personal/consumerHolidays';
import { useEffect, useMemo, useRef, useState } from 'react';
import { COUNTRIES } from '@daysoff/engine/data/countries';
import { getPreloadedHolidays, type Holiday } from '@daysoff/engine/data/holidays';
import { addDays, mondayIndexedDow } from '@daysoff/engine/solver/dateUtils';
import { DEFAULT_WORK_WEEK, type Break } from '@daysoff/engine/solver/types';
import { formatLong } from '@daysoff/engine/calendar/dateFormat';
import { weekdayName } from '@daysoff/engine/calendar/requestDeadline';
import { SiteHeader } from './SiteHeader';
import { Footer } from './Footer';
import { Container } from './Container';
import { Card } from './Card';
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

const FIELD = 'h-11 w-full min-w-0 rounded-lg border border-line-strong bg-surface px-3 text-base text-ink';

/** Uses the planner's day categories, with text as well as colour. */
function MiniBreakStrip({ brk, holidaySet }: { brk: Break; holidaySet: ReadonlySet<string> }) {
  return <div className="flex flex-wrap gap-1.5" aria-label="Days in this recommended break">
    {brk.days.map((date) => {
      const holiday = holidaySet.has(date);
      const pto = !holiday && mondayIndexedDow(date) < 5;
      const category = pto ? 'PTO' : holiday ? 'Holiday' : 'Weekend';
      return <span key={date} title={`${formatLong(date)}: ${category}`} className={`flex h-11 w-9 flex-col items-center justify-center rounded-md border text-xs tabular-nums ${pto ? 'border-accent-hover bg-accent text-white' : 'border-line bg-surface-alt text-ink'}`}>
        <span className="text-[10px]">{pto ? 'PTO' : holiday ? '●' : weekdayName(date).slice(0, 2)}</span>
        <span className="font-semibold">{Number(date.slice(8))}</span>
        <span className="sr-only">{formatLong(date)}, {category}</span>
      </span>;
    })}
  </div>;
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
  const plan = useMemo(() => validRange && !loading ? solveConsumer({ offDays: [...holidaySet], rangeStart, rangeEnd, budget, country, workWeek: DEFAULT_WORK_WEEK }, { minimumBreakDays: 3, style: 'balanced' }) : null, [validRange, loading, holidaySet, rangeStart, rangeEnd, budget, country]);
  const bestBreak = useMemo(() => plan?.result.primary.slice().sort((a, b) => b.totalDaysOff - a.totalDaysOff || b.multiplier - a.multiplier || a.start.localeCompare(b.start))[0], [plan]);
  const used = plan?.result.primary.reduce((total, brk) => total + brk.ptoCost, 0) ?? 0;
  const periodStart = rangeStart > today ? addDays(rangeStart, -1) : today;
  const upcoming = useMemo(() => validRange ? remainingHolidays(periodStart, rangeEnd, holidays) : [], [validRange, periodStart, rangeEnd, holidays]);
  const next = useMemo(() => validRange ? nextHoliday(periodStart, rangeEnd, holidays) : undefined, [validRange, periodStart, rangeEnd, holidays]);
  const bridges = useMemo(() => validRange ? findBridges(periodStart, rangeEnd, holidaySet) : [], [validRange, periodStart, rangeEnd, holidaySet]);
  const bridgeableDates = useMemo(() => new Set(upcoming.filter((entry) => entry.isBridgeable || entry.runLength >= 3).map((entry) => entry.holiday.date)), [upcoming]);
  const href = validRange ? landingPlanHref(state, undefined, employer) : '/pto';

  return <div className="min-h-screen bg-page">
    <SiteHeader active="landing" />
    <main id="main-content" tabIndex={-1}><Container className="space-y-12 px-4 py-9 sm:px-6 sm:py-14 lg:space-y-16">
      <section className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-x-12 lg:gap-y-6" aria-labelledby="landing-heading">
        <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
          <p className="text-sm font-semibold text-accent-ink">Your time off, working harder.</p>
          <h1 id="landing-heading" className="max-w-2xl text-[2.25rem] font-bold leading-[1.1] tracking-tight text-ink sm:text-5xl lg:text-[3.5rem]">Make the most of every day off you’ve earned.</h1>
          <p className="max-w-xl text-lg leading-relaxed text-muted">Find longer breaks, plan around your company’s holidays, and never lose track of your PTO.</p>
          <p className="text-sm text-muted">Free to use. No account needed.</p>
        </div>
        <Card as="section" className="min-w-0 lg:mt-6" eyebrow="A real opportunity from your plan">
          <h2 className="text-xl font-semibold text-ink">Your recommended break</h2>
          {bestBreak ? <>
            <div className="my-5 flex flex-wrap items-end gap-x-6 gap-y-2">
              <p className="text-muted"><span className="block text-display-sm font-bold leading-none text-ink sm:text-display">{bestBreak.totalDaysOff}</span><span className="mt-2 block text-sm">calendar days off</span></p>
              <p className="pb-0.5 text-sm text-muted">using <strong className="text-2xl font-semibold text-accent-ink">{bestBreak.ptoCost}</strong> PTO day{bestBreak.ptoCost === 1 ? '' : 's'}</p>
            </div>
            <p className="mb-3 text-base font-semibold text-ink">{formatLong(bestBreak.start)} – {formatLong(bestBreak.end)}</p>
            <a href="#landing-budget-slider"
              className="mb-2 inline-flex min-h-11 items-center text-sm font-semibold text-accent-ink underline underline-offset-4 sm:hidden">
              Change PTO days in this preview
            </a>
            <div className="hidden sm:block">
              <MiniBreakStrip brk={bestBreak} holidaySet={holidaySet} />
            </div>
            <details data-testid="home-break-calendar" className="mt-3 rounded-lg border border-line bg-surface-alt sm:hidden">
              <summary className="flex min-h-11 cursor-pointer items-center px-3 py-2 text-sm font-semibold text-ink">
                View all {bestBreak.totalDaysOff} calendar days
              </summary>
              <div className="px-3 pb-3">
                <MiniBreakStrip brk={bestBreak} holidaySet={holidaySet} />
              </div>
            </details>
            <p className="mt-4 text-sm leading-relaxed text-muted">{breakReason(bestBreak, (date) => holidays.find((holiday) => holiday.date === date)?.name)}</p>
            <p className="mt-4 border-t border-line pt-4 text-sm text-muted">Full plan: <strong className="text-ink">{used} of {budget} PTO days</strong> across {plan?.result.primary.length} break{plan?.result.primary.length === 1 ? '' : 's'}.</p>
          </> : <p className="py-7 text-base leading-relaxed text-muted" role="status">{!validRange ? 'Your preview will appear once the planning dates are valid.' : loading ? 'Updating your holiday calendar…' : plan?.issue ?? (budget === 0 ? 'No PTO days allocated. You can still explore the holidays below.' : 'No qualifying break fits these dates and PTO days. Try a longer range or more available PTO.')}</p>}
          <p className="mt-4 text-xs leading-relaxed text-muted">Preview assumes a Monday–Friday workweek. {customizedHolidays ? 'Your saved employer holiday calendar is applied' : 'National public holidays are assumed to be observed by your employer'}{employer.custom.length > 0 ? ', including additional company days off' : ''}. Calendar days off include weekends, observed holidays, and PTO days.</p>
          {calendar.degraded && <p className="mt-2 text-xs text-accent-ink" role="status">Some holiday data is unavailable. This preview may miss public holidays.</p>}
          <a href={href} className="mt-3 inline-block py-1 text-sm font-semibold text-accent-ink underline underline-offset-4">Customize workweek and employer holidays →</a>
        </Card>
        <div className="flex min-w-0 flex-col gap-4 border-t border-line pt-5 lg:col-span-2">
          <div>
            <h2 className="text-base font-semibold text-ink">Make this preview yours</h2>
            <p className="mt-1 text-sm text-muted">Change your PTO days, country or dates. Your recommendation updates automatically.</p>
          </div>
          <div className="grid min-w-0 gap-4 lg:grid-cols-2 lg:items-start">
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <label htmlFor="landing-country" className="flex min-w-0 flex-col gap-1.5 text-sm font-medium text-muted">Country
              <select id="landing-country" className={FIELD} value={country} onChange={(event) => update({ country: event.target.value })}>{COUNTRIES.map((entry) => <option key={entry.code} value={entry.code}>{entry.name}</option>)}</select>
            </label>
            <label htmlFor="landing-budget" className="flex min-w-0 flex-col gap-1.5 text-sm font-medium text-muted">PTO days available
              <input id="landing-budget" type="number" inputMode="numeric" min={0} max={60} step={1} className={`${FIELD} font-semibold tabular-nums`} value={budget} onChange={(event) => update({ budget: Math.max(0, Math.min(60, Math.round(Number(event.target.value) || 0))) })} />
            </label>
            <div className="col-span-2 rounded-xl border border-line bg-surface p-3 sm:p-4">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="landing-budget-slider" className="text-sm font-semibold text-ink">Adjust PTO days</label>
                <span className="text-sm font-semibold tabular-nums text-accent-ink" aria-hidden="true">{budget} / 60</span>
              </div>
              <input
                id="landing-budget-slider"
                type="range" min={0} max={60} step={1} value={budget}
                aria-label="Adjust PTO days available"
                aria-valuetext={`${budget} PTO ${budget === 1 ? 'day' : 'days'} available`}
                className="mt-3 h-11 w-full cursor-pointer accent-[var(--accent)]"
                onChange={(event) => update({ budget: Number(event.target.value) })}
              />
              <p className="text-xs leading-5 text-muted">Drag or use the arrow keys to see your recommended break change live.</p>
            </div>
          </div>
          <fieldset className="min-w-0 rounded-xl border border-line bg-surface p-3 sm:p-4">
            <legend className="px-1 text-sm font-semibold text-ink">Planning dates</legend>
            <p className="mt-1 text-xs text-muted">{validRange ? `Preview: ${formatLong(rangeStart)} – ${formatLong(rangeEnd)}.` : 'Choose a valid range.'} Edit either date to update your plan live.</p>
            <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
              <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium text-ink">From
                <input type="date" className={FIELD} value={rangeStart} onChange={(event) => update({ rangeStart: event.target.value })} />
              </label>
              <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium text-ink">Through
                <input type="date" className={FIELD} value={rangeEnd} onChange={(event) => update({ rangeEnd: event.target.value })} />
              </label>
            </div>
            <p className="mt-2 text-xs text-muted">Choose any dates, up to two years. No extra steps or submission.</p>
          </fieldset>
          </div>
          {!validRange && <p role="alert" className="text-sm text-accent-ink">Choose valid start and end dates, with the end after the start and no more than two years apart.</p>}
          <div className="hidden lg:block"><Button href={href}>See the full plan →</Button></div>
        </div>
        <div className="lg:hidden"><Button href={href} className="w-full sm:w-auto">See the full plan →</Button></div>
      </section>

      <section aria-label="Your PTO value and next steps" className="space-y-6">
        <div aria-labelledby="landing-value">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent-ink">Value</p>
          <h2 id="landing-value" className="mt-2 text-h2 font-semibold text-ink">Make your PTO worth more time away.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">Your preview above connects the days you have with the holidays ahead. Change the inputs and see the effect immediately—no signup or guessing.</p>
        </div>
        <div aria-labelledby="landing-capabilities" className="border-t border-line pt-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent-ink">Act</p>
          <h2 id="landing-capabilities" className="mb-5 mt-2 text-h2 font-semibold text-ink">Take the next step with your plan.</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { title: 'Plan PTO', text: 'Find longer vacations and useful long weekends, around the dates that work for you.', href, action: 'Explore my plan' },
            { title: 'Track my PTO balance', text: 'See what you could have available by a future date, including planned leave.', href: '/policy#balance', action: 'Forecast my balance' },
            { title: 'Understand my policy', text: 'Make sense of accrual, carryover, and deadlines before your days slip away.', href: '/policy', action: 'Check my policy' },
          ].map((entry) => <Card key={entry.title} as="article" className="flex flex-col"><h3 className="text-lg font-semibold text-ink">{entry.title}</h3><p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{entry.text}</p><a className="mt-4 inline-block min-h-11 py-2.5 text-sm font-semibold text-accent-ink underline underline-offset-4" href={entry.href}>{entry.action} →</a></Card>)}
        </div>
        <p className="mt-4 text-sm text-muted">Planning something bigger? <a href="/sabbatical" className="font-medium text-accent-ink underline underline-offset-4">Explore sabbatical planning.</a></p>
        </div>
      </section>

      <section aria-labelledby="landing-holidays">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div><h2 id="landing-holidays" className="text-h2 font-semibold text-ink">Upcoming holiday opportunities</h2><p className="mt-2 text-sm text-muted">{customizedHolidays ? 'Your saved employer-observed calendar for this planning range.' : 'Public holidays in your selected country and planning dates.'}</p></div>
          {holidays.length > 0 && <Button variant="secondary" size="sm" onClick={() => downloadHolidaysICS(holidays)}>Download holidays (.ics)</Button>}
        </div>
        {next && <p className="mb-5 text-base text-muted">Next up: <strong className="text-ink">{next.holiday.name}</strong> on {formatLong(next.holiday.date)}.{next.bridge ? ` One PTO day can connect a ${runLength(next.bridge.combined)}-day break.` : next.runLength > 1 ? ` Already a ${next.runLength}-day break.` : ''}</p>}
        {upcoming.length > 0 ? <ul className="grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {upcoming.slice(0, 6).map((entry) => {
            const bridge = bridges.find((candidate) => candidate.combined.start === entry.run.start || candidate.combined.end === entry.run.end);
            return <li key={entry.holiday.date} className="rounded-xl border border-line bg-surface p-4"><p className="text-sm font-semibold text-ink">{entry.holiday.name}</p><p className="mt-1 text-sm text-muted">{entry.weekday}, {formatLong(entry.holiday.date)}{entry.isObserved ? ' · observed' : ''}</p><p className="mt-2 text-sm text-muted">{entry.runLength} calendar day{entry.runLength === 1 ? '' : 's'} off before PTO.</p><a href={landingPlanHref(state, bridge?.bridgeDate, employer)} className="mt-1 inline-block min-h-11 py-2.5 text-sm font-semibold text-accent-ink underline underline-offset-4">{bridge ? `Connect a ${runLength(bridge.combined)}-day break` : 'Plan around this holiday'} →</a></li>;
          })}
        </ul> : <p className="rounded-xl border border-line bg-surface p-5 text-sm text-muted">{loading ? 'Updating public holidays…' : calendar.degraded ? 'Holiday data could not be loaded. You can still use the planner with your own holiday dates.' : 'No upcoming observed holidays in this range. The planner can still help you make more of your weekends.'}</p>}
        {validRange && <details className="mt-5 rounded-xl border border-line bg-surface p-4"><summary className="cursor-pointer text-sm font-semibold text-ink">See the calendar and all {upcoming.length} upcoming holidays</summary><div className="mt-4"><YearStrip today={rangeStart} stripEnd={rangeEnd} holidays={holidays} bridgeableHolidayDates={bridgeableDates} /></div>{upcoming.length > 0 && <ul className="mt-4 divide-y divide-line text-sm">{upcoming.map((entry) => <li key={entry.holiday.date} className="flex flex-wrap justify-between gap-2 py-3"><span className="text-ink">{entry.holiday.name}</span><span className="text-muted">{formatLong(entry.holiday.date)}{entry.isObserved ? ' · observed' : ''}</span></li>)}</ul>}</details>}
      </section>

      <section className="grid gap-6 border-y border-line py-7 sm:grid-cols-3" aria-label="How Gapless works">
        <div><h2 className="text-base font-semibold text-ink">Real calendar, clear calculations.</h2><p className="mt-2 text-sm leading-relaxed text-muted">Our deterministic planner searches your dates, workweek, holidays, and PTO budget. Identical inputs produce the same plan.</p></div>
        <div><h2 className="text-base font-semibold text-ink">Your employer sets the rules.</h2><p className="mt-2 text-sm leading-relaxed text-muted">Public holiday data comes from Nager.Date. We assume those days are observed; adjust them in the planner. Forecasts estimate the policy you enter.</p><a className="mt-2 inline-block min-h-11 py-2.5 text-sm text-accent-ink underline underline-offset-4" href="/data-sources">About the data →</a></div>
        <div><h2 className="text-base font-semibold text-ink">Personal planning stays personal.</h2><p className="mt-2 text-sm leading-relaxed text-muted">Employer preferences and request notes save in this browser. Planning links contain the settings you choose to share, so review them before sharing.</p><a className="mt-2 inline-block min-h-11 py-2.5 text-sm text-accent-ink underline underline-offset-4" href="/privacy.html">Privacy details →</a></div>
      </section>
      <section className="flex flex-col items-start gap-4 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-h2 font-semibold text-ink">Put your days off on the calendar.</h2><p className="mt-2 text-base text-muted">Start with a plan. Make it yours.</p></div>
        <Button href={href} variant="secondary">Plan my time off →</Button>
      </section>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button type="button" className="min-h-11 py-2 text-accent-ink underline underline-offset-4" onClick={async () => { const copied = await copyText(new URL(href, window.location.origin).href); setCopyMessage(copied ? 'Link copied.' : 'Could not copy. You can copy the address from your browser.'); }}>Copy this PTO plan</button>
        {copyMessage && <span role="status" className="text-muted">{copyMessage}</span>}
      </div>
    </Container></main>
    <Footer />
  </div>;
}
