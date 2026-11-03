import { ExpirationGuard } from './ExpirationGuard';
import { DEFAULT_WORK_WEEK, type WorkWeek } from '@daysoff/engine/solver/types';
import { cloneElement, isValidElement, useEffect, useId, useMemo, useState, type ReactElement } from 'react';
import { SiteHeader } from './SiteHeader';
import { Footer } from './Footer';
import { Container } from './Container';
import { CountrySelect, SubdivisionSelect } from './CountrySelect';
import { PtoTracker } from './PtoTracker';
import { useRequestCalendar } from './useRequestCalendar';
import { todayISO } from './useAppState';
import { DateListEditor } from './DateListEditor';
import { Term } from './Term';
import { track } from './analytics';
import { geolocateCountry } from './geo';
import { forecastWithRequests } from '../personal/forecast';
import { initialPolicyPreferences, savePolicyPreferences, deletePolicyPreferences } from '../personal/policyPreferences';
import { QuickForecast } from './QuickForecast';
import { useRequestLedger } from './useRequestLedger';
import { generateAlerts } from '../policy/alerts';
import { generatePolicySummary } from '../policy/summary';
import { generateHRQuestions, hrQuestionsMessage } from '../policy/hrQuestions';
import { decodeParagraph, uniqueMatchedTerms } from '../policy/decode';
import type { AccrualMethod, CarryoverRule, PlanYear, TimeOffPolicy } from '../policy/model';
import { copyText } from './requestText';
import { writePolicyStateToURL, type PolicyURLState } from './policyUrlState';

const HORIZON_MONTHS = 18;

function addMonthsISO(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const totalMonths = (y * 12 + (m - 1)) + months;
  const ny = Math.floor(totalMonths / 12);
  const nm = (totalMonths % 12) + 1;
  const lastDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  const nd = Math.min(d, lastDay);
  return `${String(ny).padStart(4, '0')}-${String(nm).padStart(2, '0')}-${String(nd).padStart(2, '0')}`;
}

/**
 * Minimal field wrapper: label + a small <Term> hint next to the jargon word, per Stage 4A -
 * the hint renders as a plain "?" glyph (never repeating the term's full name after the
 * label already named it), so hovering/tapping it is how you get the definition.
 *
 * Stage 6 quality-pass fix: this used to be one <label> wrapping BOTH the hint text and the
 * actual input (the usual implicit label/control association this codebase uses elsewhere).
 * Found live in the browser that a Term nested inside that <label> stopped responding to
 * hover/click entirely - confirmed with a real pointer click/hover at its exact geometric
 * centre (elementFromPoint even resolved to the right node) while a direct .click() call on
 * the same node worked fine, and the identical <Term> OUTSIDE a <label> (MoreOptions.tsx's
 * "Accrual" heading) worked normally either way. Nesting an interactive control inside a
 * <label> that also wraps a different form control is a known cross-browser footgun for
 * exactly this reason, which is why label/control association here is now explicit
 * (useId + htmlFor) instead of implicit nesting - the Term hint is a plain sibling, never a
 * <label> descendant.
 */
function Field({ label, termId, children }: { label: string; termId?: string; children: ReactElement<{ id?: string }> }) {
  const id = useId();
  const child = isValidElement(children) ? cloneElement(children, { id }) : children;
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="flex items-center gap-1 font-medium text-slate-700">
        <label htmlFor={id}>{label}</label>
        {termId && <Term id={termId}>{'?'}</Term>}
      </span>
      {child}
    </div>
  );
}

const inputClass = 'h-9 rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400';

/** A small SVG line+area chart of the projected balance - greyscale-legible, no colour-only
 * encoding (the cap line is dashed, not just a different hue). */
function BalanceChart({ series, cap }: { series: { date: string; balance: number }[]; cap?: number }) {
  if (series.length === 0) return null;
  const WIDTH = 720;
  const HEIGHT = 160;
  const PAD = 24;
  const values = series.map((p) => p.balance);
  const max = Math.max(cap ?? 0, ...values, 1);
  const min = Math.min(0, ...values);
  const x = (i: number) => PAD + (i / (series.length - 1)) * (WIDTH - PAD * 2);
  const y = (v: number) => HEIGHT - PAD - ((v - min) / (max - min || 1)) * (HEIGHT - PAD * 2);
  const linePath = series.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.balance).toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label="Your PTO balance over the next year and a half">
      <line x1={PAD} y1={y(0)} x2={WIDTH - PAD} y2={y(0)} stroke="#e7e0d5" strokeWidth={1} />
      {cap !== undefined && (
        <>
          <line x1={PAD} y1={y(cap)} x2={WIDTH - PAD} y2={y(cap)} stroke="#8c8279" strokeWidth={1} strokeDasharray="4 3" />
          <text x={WIDTH - PAD} y={y(cap) - 4} textAnchor="end" className="fill-slate-400 text-[10px]">
            cap
          </text>
        </>
      )}
      <path d={linePath} fill="none" stroke="#292524" strokeWidth={2} />
    </svg>
  );
}

