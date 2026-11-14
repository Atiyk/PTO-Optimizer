import { useId, useState, type ReactNode } from 'react';
import { validateCurrentCarriedBalance, type TimeOffPolicy } from '../policy/model';
import { forecastWithRequests } from '../personal/forecast';
import { explainConnectedPolicy } from '../personal/policyExplanation';
import type { PtoRequest } from '../personal/requestLedger';
import { forecastPresets } from './forecastPresets';
import { compactDate, compactDatesIn } from './compactDate';
import { blankBalanceMessage, withoutAccrual } from './balanceCopy';

export interface QuickForecastProps {
  policy: TimeOffPolicy;
  balanceEntered?: boolean;
  inputIssue?: string;
  requests?: readonly PtoRequest[];
  forecastDate: string;
  onForecastDateChange: (date: string) => void;
  onForecastUsed?: () => void;
  /** The soonest loss the policy causes (from the same expiration check as the guard), so
   * the answer can say it beside the figure instead of only further down the page. */
  upcomingLoss?: { text: string; deadline: string; expirationDate: string };
  /** The balance input, placed first in the card so the answer appears right under it. */
  children?: ReactNode;
  /** F07: set when the only missing inputs are about accrual. The card then answers from
   * the balance and tracked leave alone, says accrual is not in it, and asks for it next. */
  accrualIssue?: string;
}

const number = (value: number) => new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(value);
/** A signed amount that never reads "−0" or "+0": a zero is just 0. */
const signed = (sign: '+' | '−', value: number) => {
  const text = number(Math.abs(value));
  return text === '0' ? '0' : `${sign}${text}`;
};

