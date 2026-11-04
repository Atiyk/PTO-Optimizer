import { useId, useState, type ReactNode } from 'react';
import { validateCurrentCarriedBalance, type TimeOffPolicy } from '../policy/model';
import { forecastWithRequests } from '../personal/forecast';
import { explainConnectedPolicy } from '../personal/policyExplanation';
import type { PtoRequest } from '../personal/requestLedger';
import { forecastPresets } from './forecastPresets';
import { compactDate, compactDatesIn } from './compactDate';

export interface QuickForecastProps {
  policy: TimeOffPolicy;
  requests?: readonly PtoRequest[];
  forecastDate: string;
  onForecastDateChange: (date: string) => void;
  onForecastUsed?: () => void;
  /** The soonest loss the policy causes (from the same expiration check as the guard), so
   * the answer can say it beside the figure instead of only further down the page. */
  upcomingLoss?: { text: string; deadline: string; expirationDate: string };
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
 * The answer panel of /policy: "how much PTO will I have on this date?". The projected
 * balance is the marked hero figure; under it the same forecast is written out as an
 * equation (current + accrual - scheduled - expiration) so the number can be checked.
 */
export function QuickForecast({ policy, requests = [], forecastDate, onForecastDateChange, onForecastUsed, upcomingLoss }: QuickForecastProps) {
  const dateId = useId();
  const [showExplanation, setShowExplanation] = useState(false);
  const forecast = forecastWithRequests(policy, forecastDate, requests);
  const unit = policy.unit;
  const confirmed = forecast?.confirmed;
  const tentative = forecast?.tentative;
  // The optional explanation runs only when requested; the default live forecast stays fast.
  const explanation = showExplanation && forecast ? explainConnectedPolicy(policy, forecastDate, requests) : null;
  const presets = forecastPresets(policy.balanceAsOf);
  return (
    <section aria-labelledby={`${dateId}-heading`} className="min-w-0 rounded-[4px] border border-ink bg-surface p-4 sm:p-6">
      <h2 id={`${dateId}-heading`} className="text-h2 font-bold type-condensed text-ink">PTO balance forecast</h2>
      <label htmlFor={dateId} className="mt-3 block text-sm font-semibold text-ink">Forecast my balance on</label>
      <input
        id={dateId} type="date" min={policy.balanceAsOf} value={forecastDate}
        className="mt-1.5 h-11 w-full min-w-0 rounded-[3px] border border-line-strong bg-surface px-3 text-base text-ink"
        onChange={(event) => { onForecastDateChange(event.target.value); onForecastUsed?.(); }}
      />
      {presets.length > 0 && (
        <div role="group" aria-label="Quick forecast dates" className="mt-2 grid grid-cols-2 gap-1 min-[360px]:grid-cols-4">
          {presets.map((preset) => (
            <button
              key={preset.key}
              type="button"
              aria-pressed={forecastDate === preset.date}
              className="min-h-11 min-w-0 rounded-[3px] border border-line-strong bg-surface px-1 text-sm font-semibold text-ink transition-colors duration-150 hover:border-ink hover:bg-accent-soft aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-white"
              onClick={() => { onForecastDateChange(preset.date); onForecastUsed?.(); }}
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}
      <p className="mt-1.5 text-xs leading-5 text-muted">Shortcuts count from your balance date, {compactDate(policy.balanceAsOf)}.</p>
      {!forecast ? (
        <p role="status" className="mt-5 border-t border-line pt-4 text-sm text-ink">{validateCurrentCarriedBalance(policy) ?? 'Enter a valid date on or after your balance as-of date, within ten years, and valid policy amounts.'}</p>
      ) : policy.accrual.kind === 'unlimited' ? (
        <p className="mt-5 border-t border-line pt-4 text-base text-ink">Unlimited PTO has no banked balance to forecast. Track your planned time off and check your employer&apos;s approval rules.</p>
      ) : confirmed && tentative ? (
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-sm text-muted">Estimated available PTO on {compactDate(forecastDate)}</p>
          <p className="mt-1 flex items-baseline gap-2 text-ink" aria-live="polite">
            <span className="mark text-display-sm type-display tabular-nums">{number(confirmed.balance ?? 0)}</span>{' '}
            <span className="text-lg font-semibold">{unit}</span>
          </p>
          {upcomingLoss && (
            <p role="status" className="mt-3 flex gap-2 text-sm font-semibold text-ink">
              <span aria-hidden="true" className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center bg-ink text-xs font-bold text-white">!</span>
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
            <EquationRow op="" label={policy.currentBalance === 0 ? 'Current balance (not entered yet)' : `Current balance on ${compactDate(policy.balanceAsOf)}`} value={`${number(policy.currentBalance)} ${unit}`} />
            <EquationRow op="+" label="Expected accrual" value={`${signed('+', confirmed.accrued)} ${unit}`} />
            <EquationRow op="−" label="Scheduled PTO" value={`${signed('−', confirmed.scheduled)} ${unit}`} />
            <EquationRow op="−" label="Expected expiration" value={`${signed('−', confirmed.expired)} ${unit}`} />
            <EquationRow op="=" label="Projected balance" value={`${number(confirmed.balance ?? 0)} ${unit}`} strong />
          </dl>
          <p className="mt-3 text-xs leading-5 text-muted">Subject to your cap, resets and borrowing limit. Scheduled PTO counts approved requests and planned days in your policy; days on or before {compactDate(policy.balanceAsOf)} are already in your balance.</p>
          {confirmed.unfunded > 0.000001 && (
            <p role="status" className="mt-4 flex gap-2 rounded-[4px] border border-ink bg-accent-soft p-3 text-sm text-ink">
              <span aria-hidden="true" className="mt-1.5 inline-block h-2.5 w-2.5 shrink-0 bg-ink" />
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
            className="inline-flex min-h-11 items-center text-sm font-semibold text-ink underline decoration-1 underline-offset-[0.22em] transition-colors duration-150 hover:bg-mark"
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