/** A small bar per PTO day analogue isn't applicable here (that's /sabbatical's marginal
 * chart) - this is the simple accrual/forfeiture timeline instead. */

export function Policy() {
  // Stage 4A follow-through (PR-C): every input below is read from the URL once on mount
  // (readPolicyStateFromURL) and written back on every change (the useEffect further down),
  // using the same conventions as src/ui/urlState.ts - a /policy link now reproduces the
  // exact policy described, same as every /pto link already does.
  const initial = useMemo(
    () => (typeof window === 'undefined' ? null : initialPolicyPreferences(window.location.search, geolocateCountry())),
    [],
  );
  const d = useMemo(() => initial ?? initialPolicyPreferences('', geolocateCountry()), [initial]);

  const [country, setCountry] = useState<string>(d.country);
  const [trackerWorkWeek, setTrackerWorkWeek] = useState<WorkWeek>(d.workWeek ?? DEFAULT_WORK_WEEK);
  const [trackerSubdivision, setTrackerSubdivision] = useState(d.subdivision);
  const [trackerAltFridayStart, setTrackerAltFridayStart] = useState(d.altFridayStart ?? '');
  const [trackerAltFridayEnabled, setTrackerAltFridayEnabled] = useState(Boolean(d.altFridayStart));

  const [accrualKind, setAccrualKind] = useState<AccrualMethod['kind']>(d.accrualKind);
  const [amount, setAmount] = useState(d.amount);
  const [frequency, setFrequency] = useState<'weekly' | 'biweekly' | 'semi-monthly' | 'monthly'>(d.frequency);
  const [payDateAnchor, setPayDateAnchor] = useState(d.payDateAnchor);
  const [grantDate, setGrantDate] = useState(d.grantDate);
  const [hourlyRate, setHourlyRate] = useState(d.hourlyRate);
  const [typicalWeeklyHours, setTypicalWeeklyHours] = useState(d.typicalWeeklyHours);
  const [expectedDaysPerYear, setExpectedDaysPerYear] = useState(d.expectedDaysPerYear);

  const [planYearKind, setPlanYearKind] = useState<PlanYear['kind']>(d.planYearKind);
  const [anniversaryStart, setAnniversaryStart] = useState(d.anniversaryStart);
  const [customResetDate, setCustomResetDate] = useState(d.customResetDate);

  const [accrualCapEnabled, setAccrualCapEnabled] = useState(d.accrualCapEnabled);
  const [accrualCap, setAccrualCap] = useState(d.accrualCap);

  const [carryoverMode, setCarryoverMode] = useState<CarryoverRule['mode']>(d.carryoverMode);
  const [carryoverCap, setCarryoverCap] = useState(d.carryoverCap);
  const [carryoverUseByEnabled, setCarryoverUseByEnabled] = useState(d.carryoverUseByEnabled);
  const [carryoverUseBy, setCarryoverUseBy] = useState(d.carryoverUseBy);

  const [waitingPeriodEnabled, setWaitingPeriodEnabled] = useState(d.waitingPeriodEnabled);
  const [waitingPeriodDays, setWaitingPeriodDays] = useState(d.waitingPeriodDays);

  const [negativeBalanceAllowance, setNegativeBalanceAllowance] = useState(d.negativeBalanceAllowance);
  const [payoutOnLeaving, setPayoutOnLeaving] = useState<TimeOffPolicy['payoutOnLeaving']>(d.payoutOnLeaving);

  const [currentBalance, setCurrentBalance] = useState(d.currentBalance);
  const [balanceAsOf, setBalanceAsOf] = useState(d.balanceAsOf);
  const [plannedDays, setPlannedDays] = useState<string[]>(d.plannedDays);
  const [currentCarriedBalance, setCurrentCarriedBalance] = useState(d.currentCarriedBalance ?? 0);
  const [forecastDate, setForecastDate] = useState(d.forecastDate ?? addMonthsISO(d.balanceAsOf, 3));
  const [saveMessage, setSaveMessage] = useState('');
  const ledger = useRequestLedger();

  const [unit, setUnit] = useState<'days' | 'hours'>(d.unit);
  const [hoursPerDay, setHoursPerDay] = useState(d.hoursPerDay);

  const [pasteOpen, setPasteOpen] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  const accrual: AccrualMethod = useMemo(() => {
    if (accrualKind === 'front-loaded') return { kind: 'front-loaded', amount, grantDate };
    if (accrualKind === 'per-pay-period') return { kind: 'per-pay-period', amount, frequency, payDateAnchor };
    if (accrualKind === 'per-hour-worked') return { kind: 'per-hour-worked', rate: hourlyRate, typicalWeeklyHours };
    return { kind: 'unlimited', expectedDaysPerYear };
  }, [accrualKind, amount, grantDate, frequency, payDateAnchor, hourlyRate, typicalWeeklyHours, expectedDaysPerYear]);

  const planYear: PlanYear = useMemo(() => {
    if (planYearKind === 'anniversary') return { kind: 'anniversary', startDate: anniversaryStart };
    if (planYearKind === 'custom') return { kind: 'custom', resetDate: customResetDate };
    return { kind: 'calendar' };
  }, [planYearKind, anniversaryStart, customResetDate]);

  const carryover: CarryoverRule = useMemo(
    () => ({
      mode: carryoverMode,
      cap: carryoverMode === 'capped' ? carryoverCap : undefined,
      useByDate: carryoverUseByEnabled ? carryoverUseBy : undefined,
    }),
    [carryoverMode, carryoverCap, carryoverUseByEnabled, carryoverUseBy],
  );

  const policy: TimeOffPolicy = useMemo(
    () => ({
      unit,
      hoursPerDay,
      accrual,
      planYear,
      accrualCap: accrualCapEnabled && accrualKind !== 'unlimited' ? accrualCap : undefined,
      carryover,
      waitingPeriodDays: waitingPeriodEnabled ? waitingPeriodDays : undefined,
      negativeBalanceAllowance,
      payoutOnLeaving,
      currentBalance,
      currentCarriedBalance,
      balanceAsOf,
      plannedDays,
    }),
    [
      unit, hoursPerDay, accrual, planYear, accrualCapEnabled, accrualKind, accrualCap, carryover,
      waitingPeriodEnabled, waitingPeriodDays, negativeBalanceAllowance, payoutOnLeaving, currentBalance, currentCarriedBalance,
      balanceAsOf, plannedDays,
    ],
  );

  const currentPolicyURLState: PolicyURLState = useMemo(() => ({
    unit, hoursPerDay, accrualKind, amount, frequency, payDateAnchor, grantDate, hourlyRate,
    typicalWeeklyHours, expectedDaysPerYear, planYearKind, anniversaryStart, customResetDate,
    accrualCapEnabled, accrualCap, carryoverMode, carryoverCap, carryoverUseByEnabled,
    carryoverUseBy, waitingPeriodEnabled, waitingPeriodDays, negativeBalanceAllowance,
    payoutOnLeaving, currentBalance, currentCarriedBalance, balanceAsOf, plannedDays, country, forecastDate,
    workWeek: trackerWorkWeek, subdivision: trackerSubdivision, altFridayStart: trackerAltFridayEnabled ? trackerAltFridayStart : undefined,
  }), [unit, hoursPerDay, accrualKind, amount, frequency, payDateAnchor, grantDate, hourlyRate,
    typicalWeeklyHours, expectedDaysPerYear, planYearKind, anniversaryStart, customResetDate,
    accrualCapEnabled, accrualCap, carryoverMode, carryoverCap, carryoverUseByEnabled,
    carryoverUseBy, waitingPeriodEnabled, waitingPeriodDays, negativeBalanceAllowance,
    payoutOnLeaving, currentBalance, currentCarriedBalance, balanceAsOf, plannedDays, country, forecastDate,
    trackerWorkWeek, trackerSubdivision, trackerAltFridayEnabled, trackerAltFridayStart]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    writePolicyStateToURL(url.searchParams, currentPolicyURLState);
    window.history.replaceState(null, '', url);
  }, [currentPolicyURLState]);

  const horizonEnd = useMemo(() => addMonthsISO(balanceAsOf, HORIZON_MONTHS), [balanceAsOf]);
  const projection = useMemo(() => forecastWithRequests(policy, horizonEnd, ledger.requests), [policy, horizonEnd, ledger.requests]);
  const selectedForecast = useMemo(() => forecastWithRequests(policy, forecastDate, ledger.requests), [policy, forecastDate, ledger.requests]);
  const series = projection?.confirmed.series ?? [];
  const events = projection?.confirmed.events ?? [];
  const summary = useMemo(() => generatePolicySummary(policy), [policy]);
  const alerts = useMemo(() => generateAlerts(policy, events, balanceAsOf, country), [policy, events, balanceAsOf, country]);
  const hrQuestions = useMemo(() => generateHRQuestions(policy), [policy]);

  const [visitDate] = useState(todayISO);
  const visitYear = Number(visitDate.slice(0, 4));
  const calendarStart = Number(forecastDate.slice(0, 4)) - visitYear >= 10 ? visitDate : `${visitYear}-01-01`;
  const calendarEnd = forecastDate > `${visitYear + 2}-12-31` ? forecastDate : `${visitYear + 2}-12-31`;
  const trackerCalendar = useRequestCalendar({ country, subdivision: trackerSubdivision, rangeStart: calendarStart, rangeEnd: calendarEnd, workWeek: trackerWorkWeek, altFridayStart: trackerAltFridayEnabled ? trackerAltFridayStart : undefined });

  const decoded = useMemo(() => decodeParagraph(pastedText), [pastedText]);
  const decodedTerms = useMemo(() => uniqueMatchedTerms(decoded), [decoded]);

  return (
    <div className="min-h-screen bg-page">
      <SiteHeader active="policy" />
      <main id="main-content" tabIndex={-1}>
        <Container className="px-4 py-10">
          <h1 className="text-3xl font-bold text-slate-900">Your PTO balance and policy</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Start with your current balance and how you earn PTO. Your forecast updates as you type. Add the policy details you know in Advanced options.
          </p>

          <section id="balance" aria-labelledby="quick-balance-heading" className="mt-8 grid items-start gap-6 lg:grid-cols-2">
            <div className="min-w-0 rounded-2xl border border-line bg-surface p-5 sm:p-6">
              <h2 id="quick-balance-heading" className="text-xl font-semibold text-ink">Quick balance forecast</h2>
              <p className="mt-1 text-sm text-muted">Use your actual balance and employer rules. Full carryover at reset is assumed until you choose another rule.</p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label={`Current PTO balance (${unit})`}><input type="number" step="any" value={currentBalance} onChange={event => setCurrentBalance(Number(event.target.value))} className={inputClass} /></Field>
                <Field label="Balance as-of date"><input type="date" value={balanceAsOf} onChange={event => setBalanceAsOf(event.target.value)} className={inputClass} /></Field>
                <Field label="How PTO accrues"><select value={accrualKind} onChange={event => setAccrualKind(event.target.value as AccrualMethod['kind'])} className={inputClass}><option value="front-loaded">Granted all at once</option><option value="per-pay-period">Each pay period</option><option value="per-hour-worked">For each hour worked</option><option value="unlimited">Unlimited PTO</option></select></Field>
                <Field label="Balance unit"><select value={unit} onChange={event => setUnit(event.target.value as 'days' | 'hours')} className={inputClass}><option value="days">Days</option><option value="hours">Hours</option></select></Field>
                {(accrualKind === 'per-pay-period' || accrualKind === 'front-loaded') && <Field label={`${unit === 'hours' ? 'Hours' : 'Days'} earned each ${accrualKind === 'front-loaded' ? 'grant' : 'pay period'}`}><input type="number" min={0} step="any" value={amount} onChange={event => setAmount(Number(event.target.value))} className={inputClass} /></Field>}
                {accrualKind === 'per-pay-period' && <><Field label="Pay frequency"><select value={frequency} onChange={event => setFrequency(event.target.value as typeof frequency)} className={inputClass}><option value="weekly">Weekly</option><option value="biweekly">Every two weeks</option><option value="semi-monthly">Twice a month</option><option value="monthly">Monthly</option></select></Field><Field label="Known pay date"><input type="date" value={payDateAnchor} onChange={event => setPayDateAnchor(event.target.value)} className={inputClass} /></Field></>}
                {accrualKind === 'front-loaded' && <Field label="Annual grant date"><input type="date" value={grantDate} onChange={event => setGrantDate(event.target.value)} className={inputClass} /></Field>}
                {accrualKind === 'per-hour-worked' && <><Field label="Hours earned per hour worked"><input type="number" min={0} step="any" value={hourlyRate} onChange={event => setHourlyRate(Number(event.target.value))} className={inputClass} /></Field><Field label="Typical hours worked each week"><input type="number" min={0} step="any" value={typicalWeeklyHours} onChange={event => setTypicalWeeklyHours(Number(event.target.value))} className={inputClass} /></Field></>}
                {(unit === 'hours' || accrualKind === 'per-hour-worked') && <Field label="Hours per working day for conversion"><input type="number" min={0.25} step="any" value={hoursPerDay} onChange={event => setHoursPerDay(Number(event.target.value))} className={inputClass} /></Field>}
                {accrualKind !== 'unlimited' && <Field label="Expiry and carryover"><select value={carryoverMode} onChange={event => setCarryoverMode(event.target.value as CarryoverRule['mode'])} className={inputClass}><option value="all">Full carryover at reset</option><option value="none">Use it or lose it at reset</option><option value="capped">Limited carryover at reset</option></select></Field>}
                {accrualKind !== 'unlimited' && carryoverMode !== 'all' && <Field label="Reset date (new plan year begins)"><input type="date" value={planYearKind === 'calendar' ? `${Number(balanceAsOf.slice(0, 4)) + 1}-01-01` : planYearKind === 'anniversary' ? anniversaryStart : customResetDate} onChange={event => { setPlanYearKind('custom'); setCustomResetDate(event.target.value); }} className={inputClass} /></Field>}
                {accrualKind !== 'unlimited' && carryoverMode === 'capped' && <Field label={`Carryover limit (${unit})`}><input type="number" min={0} step="any" value={carryoverCap} onChange={event => setCarryoverCap(Number(event.target.value))} className={inputClass} /></Field>}
              </div>
              <div className="mt-5 flex flex-wrap gap-4 text-sm">
                <button type="button" className="min-h-11 font-medium text-accent-ink underline" onClick={() => { const params = new URLSearchParams(); writePolicyStateToURL(params, currentPolicyURLState); setSaveMessage(savePolicyPreferences(params.toString()) ? 'Policy saved in this browser.' : 'Browser storage is unavailable. Your forecast still works from this link.'); }}>Save policy in this browser</button>
                <button type="button" className="min-h-11 text-muted underline" onClick={() => setSaveMessage(deletePolicyPreferences() ? 'Saved policy deleted. Your current inputs stay on this page.' : 'Browser storage is unavailable.')}>Delete saved policy</button>
              </div>
              {saveMessage && <p role="status" className="mt-2 text-sm text-muted">{saveMessage}</p>}
            </div>
            <QuickForecast policy={policy} requests={ledger.requests} forecastDate={forecastDate} onForecastDateChange={setForecastDate} onForecastUsed={() => track('balance_forecast_used')} />
          </section>
          <div id="expiration" className="mt-8 scroll-mt-24"><ExpirationGuard policy={policy} country={country} requests={ledger.requests} today={visitDate} onAlertViewed={() => track('expiration_alert_viewed')} onAlertAction={() => track('expiration_alert_action_taken')} /></div>
          <div id="requests" className="mt-8 scroll-mt-24 space-y-4">
            <details className="rounded-xl border border-line bg-surface p-4">
              <summary className="cursor-pointer font-medium text-ink">My request calendar and workweek</summary>
              <div className="mt-4 flex flex-wrap items-start gap-4">
                <CountrySelect country={country} onChangeCountry={code => { setCountry(code); setTrackerSubdivision(undefined); }} />
                <SubdivisionSelect subdivisions={trackerCalendar.subdivisions} subdivision={trackerSubdivision} onChangeSubdivision={setTrackerSubdivision} />
                <fieldset><legend className="text-sm font-medium text-ink">Working days</legend><div className="mt-2 flex flex-wrap gap-2">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((name, index) => <label key={name} className="flex min-h-11 items-center gap-1 text-sm text-muted"><input type="checkbox" checked={trackerWorkWeek[index]} onChange={event => setTrackerWorkWeek(previous => previous.map((day, i) => i === index ? event.target.checked : day) as WorkWeek)} />{name}</label>)}</div></fieldset>
              </div>
              <label className="mt-4 flex min-h-11 items-center gap-2 text-sm text-muted"><input type="checkbox" checked={trackerAltFridayEnabled} onChange={event => setTrackerAltFridayEnabled(event.target.checked)} />Every other Friday off</label>
              {trackerAltFridayEnabled && <label className="block text-sm text-muted">First non-working Friday<input type="date" value={trackerAltFridayStart} onChange={event => setTrackerAltFridayStart(event.target.value)} className={`${inputClass} mt-2 block`} /></label>}
              <p className="mt-3 text-xs text-muted">Uses your saved employer holidays for this country and region. Adjust those in <a className="underline" href="/pto">the PTO planner</a>. Change the forecast date above to cover a later request.</p>
            </details>
            <PtoTracker today={visitDate} ledger={ledger} calendar={trackerCalendar.calendar} calendarReady={!trackerCalendar.loading && !trackerCalendar.degraded} calendarNotice={trackerCalendar.loading ? 'Loading your employer calendar…' : trackerCalendar.degraded ? 'Holiday data or a calendar input is unavailable. Check the calendar settings before adding or changing request dates.' : `The remaining balance is projected for ${forecastDate}.`} remainingPto={unit === 'days' ? selectedForecast?.confirmed.balance ?? undefined : selectedForecast?.confirmed.balance === null || selectedForecast?.confirmed.balance === undefined ? undefined : selectedForecast.confirmed.balance / hoursPerDay} onTrackingStarted={() => track('request_tracking_started')} onStatusChanged={() => track('request_status_updated')} />
          </div>
          <details className="mt-8 rounded-2xl border border-line bg-surface p-5 sm:p-6">
            <summary className="cursor-pointer text-lg font-semibold text-ink">Advanced policy options and explanation</summary>
          <div className="mt-8 grid gap-10 lg:grid-cols-5">
            {/* Inputs */}
            <div className="flex flex-col gap-6 lg:col-span-2">
              <div>
                <button
                  type="button"
                  onClick={() => setPasteOpen((o) => !o)}
                  className="text-sm font-medium text-slate-700 underline"
                >
                  {pasteOpen ? 'Hide' : 'Paste your handbook text'}
                </button>
                {pasteOpen && (
                  <div className="mt-2">
                    <textarea
                      aria-label="Handbook paragraph for glossary matching"
                      value={pastedText}
                      onChange={(e) => {
                        setPastedText(e.target.value);
                        if (e.target.value && decodeParagraph(e.target.value).length > 0) track('paragraph_decoded');
                      }}
                      rows={5}
                      placeholder="Paste a paragraph from your handbook — nothing here is stored or put in the URL."
                      className="w-full rounded-md border border-slate-300 p-2 text-sm"
                    />
                    <p className="mt-1 text-xs text-slate-400">
                      Never stored, never in the URL — cleared on reload. We only match it against our own glossary.
                    </p>
                    {decodedTerms.length > 0 && (
                      <p className="mt-2 text-sm text-slate-700">
                        We spotted {decodedTerms.map((t) => `"${t.term}"`).join(', ')}. Set those below ↓
                      </p>
                    )}
                  </div>
                )}
              </div>

              <Field label="How you get days">
                <select value={accrualKind} onChange={(e) => setAccrualKind(e.target.value as AccrualMethod['kind'])} className={inputClass}>
                  <option value="front-loaded">Front-loaded</option>
                  <option value="per-pay-period">Per pay period</option>
                  <option value="per-hour-worked">Per hour worked</option>
                  <option value="unlimited">Unlimited</option>
                </select>
              </Field>

              {accrualKind === 'front-loaded' && (
                <>
                  <Field label="Days granted" termId="front-loaded">
                    <input type="number" min={0} step={0.5} value={amount} onChange={(e) => setAmount(Number(e.target.value))} className={inputClass} />
                  </Field>
                  <Field label="Grant date">
                    <input type="date" value={grantDate} onChange={(e) => setGrantDate(e.target.value)} className={inputClass} />
                  </Field>
                </>
              )}
              {accrualKind === 'per-pay-period' && (
                <>
                  <Field label={`Amount per pay period (${unit})`} termId="accrual-rate">
                    <input type="number" min={0} step={0.01} value={amount} onChange={(e) => setAmount(Number(e.target.value))} className={inputClass} />
                  </Field>
                  <Field label="Pay frequency" termId="pay-frequency">
                    <select value={frequency} onChange={(e) => setFrequency(e.target.value as typeof frequency)} className={inputClass}>
                      <option value="weekly">Weekly</option>
                      <option value="biweekly">Biweekly</option>
                      <option value="semi-monthly">Semi-monthly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </Field>
                  <Field label="First pay date">
                    <input type="date" value={payDateAnchor} onChange={(e) => setPayDateAnchor(e.target.value)} className={inputClass} />
                  </Field>
                </>
              )}
              {accrualKind === 'per-hour-worked' && (
                <>
                  <Field label="Rate per hour worked">
                    <input type="number" min={0} step={0.001} value={hourlyRate} onChange={(e) => setHourlyRate(Number(e.target.value))} className={inputClass} />
                  </Field>
                  <Field label="Typical hours worked per week">
                    <input type="number" min={0} step={1} value={typicalWeeklyHours} onChange={(e) => setTypicalWeeklyHours(Number(e.target.value))} className={inputClass} />
                  </Field>
                </>
              )}
              {accrualKind === 'unlimited' && (
                <Field label="Days you expect to actually take this year" termId="unlimited-pto">
                  <input type="number" min={0} step={1} value={expectedDaysPerYear} onChange={(e) => setExpectedDaysPerYear(Number(e.target.value))} className={inputClass} />
                </Field>
              )}

              <Field label="Unit">
                <select value={unit} onChange={(e) => setUnit(e.target.value as 'days' | 'hours')} className={inputClass}>
                  <option value="days">Days</option>
                  <option value="hours">Hours</option>
                </select>
              </Field>
              {(unit === 'hours' || accrualKind === 'per-hour-worked') && (
                <Field label="Hours in a full working day">
                  <input type="number" min={1} step={0.5} value={hoursPerDay} onChange={(e) => setHoursPerDay(Number(e.target.value))} className={inputClass} />
                </Field>
              )}

              <Field label="Plan year" termId="plan-year">
                <select value={planYearKind} onChange={(e) => setPlanYearKind(e.target.value as PlanYear['kind'])} className={inputClass}>
                  <option value="calendar">Calendar year (resets Jan 1)</option>
                  <option value="anniversary">My start-date anniversary</option>
                  <option value="custom">A specific date</option>
                </select>
              </Field>
              {planYearKind === 'anniversary' && (
                <Field label="Start date">
                  <input type="date" value={anniversaryStart} onChange={(e) => setAnniversaryStart(e.target.value)} className={inputClass} />
                </Field>
              )}
              {planYearKind === 'custom' && (
                <Field label="Reset date">
                  <input type="date" value={customResetDate} onChange={(e) => setCustomResetDate(e.target.value)} className={inputClass} />
                </Field>
              )}

              {accrualKind !== 'unlimited' && (
                <div className="flex items-center gap-1 text-sm text-slate-700">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={accrualCapEnabled} onChange={(e) => setAccrualCapEnabled(e.target.checked)} />
                    Has an accrual cap
                  </label>
                  <Term id="accrual-cap">{'?'}</Term>
                </div>
              )}
              {accrualCapEnabled && accrualKind !== 'unlimited' && (
                <Field label={`Cap (${unit})`}>
                  <input type="number" min={0} step={0.5} value={accrualCap} onChange={(e) => setAccrualCap(Number(e.target.value))} className={inputClass} />
                </Field>
              )}

              <Field label="Carryover" termId="carryover">
                <select value={carryoverMode} onChange={(e) => setCarryoverMode(e.target.value as CarryoverRule['mode'])} className={inputClass}>
                  <option value="none">None (use-it-or-lose-it)</option>
                  <option value="capped">Up to a limit</option>
                  <option value="all">Everything carries over</option>
                </select>
              </Field>
              {carryoverMode === 'capped' && (
                <Field label={`Carryover limit (${unit})`}>
                  <input type="number" min={0} step={0.5} value={carryoverCap} onChange={(e) => setCarryoverCap(Number(e.target.value))} className={inputClass} />
                </Field>
              )}
              {carryoverMode !== 'none' && (
                <>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={carryoverUseByEnabled} onChange={(e) => setCarryoverUseByEnabled(e.target.checked)} />
                    Carried days have their own deadline
                  </label>
                  {carryoverUseByEnabled && (
                    <Field label="Use carried days by">
                      <input type="date" value={carryoverUseBy} onChange={(e) => setCarryoverUseBy(e.target.value)} className={inputClass} />
                    </Field>
                  )}
                </>
              )}

              <div className="flex items-center gap-1 text-sm text-slate-700">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={waitingPeriodEnabled} onChange={(e) => setWaitingPeriodEnabled(e.target.checked)} />
                  There&apos;s a waiting period
                </label>
                <Term id="waiting-period">{'?'}</Term>
              </div>
              {waitingPeriodEnabled && (
                <Field label="Waiting period (days)">
                  <input type="number" min={0} step={1} value={waitingPeriodDays} onChange={(e) => setWaitingPeriodDays(Number(e.target.value))} className={inputClass} />
                </Field>
              )}

              <Field label="Can your balance go negative?" termId="negative-balance">
                <input type="number" min={0} step={0.5} value={negativeBalanceAllowance} onChange={(e) => setNegativeBalanceAllowance(Number(e.target.value))} className={inputClass} />
              </Field>

              <Field label="If you leave, is unused PTO paid out?" termId="payout">
                <select value={payoutOnLeaving} onChange={(e) => setPayoutOnLeaving(e.target.value as TimeOffPolicy['payoutOnLeaving'])} className={inputClass}>
                  <option value="pays">Pays it out</option>
                  <option value="doesnt">Doesn't</option>
                  <option value="not-sure">Not sure</option>
                </select>
              </Field>

              <Field label="Current balance">
                <input type="number" min={negativeBalanceAllowance * -1} step={0.5} value={currentBalance} onChange={(e) => setCurrentBalance(Number(e.target.value))} className={inputClass} />
              </Field>
              <Field label={`Already-carried PTO included in your balance (${unit})`}>
                <input type="number" min={0} max={Math.max(0, currentBalance)} step="any" value={currentCarriedBalance} onChange={event => setCurrentCarriedBalance(Number(event.target.value))} className={inputClass} />
              </Field>
              <p className="text-xs text-muted">Only enter the carried portion if you know it, and enter its separate use-by date above. It is part of your total balance.</p>
              <Field label="As of">
                <input type="date" value={balanceAsOf} onChange={(e) => setBalanceAsOf(e.target.value)} className={inputClass} />
              </Field>

              <Field label="Country for holiday calculations">
                <CountrySelect country={country} onChangeCountry={setCountry} />
              </Field>

              <div>
                <p className="mb-1 text-sm font-medium text-slate-700">Days already planned</p>
                <DateListEditor
                  dates={plannedDays}
                  onAdd={(d) => setPlannedDays((prev) => [...prev, d].sort())}
                  onRemove={(d) => setPlannedDays((prev) => prev.filter((x) => x !== d))}
                />
              </div>
            </div>

            {/* Output */}
            <div className="flex flex-col gap-6 lg:col-span-3">
              <section>
                <h2 className="mb-2 text-sm font-semibold text-slate-500">Your policy, in plain English</h2>
                <div className="flex flex-col gap-1.5 text-base text-slate-800">
                  {summary.map((s, i) => (
                    <p key={i}>{s}</p>
                  ))}
                </div>
              </section>

              {series.length > 0 ? (
                <section>
                  <h2 className="mb-2 text-sm font-semibold text-slate-500">What it means for you</h2>
                  <BalanceChart series={series} cap={policy.accrualCap} />
                </section>
              ) : accrualKind === 'unlimited' ? (
                <section className="rounded-md bg-slate-50 p-4 text-sm text-slate-600">
                  No balance to chart — unlimited PTO has no cap and nothing to run out of.{' '}
                  <a
                    href={`/pto?c=${country}&b=${expectedDaysPerYear}`}
                    className="font-medium text-slate-900 underline"
                    onClick={() => track('policy_alert_action_clicked')}
                  >
                    Plan your {expectedDaysPerYear} days →
                  </a>
                </section>
              ) : <p role="status" className="text-sm text-muted">Enter valid policy amounts and dates to see the projection.</p>}

              <section>
                <h2 className="mb-2 text-sm font-semibold text-slate-500">Alerts</h2>
                {!projection ? <p role="status" className="text-sm text-muted">Check the policy inputs before relying on expiration or cap warnings.</p> : alerts.length === 0 ? (
                  <p className="text-sm text-slate-500">Nothing to flag — no forfeiture, cap, or deadline risk in the next 18 months.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {alerts.map((a) => (
                      <li key={a.id} className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        <p>{a.text}</p>
                        {a.daysAtStake > 0 && (
                          <a
                            href="#expiration"
                            className="mt-1 inline-block font-medium underline"
                            onClick={() => track('policy_alert_action_clicked')}
                          >
                            Review warnings and plans above →
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h2 className="mb-2 text-sm font-semibold text-slate-500">Questions to ask HR</h2>
                {hrQuestions.length === 0 ? (
                  <p className="text-sm text-slate-500">Nothing unclear in what you've entered.</p>
                ) : (
                  <>
                    <ul className="flex flex-col gap-1 text-sm text-slate-700">
                      {hrQuestions.map((q) => (
                        <li key={q}>• {q}</li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await copyText(hrQuestionsMessage(hrQuestions));
                        setCopyMessage(ok ? 'Copied' : "Couldn't copy — try again");
                        track('policy_questions_copied');
                        setTimeout(() => setCopyMessage(null), 2000);
                      }}
                      className="mt-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {copyMessage ?? 'Copy questions'}
                    </button>
                  </>
                )}
              </section>

              <PolicyFAQ />
            </div>
          </div>
          </details>
        </Container>
      </main>
      <Footer />
    </div>
  );
}

const POLICY_FAQ = [
  {
    question: 'Is this legal advice?',
    answer:
      "No. This describes what your own numbers show, and what common terms mean. It never tells you what you're legally entitled to - for that, your state or country's labor department is the right source.",
  },
  {
    question: 'Why do you ask for my current balance instead of just my hire date?',
    answer:
      "Your actual balance, as of a date you know, is more reliable than re-deriving it from scratch - handbooks change, and small discrepancies compound over a year or more.",
  },
  {
    question: "What if I don't know some of these numbers?",
    answer: 'Leave them blank or pick "not sure" - those show up under Questions to ask HR instead of being guessed at.',
  },
];

function PolicyFAQ() {
  return (
    <section id="policy-questions" className="border-t border-slate-100 pt-6 text-sm text-slate-500">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">Questions</h2>
      <div className="flex flex-col divide-y divide-slate-100">
        {POLICY_FAQ.map((item) => (
          <details key={item.question} className="py-3">
            <summary className="cursor-pointer font-medium text-slate-700">{item.question}</summary>
            <p className="mt-2">{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