/** One line of the balance equation: an operator, a label and a signed amount. */
function EquationRow({ op, label, value, strong = false }: { op: string; label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className={`grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-baseline gap-x-2 py-1.5 ${strong ? 'border-t border-ink pt-2.5 font-semibold' : ''}`}>
      <span aria-hidden="true" className="text-center text-muted">{op}</span>
      <dt className={strong ? 'text-ink' : 'text-muted'}>{label}</dt>
      <dd className="text-right font-semibold text-ink tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * F07: the answer from the balance alone. Tracked leave and the carryover rule still apply;
 * accrual is left out and the card says so, with the one input that would add it.
 */
function BalanceOnly({ policy, forecast, forecastDate, accrualIssue }: { policy: TimeOffPolicy; forecast: NonNullable<ReturnType<typeof forecastWithRequests>>; forecastDate: string; accrualIssue: string }) {
  const { confirmed, tentative } = forecast;
  const unit = policy.unit;
  const balance = confirmed.balance ?? 0;
  const amount = (value: number) => `${number(value)} ${unit === 'days' && value === 1 ? 'day' : unit === 'hours' && value === 1 ? 'hour' : unit}`;
  return (
    <div className="mt-4 border-t border-line pt-3" data-testid="balance-only-forecast">
      <p className="text-sm text-muted">Available PTO on {compactDate(forecastDate)}, before accrual</p>
      <p className="mt-1 flex items-baseline gap-2 text-ink" aria-live="polite">
        <span className="mark text-display-sm type-display tabular-nums">{number(balance)}</span>{' '}
        <span className="text-lg font-semibold">{unit}</span>
      </p>
      <p className="mt-2 text-base text-ink">
        You have {amount(policy.currentBalance)} now.{' '}
        {confirmed.scheduled > 0
          ? <>After {amount(confirmed.scheduled)} of approved leave, you&apos;ll have {amount(balance)} on {compactDate(forecastDate)}.</>
          : <>No approved leave is tracked before {compactDate(forecastDate)}.</>}
        {confirmed.expired > 0 && <> {amount(confirmed.expired)} {confirmed.expired === 1 ? "expires" : "expire"} under your carryover rule by then.</>}
      </p>
      {tentative.scheduled > confirmed.scheduled && (
        <p className="mt-2 text-sm text-ink">Including planned and requested leave: <strong>{amount(tentative.balance ?? 0)}</strong>.</p>
      )}
      {confirmed.unfunded > 0.000001 && (
        <p role="status" className="mt-2 text-sm text-ink">Your approved leave is {amount(confirmed.unfunded)} more than this balance covers, before accrual.</p>
      )}
      <div role="status" className="mt-4 rounded-[10px] bg-surface-alt p-3 text-sm text-ink">
        <p><strong className="font-semibold">Accrual is not included yet.</strong> {accrualIssue}</p>
        <a href="#how-you-earn" className="link-mark mt-1 inline-flex min-h-11 items-center font-semibold">Go to How you earn PTO</a>
      </div>
    </div>
  );
}

/**
 * The answer panel of /policy: "how much PTO will I have on this date?". The projected
 * balance is the marked hero figure; under it the same forecast is written out as an
 * equation (current + accrual - scheduled - expiration) so the number can be checked.
 */
export function QuickForecast({ policy, balanceEntered = true, inputIssue, accrualIssue, requests = [], forecastDate, onForecastDateChange, onForecastUsed, upcomingLoss, children }: QuickForecastProps) {
  const dateId = useId();
  const [showExplanation, setShowExplanation] = useState(false);
  const unlimited = policy.accrual.kind === 'unlimited';
  // Blank is "not entered yet", never 0: say what the answer will be instead of showing one.
  const missing = balanceEntered ? inputIssue : blankBalanceMessage(forecastDate, policy.balanceAsOf);
  const forecast = unlimited || !missing ? forecastWithRequests(policy, forecastDate, requests) : null;
  const balanceOnly = !unlimited && balanceEntered && missing !== undefined && missing === accrualIssue
    ? forecastWithRequests(withoutAccrual(policy), forecastDate, requests) : null;
  const unit = policy.unit;
  const confirmed = forecast?.confirmed;
  const tentative = forecast?.tentative;
  // The optional explanation runs only when requested; the default live forecast stays fast.
  const explanation = showExplanation && forecast ? explainConnectedPolicy(policy, forecastDate, requests) : null;
  const presets = forecastPresets(policy.balanceAsOf);
  return (
    <section aria-labelledby={`${dateId}-heading`} className="min-w-0 rounded-[10px] border border-ink bg-surface p-4 sm:p-6">
      <h2 id={`${dateId}-heading`} className="text-h2 font-bold type-condensed text-ink">PTO balance forecast</h2>
      {children}
      <label htmlFor={dateId} className={`${children ? 'mt-5 border-t border-line pt-4' : 'mt-3'} block text-sm font-semibold text-ink`}>Forecast my balance on</label>
      <input
        id={dateId} type="date" min={policy.balanceAsOf} value={forecastDate}
        className="mt-1.5 h-11 w-full min-w-0 rounded-[6px] border border-line-strong bg-surface px-3 text-base text-ink"
        onChange={(event) => { onForecastDateChange(event.target.value); onForecastUsed?.(); }}
      />
      {presets.length > 0 && (
        <div role="group" aria-label="Quick forecast dates" className="mt-2 grid grid-cols-2 gap-1 min-[360px]:grid-cols-4">
          {presets.map((preset) => (
            <button
              key={preset.key}
              type="button"
              aria-pressed={forecastDate === preset.date}
              className="min-h-11 min-w-0 rounded-[6px] border border-line-strong bg-surface px-1 text-sm font-semibold text-ink transition-colors duration-150 hover:border-ink hover:bg-surface-alt aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-white"
              onClick={() => { onForecastDateChange(preset.date); onForecastUsed?.(); }}
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}
      {presets.length > 0 && <p className="mt-1.5 text-xs leading-5 text-muted">Shortcuts count from your balance date, {compactDate(policy.balanceAsOf)}.</p>}
      {unlimited ? (
        <p className="mt-5 border-t border-line pt-4 text-base text-ink">Unlimited PTO has no banked balance to forecast. Track your planned time off and check your employer&apos;s approval rules.</p>
      ) : !forecast && balanceOnly ? (
        <BalanceOnly policy={policy} forecast={balanceOnly} forecastDate={forecastDate} accrualIssue={accrualIssue!} />
      ) : !forecast ? (
        <p role="status" className="mt-5 border-t border-line pt-4 text-sm text-ink">{missing ?? validateCurrentCarriedBalance(policy) ?? 'Enter a valid date on or after your balance as-of date, within ten years, and valid policy amounts.'}</p>
      ) : confirmed && tentative ? (
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-sm text-muted">Estimated available PTO on {compactDate(forecastDate)}</p>
          <p className="mt-1 flex items-baseline gap-2 text-ink" aria-live="polite">
            <span className="mark text-display-sm type-display tabular-nums">{number(confirmed.balance ?? 0)}</span>{' '}
            <span className="text-lg font-semibold">{unit}</span>
          </p>
          {upcomingLoss && (
            <p role="status" className="mt-3 flex gap-2 text-sm font-semibold text-ink">
              <span aria-hidden="true" className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-warning text-xs font-bold text-white">!</span>
              <span>
                {compactDatesIn(upcomingLoss.text)}{' '}
                <span className="font-normal">
                  {upcomingLoss.expirationDate > forecastDate
                    ? `That happens after ${compactDate(forecastDate)}, so it is not in this number. `
                    : ''}
                  Last day to use it: {compactDate(upcomingLoss.deadline)}.{' '}
                  <a href="#expiration" className="link-mark font-semibold">What you could lose</a>
                </span>
              </span>
            </p>
          )}
          <dl className="mt-3 text-sm" aria-label="How the projected balance adds up">
            <EquationRow op="" label={`Current balance on ${compactDate(policy.balanceAsOf)}`} value={`${number(policy.currentBalance)} ${unit}`} />
            <EquationRow op="+" label="Expected accrual" value={`${signed('+', confirmed.accrued)} ${unit}`} />
            <EquationRow op="−" label="Scheduled PTO" value={`${signed('−', confirmed.scheduled)} ${unit}`} />
            <EquationRow op="−" label="Expected expiration" value={`${signed('−', confirmed.expired)} ${unit}`} />
            <EquationRow op="=" label="Projected balance" value={`${number(confirmed.balance ?? 0)} ${unit}`} strong />
          </dl>
          <p className="mt-3 text-xs leading-5 text-muted">Subject to your cap, resets and borrowing limit. {policy.balanceIncludesApprovedLeave
            ? 'Approved leave is already included in the balance you entered and is not deducted again.'
            : 'Scheduled PTO counts approved and completed requests, plus dates entered directly in your policy.'} Days on or before {compactDate(policy.balanceAsOf)} are already in your balance.</p>
          {unit === 'days' && requests.some(request => request.ptoMinutes !== undefined) && (
            <p className="mt-2 text-xs leading-5 text-muted">A full hourly day counts as one day. A partial day counts as its share of that day's shift: half a shift is 0.5 day. Select hours to forecast the recorded hours.</p>
          )}
          {confirmed.unfunded > 0.000001 && (
            <p role="status" className="mt-4 flex gap-2 rounded-[10px] border border-ink bg-accent-soft p-3 text-sm text-ink">
              <span aria-hidden="true" className="mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-[2px] bg-accent" />
              <span>Your scheduled leave exceeds the estimated balance by {number(confirmed.unfunded)} {unit}. The displayed balance stops at your borrowing limit; that does not make this leave affordable.</span>
            </p>
          )}
          {tentative.scheduled > confirmed.scheduled && (
            <div className="mt-3 border-t border-line pt-3 text-sm text-ink">
              Including planned and requested leave: <strong>{number(tentative.balance ?? 0)} {unit}</strong> projected.
              {tentative.unfunded > 0.000001 && <p className="mt-1">This scenario has an estimated shortfall of {number(tentative.unfunded)} {unit}.</p>}
              <p className="mt-1 text-xs text-muted">Tentative requests do not reduce the confirmed projection.</p>
            </div>
          )}
          {forecast.conflicts.length > 0 && <p className="mt-4 text-sm text-muted">Some tracked requests overlap. Each PTO date is deducted only once.</p>}
        </div>
      ) : null}
      {forecast && (
        <div className="mt-4">
          <button
            type="button"
            aria-expanded={showExplanation}
            aria-controls={showExplanation ? `${dateId}-policy-explanation` : undefined}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-ink underline decoration-1 underline-offset-[0.22em] transition-colors duration-150 hover:decoration-2"
            onClick={() => setShowExplanation((open) => !open)}
          >
            {showExplanation ? 'Hide policy explanation' : 'Explain this forecast using my policy'}
          </button>
          {showExplanation && (
            <div id={`${dateId}-policy-explanation`} className="mt-2 space-y-3">
              <p className="text-sm text-muted">These are explanations of the policy you entered, calculated using the same forecast as your balance. They are not a legal determination or an employer-policy verification.</p>
              {explanation ? (
                <div className="divide-y divide-line border-y border-line">
                  {explanation.rules.map((rule) => (
                    <details key={rule.id} className="py-1">
                      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-ink">{rule.title}</summary>
                      <div className="pb-3">
                        <p className="text-sm text-ink">{rule.explanation}</p>
                        <p className="mt-2 text-sm text-muted">{rule.example}</p>
                        <p className="mt-2 text-sm text-muted"><strong className="text-ink">Ask HR:</strong> {rule.hrQuestion}</p>
                      </div>
                    </details>
                  ))}
                </div>
              ) : (
                <p role="status" className="text-sm text-muted">These policy assumptions could not be explained for the selected date.</p>
              )}
              {explanation && <a className="link-mark inline-flex min-h-11 items-center text-sm font-semibold" href="/glossary">Learn how PTO policies work</a>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
