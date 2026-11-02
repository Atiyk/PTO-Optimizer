import { useId } from 'react';
import { validateCurrentCarriedBalance, type TimeOffPolicy } from '../policy/model';
import { forecastWithRequests } from '../personal/forecast';
import type { PtoRequest } from '../personal/requestLedger';

export interface QuickForecastProps {
  policy: TimeOffPolicy;
  requests?: readonly PtoRequest[];
  forecastDate: string;
  onForecastDateChange: (date: string) => void;
  onForecastUsed?: () => void;
}

const number = (value: number) => new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(value);

export function QuickForecast({ policy, requests = [], forecastDate, onForecastDateChange, onForecastUsed }: QuickForecastProps) {
  const dateId = useId();
  const forecast = forecastWithRequests(policy, forecastDate, requests);
  const unit = policy.unit;
  const confirmed = forecast?.confirmed;
  const tentative = forecast?.tentative;
  return (
    <section aria-labelledby={`${dateId}-heading`} className="min-w-0 rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <h2 id={`${dateId}-heading`} className="text-xl font-semibold text-ink">PTO balance forecast</h2>
      <p className="mt-1 text-sm text-muted">An estimate based on your policy and the requests you track in this browser.</p>
      <label htmlFor={dateId} className="mt-5 block text-sm font-medium text-ink">Forecast my balance on</label>
      <input
        id={dateId} type="date" min={policy.balanceAsOf} value={forecastDate}
        className="mt-2 h-11 w-full min-w-0 rounded-lg border border-line-strong bg-surface px-3 text-ink sm:w-auto"
        onChange={(event) => { onForecastDateChange(event.target.value); onForecastUsed?.(); }}
      />
      {!forecast ? (
        <p role="status" className="mt-4 text-sm text-muted">{validateCurrentCarriedBalance(policy) ?? 'Enter a valid date on or after your balance as-of date, within ten years, and valid policy amounts.'}</p>
      ) : policy.accrual.kind === 'unlimited' ? (
        <p className="mt-5 text-base text-ink">Unlimited PTO has no banked balance to forecast. Track your planned time off and check your employer&apos;s approval rules.</p>
      ) : confirmed && tentative ? (
        <>
          <p className="mt-5 text-sm text-muted">Estimated available PTO on {forecastDate}</p>
          <p className="mt-1 text-4xl font-semibold tracking-tight text-ink" aria-live="polite">{number(confirmed.balance ?? 0)} <span className="text-lg font-medium">{unit}</span></p>
          <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 text-sm">
            <div><dt className="text-muted">Current balance</dt><dd className="mt-1 font-semibold text-ink">{number(policy.currentBalance)} {unit}</dd></div>
            <div><dt className="text-muted">Expected accrual</dt><dd className="mt-1 font-semibold text-ink">+{number(confirmed.accrued)} {unit}</dd></div>
            <div><dt className="text-muted">Scheduled PTO</dt><dd className="mt-1 font-semibold text-ink">−{number(confirmed.scheduled)} {unit}</dd></div>
            <div><dt className="text-muted">Expected expiration</dt><dd className="mt-1 font-semibold text-ink">−{number(confirmed.expired)} {unit}</dd></div>
          </dl>
          <p className="mt-4 text-xs leading-5 text-muted">Current balance + credited accrual − scheduled PTO − expiration = projected balance, subject to your cap, resets, and borrowing allowance. Scheduled PTO includes approved requests and the planned days entered in your policy. Days on or before {policy.balanceAsOf} are already covered by your current balance.</p>
          {confirmed.unfunded > 0.000001 && <p role="status" className="mt-4 rounded-lg border border-accent bg-accent-soft p-3 text-sm text-accent-ink">Your scheduled leave exceeds the estimated balance by {number(confirmed.unfunded)} {unit}. The displayed balance stops at your borrowing limit; that does not make this leave affordable.</p>}
          {tentative.scheduled > confirmed.scheduled && (
            <div className="mt-4 rounded-lg bg-surface-alt p-3 text-sm text-ink">
              Including planned and requested leave: <strong>{number(tentative.balance ?? 0)} {unit}</strong> projected.
              {tentative.unfunded > 0.000001 && <p className="mt-1">This scenario has an estimated shortfall of {number(tentative.unfunded)} {unit}.</p>}
              <p className="mt-1 text-xs text-muted">Tentative requests do not reduce the confirmed projection.</p>
            </div>
          )}
          {forecast.conflicts.length > 0 && <p className="mt-4 text-sm text-muted">Some tracked requests overlap. Each PTO date is deducted only once.</p>}
        </>
      ) : null}
    </section>
  );
}
