import { ExpirationGuard } from './ExpirationGuard';
import { DeparturePayoutEstimator } from './DeparturePayoutEstimator';
import { DEFAULT_WORK_WEEK, type WorkWeek } from '@daysoff/engine/solver/types';
import { cloneElement, isValidElement, useEffect, useId, useMemo, useState, type ReactElement } from 'react';
import { SiteHeader } from './SiteHeader';
import { Footer } from './Footer';
import { Container } from './Container';
import { Button } from './Button';
import { CountrySelect, SubdivisionSelect } from './CountrySelect';
import { PtoTracker } from './PtoTracker';
import { useRequestCalendar } from './useRequestCalendar';
import { useTodayISO } from './useTodayISO';
import { addMonthsClamped } from './forecastPresets';
import { DateListEditor } from './DateListEditor';
import { Term } from './Term';
import { track } from './analytics';
import { geolocateCountry } from './geo';
import { forecastWithRequests } from '../personal/forecast';
import { expirationRisks } from '../personal/expiration';
import { compactDate, compactDatesIn } from './compactDate';
import { initialPolicyPreferences, readBrowserPolicyDraft, keepPrivatePolicyDraft, savePolicyPreferences, deletePolicyPreferences } from '../personal/policyPreferences';
import { QuickForecast } from './QuickForecast';
import { BalanceFromImage } from './BalanceFromImage';
import { useRequestLedger } from './useRequestLedger';
import { WalletTransfer } from './WalletTransfer';
import { generateAlerts } from '../policy/alerts';
import { generatePolicySummary } from '../policy/summary';
import { generateHRQuestions, hrQuestionsMessage } from '../policy/hrQuestions';
import { decodeParagraph, uniqueMatchedTerms } from '../policy/decode';
import type { AccrualMethod, CarryoverRule, PlanYear, TimeOffPolicy } from '../policy/model';
import { copyText } from './requestText';
import { writePolicyStateToURL, type PolicyURLState } from './policyUrlState';
import { isValidISODate } from './urlState';
import { isSupportedPlanningRange, workWeekLinkIssue } from './validation';
import { usePinnedPlans } from './pinnedPlanStore';

const HORIZON_MONTHS = 18;
const WORKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

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
    <div className="flex min-w-0 flex-col gap-1.5 text-sm">
      <span className="flex min-h-5 items-center gap-1 font-semibold text-ink">
        <label htmlFor={id}>{label}</label>
        {termId && <Term id={termId}>{'?'}</Term>}
      </span>
      {child}
    </div>
  );
}

const inputClass = 'h-11 w-full min-w-0 rounded-[6px] border border-line-strong bg-surface px-3 text-base text-ink';
const selectClass = 'select-ink h-11 w-full min-w-0 text-base';
const checkRow = 'flex min-h-11 items-center gap-2 text-sm text-ink';
const inputNumber = (value: string) => value === '' ? NaN : Number(value);
const displayNumber = (value: number) => Number.isFinite(value) ? value : '';

function missingForecastInput(policy: TimeOffPolicy, validWorkdayHours: boolean): string | undefined {
  if (!isValidISODate(policy.balanceAsOf)) return 'Enter the date of your current PTO balance.';
  const { accrual, carryover } = policy;
  if ((accrual.kind === 'front-loaded' || accrual.kind === 'per-pay-period') && !Number.isFinite(accrual.amount)) {
    return 'Enter how much PTO you earn. Enter 0 if you do not earn more PTO.';
  }
  if (accrual.kind === 'front-loaded' && !isValidISODate(accrual.grantDate)) return 'Enter the date your annual PTO is granted.';
  if (accrual.kind === 'per-pay-period' && !isValidISODate(accrual.payDateAnchor)) return 'Enter a known pay date to forecast future accrual.';
  if (accrual.kind === 'per-hour-worked' && (!Number.isFinite(accrual.rate) || !Number.isFinite(accrual.typicalWeeklyHours))) {
    return 'Enter your PTO accrual rate and typical weekly hours.';
  }
  if (!validWorkdayHours) return 'Enter the hours in a normal workday, up to 24.';
  if (carryover.useByDate !== undefined && !isValidISODate(carryover.useByDate)) return 'Enter the use-by date for carried PTO.';
}

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
      <line x1={PAD} y1={y(0)} x2={WIDTH - PAD} y2={y(0)} stroke="var(--border-default)" strokeWidth={1} />
      {cap !== undefined && (
        <>
          <line x1={PAD} y1={y(cap)} x2={WIDTH - PAD} y2={y(cap)} stroke="var(--border-strong)" strokeWidth={1} strokeDasharray="4 3" />
          <text x={WIDTH - PAD} y={y(cap) - 4} textAnchor="end" fontSize={13} fill="var(--text-muted)">
            cap
          </text>
        </>
      )}
      <path d={linePath} fill="none" stroke="var(--text-primary)" strokeWidth={2.5} />
    </svg>
  );
}

/** A small bar per PTO day analogue isn't applicable here (that's /sabbatical's marginal
 * chart) - this is the simple accrual/forfeiture timeline instead. */

