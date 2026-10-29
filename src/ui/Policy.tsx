import { cloneElement, isValidElement, useEffect, useId, useMemo, useState, type ReactElement } from 'react';
import { SiteHeader } from './SiteHeader';
import { Footer } from './Footer';
import { Container } from './Container';
import { CountrySelect } from './CountrySelect';
import { DateListEditor } from './DateListEditor';
import { Term } from './Term';
import { track } from './analytics';
import { geolocateCountry } from './geo';
import { projectBalance } from '../policy/projection';
import { generateAlerts } from '../policy/alerts';
import { generatePolicySummary } from '../policy/summary';
import { generateHRQuestions, hrQuestionsMessage } from '../policy/hrQuestions';
import { decodeParagraph, uniqueMatchedTerms } from '../policy/decode';
import type { AccrualMethod, CarryoverRule, PlanYear, TimeOffPolicy } from '../policy/model';
import { copyText } from './requestText';
import { readPolicyStateFromURL, writePolicyStateToURL, defaultPolicyURLState, type PolicyURLState } from './policyUrlState';

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
      <line x1={PAD} y1={y(0)} x2={WIDTH - PAD} y2={y(0)} stroke="#e2e8f0" strokeWidth={1} />
      {cap !== undefined && (
        <>
          <line x1={PAD} y1={y(cap)} x2={WIDTH - PAD} y2={y(cap)} stroke="#94a3b8" strokeWidth={1} strokeDasharray="4 3" />
          <text x={WIDTH - PAD} y={y(cap) - 4} textAnchor="end" className="fill-slate-400 text-[10px]">
            cap
          </text>
        </>
      )}
      <path d={linePath} fill="none" stroke="#1e293b" strokeWidth={2} />
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
    () => (typeof window === 'undefined' ? null : readPolicyStateFromURL(window.location.search, geolocateCountry())),
    [],
  );
  const d = useMemo(() => initial ?? { ...defaultPolicyURLState(), country: geolocateCountry() }, [initial]);

  const [country, setCountry] = useState<string>(d.country);

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
      balanceAsOf,
      plannedDays,
    }),
    [
      unit, hoursPerDay, accrual, planYear, accrualCapEnabled, accrualKind, accrualCap, carryover,
      waitingPeriodEnabled, waitingPeriodDays, negativeBalanceAllowance, payoutOnLeaving, currentBalance,
      balanceAsOf, plannedDays,
    ],
  );

  // Sync every input into the shareable URL whenever it changes - same pattern
  // useAppState.ts already uses for /pto.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const state: PolicyURLState = {
      unit, hoursPerDay, accrualKind, amount, frequency, payDateAnchor, grantDate, hourlyRate,
      typicalWeeklyHours, expectedDaysPerYear, planYearKind, anniversaryStart, customResetDate,
      accrualCapEnabled, accrualCap, carryoverMode, carryoverCap, carryoverUseByEnabled,
      carryoverUseBy, waitingPeriodEnabled, waitingPeriodDays, negativeBalanceAllowance,
      payoutOnLeaving, currentBalance, balanceAsOf, plannedDays, country,
    };
    writePolicyStateToURL(url.searchParams, state);
    window.history.replaceState(null, '', url);
  }, [
    unit, hoursPerDay, accrualKind, amount, frequency, payDateAnchor, grantDate, hourlyRate,
    typicalWeeklyHours, expectedDaysPerYear, planYearKind, anniversaryStart, customResetDate,
    accrualCapEnabled, accrualCap, carryoverMode, carryoverCap, carryoverUseByEnabled,
    carryoverUseBy, waitingPeriodEnabled, waitingPeriodDays, negativeBalanceAllowance,
    payoutOnLeaving, currentBalance, balanceAsOf, plannedDays, country,
  ]);

  const horizonEnd = useMemo(() => addMonthsISO(balanceAsOf, HORIZON_MONTHS), [balanceAsOf]);
  const { series, events } = useMemo(() => projectBalance(policy, horizonEnd), [policy, horizonEnd]);
  const summary = useMemo(() => generatePolicySummary(policy), [policy]);
  const alerts = useMemo(() => generateAlerts(policy, events, balanceAsOf, country), [policy, events, balanceAsOf, country]);
  const hrQuestions = useMemo(() => generateHRQuestions(policy), [policy]);

  const decoded = useMemo(() => decodeParagraph(pastedText), [pastedText]);
  const decodedTerms = useMemo(() => uniqueMatchedTerms(decoded), [decoded]);

  return (
    <div className="min-h-screen bg-white">
      <SiteHeader active="policy" />
      <main>
        <Container className="px-4 py-10">
          <h1 className="text-3xl font-bold text-slate-900">Your time-off policy, in plain English</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Describe your policy below. Everything updates live — nothing is sent anywhere, and your plan reproduces
            from the page itself, not a stored account.
          </p>

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
              {unit === 'hours' && (
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
              <Field label="As of">
                <input type="date" value={balanceAsOf} onChange={(e) => setBalanceAsOf(e.target.value)} className={inputClass} />
              </Field>

              <Field label="Country (for the /pto hand-off)">
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
              ) : (
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
              )}

              <section>
                <h2 className="mb-2 text-sm font-semibold text-slate-500">Alerts</h2>
                {alerts.length === 0 ? (
                  <p className="text-sm text-slate-500">Nothing to flag — no forfeiture, cap, or deadline risk in the next 18 months.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {alerts.map((a) => (
                      <li key={a.id} className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        <p>{a.text}</p>
                        {a.daysAtStake > 0 && (
                          <a
                            href={a.ptoHref}
                            className="mt-1 inline-block font-medium underline"
                            onClick={() => track('policy_alert_action_clicked')}
                          >
                            Plan those days →
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