export function Policy() {
  // Hydrate older policy links once, then keep the personal draft in the browser.
  const initial = useMemo(
    () => (typeof window === 'undefined' ? null : initialPolicyPreferences(window.location.search, geolocateCountry(), readBrowserPolicyDraft())),
    [],
  );
  const d = useMemo(() => initial ?? initialPolicyPreferences('', geolocateCountry()), [initial]);

  const [country, setCountry] = useState<string>(d.country);
  const [trackerWorkWeek, setTrackerWorkWeek] = useState<WorkWeek>(d.workWeek ?? DEFAULT_WORK_WEEK);
  // Issue 10: policyUrlState drops a link's all-days-off work week; say so until it is changed.
  const [linkWorkWeek] = useState(() => ({ issue: typeof window === 'undefined' ? null : workWeekLinkIssue(window.location.search), week: trackerWorkWeek }));
  const workWeekNotice = linkWorkWeek.week === trackerWorkWeek ? linkWorkWeek.issue : null;
  const [trackerSubdivision, setTrackerSubdivision] = useState(d.subdivision);
  const [trackerAltFridayStart, setTrackerAltFridayStart] = useState(d.altFridayStart ?? '');
  const [trackerAltFridayEnabled, setTrackerAltFridayEnabled] = useState(Boolean(d.altFridayStart));
  const [shiftMinutes, setShiftMinutes] = useState(d.shiftMinutes);

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

  const [enteredBalance, setEnteredBalance] = useState<number | null>(d.balanceEntered === false ? null : d.currentBalance);
  const currentBalance = enteredBalance ?? 0;
  const needsBalance = enteredBalance === null;
  const editBalance = (value: string) => setEnteredBalance(value === '' ? null : Number(value));
  const [balanceAsOf, setBalanceAsOf] = useState(d.balanceAsOf);
  const [balanceIncludesApprovedLeave, setBalanceIncludesApprovedLeave] = useState(d.balanceIncludesApprovedLeave ?? false);
  const [plannedDays, setPlannedDays] = useState<string[]>(d.plannedDays);
  const [currentCarriedBalance, setCurrentCarriedBalance] = useState(d.currentCarriedBalance ?? 0);
  const useCarryoverDeadline = carryoverUseByEnabled && (carryoverMode !== 'none' || currentCarriedBalance > 0);
  const [forecastDate, setForecastDate] = useState(d.forecastDate ?? (isValidISODate(d.balanceAsOf) ? addMonthsClamped(d.balanceAsOf, 3) : ''));
  const [saveFeedback, setSaveFeedback] = useState<{ search: string; message: string }>();
  const ledger = useRequestLedger();
  const { pinnedPlans } = usePinnedPlans();

  const [unit, setUnit] = useState<'days' | 'hours'>(d.unit);
  const [hoursPerDay, setHoursPerDay] = useState(d.hoursPerDay);
  const needsWorkdayHours = unit === 'hours' || accrualKind === 'per-hour-worked';
  const validWorkdayHours = Number.isFinite(hoursPerDay) && hoursPerDay > 0 && hoursPerDay <= 24;
  const policyHoursPerDay = needsWorkdayHours || validWorkdayHours ? hoursPerDay : 8;

  const [pasteOpen, setPasteOpen] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  const accrual: AccrualMethod = useMemo(() => {
    if (accrualKind === 'front-loaded') return { kind: 'front-loaded', amount, grantDate: amount === 0 && !grantDate ? balanceAsOf : grantDate };
    if (accrualKind === 'per-pay-period') {
      const anchor = !payDateAnchor && (amount === 0 || frequency === 'semi-monthly') ? balanceAsOf : payDateAnchor;
      return { kind: 'per-pay-period', amount, frequency, payDateAnchor: anchor };
    }
    if (accrualKind === 'per-hour-worked') return { kind: 'per-hour-worked', rate: hourlyRate, typicalWeeklyHours };
    return { kind: 'unlimited', expectedDaysPerYear };
  }, [accrualKind, amount, grantDate, frequency, payDateAnchor, hourlyRate, typicalWeeklyHours, expectedDaysPerYear, balanceAsOf]);

  const planYear: PlanYear = useMemo(() => {
    if (planYearKind === 'anniversary') return { kind: 'anniversary', startDate: anniversaryStart };
    if (planYearKind === 'custom') return { kind: 'custom', resetDate: customResetDate };
    return { kind: 'calendar' };
  }, [planYearKind, anniversaryStart, customResetDate]);

  const carryover: CarryoverRule = useMemo(
    () => ({
      mode: carryoverMode,
      cap: carryoverMode === 'capped' ? carryoverCap : undefined,
      useByDate: useCarryoverDeadline ? carryoverUseBy : undefined,
    }),
    [carryoverMode, carryoverCap, useCarryoverDeadline, carryoverUseBy],
  );

  const policy: TimeOffPolicy = useMemo(
    () => ({
      unit,
      hoursPerDay: policyHoursPerDay,
      accrual,
      planYear,
      accrualCap: accrualCapEnabled && accrualKind !== 'unlimited' ? accrualCap : undefined,
      carryover,
      waitingPeriodDays: waitingPeriodEnabled ? waitingPeriodDays : undefined,
      negativeBalanceAllowance,
      payoutOnLeaving,
      currentBalance,
      balanceIncludesApprovedLeave,
      currentCarriedBalance,
      balanceAsOf,
      plannedDays,
    }),
    [
      unit, policyHoursPerDay, accrual, planYear, accrualCapEnabled, accrualKind, accrualCap, carryover,
      waitingPeriodEnabled, waitingPeriodDays, negativeBalanceAllowance, payoutOnLeaving, currentBalance, balanceIncludesApprovedLeave, currentCarriedBalance,
      balanceAsOf, plannedDays,
    ],
  );

  const currentPolicyURLState: PolicyURLState = useMemo(() => ({
    unit, hoursPerDay: policyHoursPerDay, accrualKind, amount, frequency, payDateAnchor, grantDate, hourlyRate,
    typicalWeeklyHours, expectedDaysPerYear, planYearKind, anniversaryStart, customResetDate,
    accrualCapEnabled, accrualCap, carryoverMode, carryoverCap, carryoverUseByEnabled,
    carryoverUseBy, waitingPeriodEnabled, waitingPeriodDays, negativeBalanceAllowance,
    payoutOnLeaving, currentBalance, balanceEntered: !needsBalance, balanceIncludesApprovedLeave, shiftMinutes, currentCarriedBalance, balanceAsOf, plannedDays, country, forecastDate,
    workWeek: trackerWorkWeek, subdivision: trackerSubdivision, altFridayStart: trackerAltFridayEnabled ? trackerAltFridayStart : undefined,
  }), [unit, policyHoursPerDay, accrualKind, amount, frequency, payDateAnchor, grantDate, hourlyRate,
    typicalWeeklyHours, expectedDaysPerYear, planYearKind, anniversaryStart, customResetDate,
    accrualCapEnabled, accrualCap, carryoverMode, carryoverCap, carryoverUseByEnabled,
    carryoverUseBy, waitingPeriodEnabled, waitingPeriodDays, negativeBalanceAllowance,
    payoutOnLeaving, currentBalance, needsBalance, balanceIncludesApprovedLeave, shiftMinutes, currentCarriedBalance, balanceAsOf, plannedDays, country, forecastDate,
    trackerWorkWeek, trackerSubdivision, trackerAltFridayEnabled, trackerAltFridayStart]);
  // Private snapshot used for the browser draft, explicit save, and opt-in expiry feeds.
  const privatePolicySearch = useMemo(() => {
    const params = new URLSearchParams();
    writePolicyStateToURL(params, currentPolicyURLState);
    return params.toString();
  }, [currentPolicyURLState]);
  useEffect(() => keepPrivatePolicyDraft(privatePolicySearch, country), [privatePolicySearch, country]);

  const forecastInputIssue = missingForecastInput(policy, !needsWorkdayHours || validWorkdayHours);
  const canProjectBalance = useMemo(() => !needsBalance && !forecastInputIssue && accrualKind !== 'unlimited'
    && forecastWithRequests(policy, balanceAsOf) !== null, [needsBalance, forecastInputIssue, accrualKind, policy, balanceAsOf]);
  const forecastFirst = canProjectBalance || accrualKind === 'unlimited';
  const projection = useMemo(() => canProjectBalance
    ? forecastWithRequests(policy, addMonthsClamped(balanceAsOf, HORIZON_MONTHS), ledger.requests)
    : null, [canProjectBalance, policy, balanceAsOf, ledger.requests]);
  const selectedForecast = useMemo(() => canProjectBalance ? forecastWithRequests(policy, forecastDate, ledger.requests) : null, [canProjectBalance, policy, forecastDate, ledger.requests]);
  const series = projection?.confirmed.series ?? [];
  const summary = useMemo(() => canProjectBalance || accrualKind === 'unlimited' ? generatePolicySummary(policy) : [], [canProjectBalance, accrualKind, policy]);
  const alerts = useMemo(() => generateAlerts(policy, projection?.confirmed.events ?? [], balanceAsOf, country), [policy, projection, balanceAsOf, country]);
  const hrQuestions = useMemo(() => generateHRQuestions(policy), [policy]);

  const visitDate = useTodayISO();
  // The soonest PTO the policy will take away (forfeiture or expiring carryover; a cap is
  // a separate kind of loss). Shown beside the forecast figure itself, so a date picked just
  // before a reset can never read as "nothing expires" while the loss is a day away.
  const upcomingLoss = useMemo(() => {
    if (!canProjectBalance) return undefined;
    const risks = expirationRisks(policy, country, ledger.requests, visitDate);
    return risks.filter((risk) => risk.kind !== 'cap').sort((a, b) => a.deadline.localeCompare(b.deadline))[0] ?? risks[0];
  }, [canProjectBalance, policy, country, ledger.requests, visitDate]);
  const visitYear = Number(visitDate.slice(0, 4));
  const calendarDate = isSupportedPlanningRange(visitDate, forecastDate) ? forecastDate : visitDate;
  const calendarStart = Number(calendarDate.slice(0, 4)) - visitYear >= 10 ? visitDate : `${visitYear}-01-01`;
  const calendarEnd = calendarDate > `${visitYear + 2}-12-31` ? calendarDate : `${visitYear + 2}-12-31`;
  const trackerCalendar = useRequestCalendar({ country, subdivision: trackerSubdivision, rangeStart: calendarStart, rangeEnd: calendarEnd, workWeek: trackerWorkWeek, altFridayStart: trackerAltFridayEnabled ? trackerAltFridayStart : undefined });

  const trackerShiftMinutes = unit === 'hours'
    ? shiftMinutes ?? trackerWorkWeek.map(working => working ? Math.round(hoursPerDay * 60) : 0)
    : undefined;
  const pricedRequestCalendar = { ...trackerCalendar.calendar, shiftMinutes: trackerShiftMinutes };

  const decoded = useMemo(() => decodeParagraph(pastedText), [pastedText]);
  const decodedTerms = useMemo(() => uniqueMatchedTerms(decoded), [decoded]);

  const reportSave = (message: string) => setSaveFeedback({ search: privatePolicySearch, message });
  const saveButtons = (
    <div className="mt-5 flex flex-wrap gap-x-2 gap-y-1 border-t border-line pt-3 text-sm">
      <button type="button" className="inline-flex min-h-11 items-center px-1 font-semibold text-ink underline decoration-1 underline-offset-[0.22em] transition-colors duration-150 hover:decoration-2" onClick={() => reportSave(savePolicyPreferences(privatePolicySearch) ? 'Policy saved in this browser.' : 'Browser storage is unavailable. You can still use the forecast on this page.')}>Save policy in this browser</button>
      <button type="button" className="inline-flex min-h-11 items-center px-1 text-muted underline decoration-1 underline-offset-[0.22em] transition-colors duration-150 hover:decoration-2 hover:text-ink" onClick={() => reportSave(deletePolicyPreferences() ? 'Saved policy deleted. Your current inputs stay on this page.' : 'Browser storage is unavailable.')}>Delete saved policy</button>
    </div>
  );

  return (
    <div className="min-h-screen bg-page">
      <SiteHeader active="policy" />
      <main id="main-content" tabIndex={-1}>
        <Container className="px-4 pb-12 pt-6 sm:px-6 lg:pt-10">
          <h1 className="max-w-3xl text-h1 type-display text-ink">How much PTO will I have, and what am I about to lose?</h1>
          <p className="mt-3 max-w-2xl text-base text-muted">
            Enter your balance and how you earn PTO. The forecast and the expiry check update as you type; the rest of your policy lives in Advanced options.
          </p>
          <aside aria-label="Saved plans" className="mt-2 flex flex-wrap items-baseline gap-x-3 text-sm text-muted">
            <p>{pinnedPlans.length} saved {pinnedPlans.length === 1 ? 'plan' : 'plans'} in this browser.</p>
            <a href="/pto#saved-plans" className="link-mark inline-flex min-h-11 items-center font-semibold">View saved plans</a>
          </aside>

          {/* On phones, incomplete policy inputs stay ahead of the forecast. */}
          {/* Inputs left, the answer right (sticky on desktop). Below lg the answer column
              dissolves (display: contents) so its two parts can be ordered answer, inputs,
              risk: the number first, then what drives it, then what could be lost. */}
          <div id="balance" className="mt-6 flex scroll-mt-24 flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)] lg:items-start lg:gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,27rem)]">
            <div className={`${forecastFirst ? 'order-2' : 'order-1'} flex min-w-0 flex-col gap-6 lg:order-none lg:col-start-1 lg:row-start-1`}>
              <section aria-label="Quick balance forecast" className="min-w-0 rounded-[10px] border border-line bg-surface p-4 sm:p-6">
                <h2 className="text-h2 font-bold type-condensed text-ink">Your balance and how you earn it</h2>
                <p className="mt-1 text-sm text-muted">Use your real balance and employer rules. Full carryover at reset is assumed until you choose another rule.</p>
                <div className="mt-5 grid gap-x-4 gap-y-4 sm:grid-cols-2">
                  <div className="flex min-w-0 flex-col gap-1">
                    <Field label={`Current PTO balance (${unit})`}><input type="number" step="any" value={enteredBalance ?? ''} aria-describedby="current-balance-hint" onChange={event => editBalance(event.target.value)} className={inputClass} /></Field>
                    <p id="current-balance-hint" className="text-xs leading-5 text-muted">From your payslip or HR portal. Enter 0 if your balance is zero.</p>
                  </div>
                  <Field label="Balance as-of date"><input type="date" value={balanceAsOf} onChange={event => setBalanceAsOf(event.target.value)} className={inputClass} /></Field>
                  {(!needsWorkdayHours || validWorkdayHours) && <BalanceFromImage unit={unit} hoursPerDay={policyHoursPerDay} today={visitDate} onUse={(balance, asOf) => { setEnteredBalance(balance); if (asOf) setBalanceAsOf(asOf); }} />}
                  <Field label="How PTO accrues"><select value={accrualKind} onChange={event => setAccrualKind(event.target.value as AccrualMethod['kind'])} className={selectClass}><option value="front-loaded">Granted all at once</option><option value="per-pay-period">Each pay period</option><option value="per-hour-worked">For each hour worked</option><option value="unlimited">Unlimited PTO</option></select></Field>
                  <Field label="Balance unit"><select value={unit} onChange={event => setUnit(event.target.value as 'days' | 'hours')} className={selectClass}><option value="days">Days</option><option value="hours">Hours</option></select></Field>
                  {(accrualKind === 'per-pay-period' || accrualKind === 'front-loaded') && <Field label={`${unit === 'hours' ? 'Hours' : 'Days'} earned each ${accrualKind === 'front-loaded' ? 'grant' : 'pay period'}`}><input type="number" min={0} step="any" value={displayNumber(amount)} onChange={event => setAmount(inputNumber(event.target.value))} className={inputClass} /></Field>}
                  {accrualKind === 'per-pay-period' && <><Field label="Pay frequency"><select value={frequency} onChange={event => setFrequency(event.target.value as typeof frequency)} className={selectClass}><option value="weekly">Weekly</option><option value="biweekly">Every two weeks</option><option value="semi-monthly">Twice a month</option><option value="monthly">Monthly</option></select></Field><Field label="Known pay date"><input type="date" value={payDateAnchor} onChange={event => setPayDateAnchor(event.target.value)} className={inputClass} /></Field></>}
                  {accrualKind === 'front-loaded' && <Field label="Annual grant date"><input type="date" value={grantDate} onChange={event => setGrantDate(event.target.value)} className={inputClass} /></Field>}
                  {accrualKind === 'per-hour-worked' && <><Field label="Hours earned per hour worked"><input type="number" min={0} step="any" value={displayNumber(hourlyRate)} onChange={event => setHourlyRate(inputNumber(event.target.value))} className={inputClass} /></Field><Field label="Typical hours worked each week"><input type="number" min={0} step="any" value={displayNumber(typicalWeeklyHours)} onChange={event => setTypicalWeeklyHours(inputNumber(event.target.value))} className={inputClass} /></Field></>}
                  {(unit === 'hours' || accrualKind === 'per-hour-worked') && <Field label="Hours per working day for conversion"><input type="number" min={0.25} step="any" value={displayNumber(hoursPerDay)} onChange={event => setHoursPerDay(inputNumber(event.target.value))} className={inputClass} /></Field>}
                  {accrualKind !== 'unlimited' && <Field label="Expiry and carryover"><select value={carryoverMode} onChange={event => setCarryoverMode(event.target.value as CarryoverRule['mode'])} className={selectClass}><option value="all">Full carryover at reset</option><option value="none">Use it or lose it at reset</option><option value="capped">Limited carryover at reset</option></select></Field>}
                  {accrualKind !== 'unlimited' && carryoverMode !== 'all' && <Field label="Reset date (new plan year begins)"><input type="date" value={planYearKind === 'calendar' ? `${Number(balanceAsOf.slice(0, 4)) + 1}-01-01` : planYearKind === 'anniversary' ? anniversaryStart : customResetDate} onChange={event => { setPlanYearKind('custom'); setCustomResetDate(event.target.value); }} className={inputClass} /></Field>}
                  {accrualKind !== 'unlimited' && carryoverMode === 'capped' && <Field label={`Carryover limit (${unit})`}><input type="number" min={0} step="any" value={displayNumber(carryoverCap)} onChange={event => setCarryoverCap(inputNumber(event.target.value))} className={inputClass} /></Field>}
                </div>
                {saveButtons}
                <p className="text-xs leading-5 text-muted">Save here to resume on another visit from this browser. Your balance and policy stay off the page URL.</p>
                {saveFeedback?.search === privatePolicySearch && <p role="status" className="mt-1 text-sm text-muted">{saveFeedback.message}</p>}
              </section>

              <details className="group min-w-0 rounded-[10px] border border-line bg-surface">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 sm:px-6 [&::-webkit-details-marker]:hidden">
                  <span>
                    <span className="block text-lg font-bold type-condensed text-ink">Advanced policy options and explanation</span>
                    <span className="block text-sm text-muted">Plan year, caps, carryover deadlines, waiting period, borrowing, payout, planned days, questions for HR.</span>
                  </span>
                  <span aria-hidden="true" className="shrink-0 text-xl leading-none text-ink group-open:rotate-45 motion-safe:transition-transform">+</span>
                </summary>
                <div className="border-t border-line px-4 pb-6 pt-5 sm:px-6">
                  <div>
                    <button
                      type="button"
                      onClick={() => setPasteOpen((o) => !o)}
                      aria-expanded={pasteOpen}
                      className="inline-flex min-h-11 items-center text-sm font-semibold text-ink underline decoration-1 underline-offset-[0.22em] hover:decoration-2"
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
                          className="w-full rounded-[6px] border border-line-strong bg-surface p-3 text-base text-ink"
                        />
                        <p className="mt-1 text-xs text-muted">
                          Never stored, never in the URL — cleared on reload. We only match it against our own glossary.
                        </p>
                        {decodedTerms.length > 0 && (
                          <p className="mt-2 text-sm text-ink">
                            We spotted {decodedTerms.map((t) => `"${t.term}"`).join(', ')}. Set those below ↓
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <h3 className="mt-6 text-base font-bold text-ink">How you earn PTO</h3>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <Field label="How you get days">
                      <select value={accrualKind} onChange={(e) => setAccrualKind(e.target.value as AccrualMethod['kind'])} className={selectClass}>
                        <option value="front-loaded">Front-loaded</option>
                        <option value="per-pay-period">Per pay period</option>
                        <option value="per-hour-worked">Per hour worked</option>
                        <option value="unlimited">Unlimited</option>
                      </select>
                    </Field>
                    {accrualKind === 'front-loaded' && (
                      <>
                        <Field label="Days granted" termId="front-loaded">
                          <input type="number" min={0} step={0.5} value={displayNumber(amount)} onChange={(e) => setAmount(inputNumber(e.target.value))} className={inputClass} />
                        </Field>
                        <Field label="Grant date">
                          <input type="date" value={grantDate} onChange={(e) => setGrantDate(e.target.value)} className={inputClass} />
                        </Field>
                      </>
                    )}
                    {accrualKind === 'per-pay-period' && (
                      <>
                        <Field label={`Amount per pay period (${unit})`} termId="accrual-rate">
                          <input type="number" min={0} step={0.01} value={displayNumber(amount)} onChange={(e) => setAmount(inputNumber(e.target.value))} className={inputClass} />
                        </Field>
                        <Field label="Pay frequency" termId="pay-frequency">
                          <select value={frequency} onChange={(e) => setFrequency(e.target.value as typeof frequency)} className={selectClass}>
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
                          <input type="number" min={0} step={0.001} value={displayNumber(hourlyRate)} onChange={(e) => setHourlyRate(inputNumber(e.target.value))} className={inputClass} />
                        </Field>
                        <Field label="Typical hours worked per week">
                          <input type="number" min={0} step={1} value={displayNumber(typicalWeeklyHours)} onChange={(e) => setTypicalWeeklyHours(inputNumber(e.target.value))} className={inputClass} />
                        </Field>
                      </>
                    )}
                    {accrualKind === 'unlimited' && (
                      <Field label="Days you expect to actually take this year" termId="unlimited-pto">
                        <input type="number" min={0} step={1} value={expectedDaysPerYear} onChange={(e) => setExpectedDaysPerYear(Number(e.target.value))} className={inputClass} />
                      </Field>
                    )}
                    <Field label="Unit">
                      <select value={unit} onChange={(e) => setUnit(e.target.value as 'days' | 'hours')} className={selectClass}>
                        <option value="days">Days</option>
                        <option value="hours">Hours</option>
                      </select>
                    </Field>
                    {(unit === 'hours' || accrualKind === 'per-hour-worked') && (
                      <Field label="Hours in a full working day">
                        <input type="number" min={1} step={0.5} value={displayNumber(hoursPerDay)} onChange={(e) => setHoursPerDay(inputNumber(e.target.value))} className={inputClass} />
                      </Field>
                    )}
                  </div>

                  <h3 className="mt-8 text-base font-bold text-ink">Plan year, caps and carryover</h3>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <Field label="Plan year" termId="plan-year">
                      <select value={planYearKind} onChange={(e) => setPlanYearKind(e.target.value as PlanYear['kind'])} className={selectClass}>
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
                    <Field label="Carryover" termId="carryover">
                      <select value={carryoverMode} onChange={(e) => setCarryoverMode(e.target.value as CarryoverRule['mode'])} className={selectClass}>
                        <option value="none">None (use-it-or-lose-it)</option>
                        <option value="capped">Up to a limit</option>
                        <option value="all">Everything carries over</option>
                      </select>
                    </Field>
                    {carryoverMode === 'capped' && (
                      <Field label={`Carryover limit (${unit})`}>
                        <input type="number" min={0} step={0.5} value={displayNumber(carryoverCap)} onChange={(e) => setCarryoverCap(inputNumber(e.target.value))} className={inputClass} />
                      </Field>
                    )}
                  </div>
                  <div className="mt-2 flex flex-col">
                    {accrualKind !== 'unlimited' && (
                      <div className="flex items-center gap-1">
                        <label className={checkRow}>
                          <input type="checkbox" className="h-4 w-4" checked={accrualCapEnabled} onChange={(e) => setAccrualCapEnabled(e.target.checked)} />
                          Has an accrual cap
                        </label>
                        <Term id="accrual-cap">{'?'}</Term>
                      </div>
                    )}
                    {accrualCapEnabled && accrualKind !== 'unlimited' && (
                      <div className="mb-2 max-w-xs">
                        <Field label={`Cap (${unit})`}>
                          <input type="number" min={0} step={0.5} value={displayNumber(accrualCap)} onChange={(e) => setAccrualCap(inputNumber(e.target.value))} className={inputClass} />
                        </Field>
                      </div>
                    )}
                    {(carryoverMode !== 'none' || currentCarriedBalance > 0) && (
                      <>
                        <label className={checkRow}>
                          <input type="checkbox" className="h-4 w-4" checked={carryoverUseByEnabled} onChange={(e) => setCarryoverUseByEnabled(e.target.checked)} />
                          Carried days have their own deadline
                        </label>
                        {carryoverUseByEnabled && (
                          <div className="mb-2 max-w-xs">
                            <Field label="Use carried days by">
                              <input type="date" value={carryoverUseBy} onChange={(e) => setCarryoverUseBy(e.target.value)} className={inputClass} />
                            </Field>
                          </div>
                        )}
                      </>
                    )}
                    <div className="flex items-center gap-1">
                      <label className={checkRow}>
                        <input type="checkbox" className="h-4 w-4" checked={waitingPeriodEnabled} onChange={(e) => setWaitingPeriodEnabled(e.target.checked)} />
                        There&apos;s a waiting period
                      </label>
                      <Term id="waiting-period">{'?'}</Term>
                    </div>
                    {waitingPeriodEnabled && (
                      <div className="mb-2 max-w-xs">
                        <Field label="Waiting period (days)">
                          <input type="number" min={0} step={1} value={displayNumber(waitingPeriodDays)} onChange={(e) => setWaitingPeriodDays(inputNumber(e.target.value))} className={inputClass} />
                        </Field>
                      </div>
                    )}
                  </div>

                  <h3 className="mt-8 text-base font-bold text-ink">Balance, borrowing and payout</h3>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <Field label="Can your balance go negative?" termId="negative-balance">
                      <input type="number" min={0} step={0.5} value={displayNumber(negativeBalanceAllowance)} onChange={(e) => setNegativeBalanceAllowance(inputNumber(e.target.value))} className={inputClass} />
                    </Field>
                    <Field label="If you leave, is unused PTO paid out?" termId="payout">
                      <select value={payoutOnLeaving} onChange={(e) => setPayoutOnLeaving(e.target.value as TimeOffPolicy['payoutOnLeaving'])} className={selectClass}>
                        <option value="pays">Pays it out</option>
                        <option value="doesnt">Doesn't</option>
                        <option value="not-sure">Not sure</option>
                      </select>
                    </Field>
                    <Field label="Current balance">
                      <input type="number" min={Number.isFinite(negativeBalanceAllowance) ? -negativeBalanceAllowance : undefined} step={0.5} value={enteredBalance ?? ''} onChange={(e) => editBalance(e.target.value)} className={inputClass} />
                    </Field>
                    <Field label="As of">
                      <input type="date" value={balanceAsOf} onChange={(e) => setBalanceAsOf(e.target.value)} className={inputClass} />
                    </Field>
                    <div className="sm:col-span-2">
                      <Field label={`Already-carried PTO included in your balance (${unit})`}>
                        <input type="number" min={0} max={Math.max(0, currentBalance)} step="any" value={currentCarriedBalance} onChange={event => setCurrentCarriedBalance(Number(event.target.value))} className={`${inputClass} sm:max-w-[calc(50%-0.5rem)]`} />
                      </Field>
                      <p className="mt-1 text-xs text-muted">Only enter the carried portion if you know it, and enter its separate use-by date above. It is part of your total balance.</p>
                    </div>
                    <Field label="Country for holiday calculations">
                      <CountrySelect country={country} onChangeCountry={setCountry} />
                    </Field>
                  </div>

                  <div className="mt-6">
                    <p className="mb-1 text-sm font-semibold text-ink">Days already planned</p>
                    <DateListEditor
                      dates={plannedDays}
                      onAdd={(d) => setPlannedDays((prev) => [...prev, d].sort())}
                      onRemove={(d) => setPlannedDays((prev) => prev.filter((x) => x !== d))}
                    />
                  </div>

                  <div className="mt-8 flex flex-col gap-8 border-t border-line pt-6">
                    <section>
                      <h3 className="mb-2 text-base font-bold text-ink">Your policy, in plain English</h3>
                      <div className="flex flex-col gap-1.5 text-base text-ink">
                        {summary.length ? summary.map((s, i) => (
                          <p key={i}>{s}</p>
                        )) : <p className="text-sm text-muted">Complete your policy inputs to see a summary.</p>}
                      </div>
                    </section>

                    {series.length > 0 ? (
                      <section>
                        <h3 className="mb-2 text-base font-bold text-ink">Your balance over the next 18 months</h3>
                        <BalanceChart series={series} cap={policy.accrualCap} />
                      </section>
                    ) : accrualKind === 'unlimited' ? (
                      <section className="text-sm text-ink">
                        No balance to chart — unlimited PTO has no cap and nothing to run out of.{' '}
                        <a
                          href={`/pto?c=${country}&b=${expectedDaysPerYear}`}
                          className="link-mark font-semibold"
                          onClick={() => track('policy_alert_action_clicked')}
                        >
                          Plan your {expectedDaysPerYear} days →
                        </a>
                      </section>
                    ) : <p role="status" className="text-sm text-muted">Enter valid policy amounts and dates to see the projection.</p>}

                    <section>
                      <h3 className="mb-2 text-base font-bold text-ink">Alerts</h3>
                      {!projection ? <p role="status" className="text-sm text-muted">Check the policy inputs before relying on expiration or cap warnings.</p> : alerts.length === 0 ? (
                        <p className="text-sm text-muted">Nothing to flag: no forfeiture, cap or deadline risk in the 18 months after your balance date.</p>
                      ) : (
                        <ul className="flex flex-col divide-y divide-line border-y border-line">
                          {alerts.map((a) => (
                            <li key={a.id} className="flex gap-2 py-3 text-sm text-ink">
                              <span aria-hidden="true" className="mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-[2px] bg-warning" />
                              <div>
                                <p>{compactDatesIn(a.text)}</p>
                                {a.daysAtStake > 0 && (
                                  <a
                                    href="#expiration"
                                    className="link-mark mt-1 inline-flex min-h-11 items-center font-semibold"
                                    onClick={() => track('policy_alert_action_clicked')}
                                  >
                                    Review the expiration guard →
                                  </a>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>

                    <section>
                      <h3 className="mb-2 text-base font-bold text-ink">Questions to ask HR</h3>
                      {hrQuestions.length === 0 ? (
                        <p className="text-sm text-muted">Nothing unclear in what you've entered.</p>
                      ) : (
                        <>
                          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-ink">
                            {hrQuestions.map((q) => (
                              <li key={q}>{q}</li>
                            ))}
                          </ul>
                          <Button
                            variant="secondary"
                            size="md"
                            className="mt-3"
                            onClick={async () => {
                              const ok = await copyText(hrQuestionsMessage(hrQuestions));
                              setCopyMessage(ok ? 'Copied' : "Couldn't copy — try again");
                              track('policy_questions_copied');
                              setTimeout(() => setCopyMessage(null), 2000);
                            }}
                          >
                            {copyMessage ?? 'Copy questions'}
                          </Button>
                        </>
                      )}
                    </section>

                    <PolicyFAQ />
                  </div>
                </div>
              </details>
            </div>

            <div className="contents lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:flex lg:flex-col lg:gap-4">
              <div className={`${forecastFirst ? 'order-1' : 'order-2'} min-w-0 lg:order-none`}>
                <QuickForecast policy={policy} balanceEntered={!needsBalance} inputIssue={forecastInputIssue} requests={ledger.requests} upcomingLoss={upcomingLoss} forecastDate={forecastDate} onForecastDateChange={setForecastDate} onForecastUsed={() => track('balance_forecast_used')} />
              </div>
              <div id="expiration" className="order-3 min-w-0 scroll-mt-24 lg:order-none">
                {canProjectBalance ? (
                  <ExpirationGuard policy={policy} country={country} requests={ledger.requests} today={visitDate} holidayCalendar={trackerCalendar} subdivision={trackerSubdivision} watchSearch={privatePolicySearch} onAlertViewed={() => track('expiration_alert_viewed')} onAlertAction={() => track('expiration_alert_action_taken')} />
                ) : (
                  <section className="min-w-0 rounded-[10px] border border-line bg-surface p-4 sm:p-6">
                    <h2 className="text-lg font-bold type-condensed text-ink">PTO expiration guard</h2>
                    <p className="mt-2 text-sm text-muted">{accrualKind === 'unlimited' ? 'Unlimited PTO has no banked balance to expire.' : 'Enter your balance and policy above to check expiration risk.'}</p>
                  </section>
                )}
              </div>
            </div>
            <div id="requests" className="order-4 mt-6 min-w-0 scroll-mt-24 lg:order-none lg:col-start-1 lg:row-start-2 lg:mt-4">
              <PtoTracker today={visitDate} ledger={ledger} calendar={pricedRequestCalendar} calendarReady={!trackerCalendar.loading && !trackerCalendar.degraded} calendarNotice={trackerCalendar.loading ? 'Loading your employer calendar…' : trackerCalendar.degraded ? 'Holiday data or a calendar input is unavailable. Check the calendar settings before adding or changing request dates.' : undefined} forecastSummary={selectedForecast?.confirmed.balance === null || selectedForecast?.confirmed.balance === undefined ? undefined : `Projected balance on ${compactDate(forecastDate)} is ${new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(selectedForecast.confirmed.balance)} ${unit}.`} onTrackingStarted={() => track('request_tracking_started')} onStatusChanged={() => track('request_status_updated')} />
              <WalletTransfer policy={canProjectBalance ? policy : undefined} requests={ledger.requests} forecastDate={forecastDate} />
              {workWeekNotice && <p role="status" className="mt-3 rounded-[10px] bg-surface-alt p-4 text-sm text-ink">{workWeekNotice}</p>}
              <details className="group mt-3 rounded-[10px] border border-line bg-surface">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 font-semibold text-ink sm:px-6 [&::-webkit-details-marker]:hidden">
                  My request calendar and workweek
                  <span aria-hidden="true" className="shrink-0 text-xl leading-none group-open:rotate-45 motion-safe:transition-transform">+</span>
                </summary>
                <div className="border-t border-line px-4 pb-5 pt-4 sm:px-6">
                  <div className="flex flex-wrap items-start gap-4">
                    <CountrySelect country={country} onChangeCountry={code => { setCountry(code); setTrackerSubdivision(undefined); }} />
                    <SubdivisionSelect subdivisions={trackerCalendar.subdivisions} subdivision={trackerSubdivision} onChangeSubdivision={setTrackerSubdivision} />
                  </div>
                  <fieldset className="mt-4"><legend className="text-sm font-semibold text-ink">Working days</legend><div className="mt-1 flex flex-wrap gap-x-4">{WORKDAY_NAMES.map((name, index) => <label key={name} className="flex min-h-11 items-center gap-2 text-sm text-ink"><input type="checkbox" className="h-4 w-4" checked={trackerWorkWeek[index]} disabled={trackerWorkWeek[index] && trackerWorkWeek.filter(Boolean).length === 1} onChange={event => setTrackerWorkWeek(previous => previous.map((day, i) => i === index ? event.target.checked : day) as WorkWeek)} />{name}</label>)}</div></fieldset>
                  <label className={`${checkRow} mt-2`}><input type="checkbox" className="h-4 w-4" checked={trackerAltFridayEnabled} onChange={event => setTrackerAltFridayEnabled(event.target.checked)} />Every other Friday off</label>
                  {trackerAltFridayEnabled && <label className="block max-w-xs text-sm font-semibold text-ink">First non-working Friday<input type="date" value={trackerAltFridayStart} onChange={event => setTrackerAltFridayStart(event.target.value)} className={`${inputClass} mt-1.5 block`} /></label>}
                  {unit === 'hours' && (
                    <div className="mt-2">
                      <label className={checkRow}>
                        <input type="checkbox" className="h-4 w-4" checked={shiftMinutes !== undefined}
                          onChange={event => setShiftMinutes(event.target.checked ? WORKDAY_NAMES.map(() => Math.round(hoursPerDay * 60)) : undefined)} />
                        Set hours for each weekday
                      </label>
                      {shiftMinutes && (
                        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                          {WORKDAY_NAMES.map((name, index) => trackerWorkWeek[index] && (
                            <Field key={name} label={`${name} shift hours`}>
                              <input type="number" className={inputClass} min={1 / 60} max={24} step="any"
                                value={shiftMinutes[index] / 60}
                                onChange={event => {
                                  const minutes = Math.round(Number(event.target.value) * 60);
                                  setShiftMinutes(current => current?.map((value, day) => day === index ? minutes : value));
                                }} />
                            </Field>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <label className={`${checkRow} mt-2`}>
                    <input type="checkbox" className="h-4 w-4" checked={balanceIncludesApprovedLeave}
                      onChange={event => setBalanceIncludesApprovedLeave(event.target.checked)} />
                    My entered balance already deducts approved future leave
                  </label>
                  <p className="mt-3 text-sm text-muted">Uses your saved employer holidays for this country and region. Adjust those in <a className="link-mark" href="/pto">the PTO planner</a>. To cover a later request, move the forecast date.</p>
                </div>
              </details>
            </div>
          </div>

          <div className="mt-12 border-t border-line pt-8 lg:mt-16 lg:pt-10">
            <DeparturePayoutEstimator policy={policy} policyReady={canProjectBalance} requests={ledger.requests} />
          </div>
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
    <section id="policy-questions" className="text-sm text-muted">
      <h3 className="mb-1 text-base font-bold text-ink">Questions</h3>
      <div className="flex flex-col divide-y divide-line border-y border-line">
        {POLICY_FAQ.map((item) => (
          <details key={item.question} className="py-1">
            <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-ink">{item.question}</summary>
            <p className="pb-3">{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
