import { useId, useState } from 'react';
import type { TimeOffPolicy } from '../policy/model';
import type { PtoRequest } from '../personal/requestLedger';
import { estimateDeparturePayout, type CompanyPayoutRule } from '../personal/payoutEstimate';

type PayMode = 'hourly' | 'annual';
type EmployerRule = CompanyPayoutRule['kind'];
const input = 'mt-2 h-11 w-full min-w-0 rounded-lg border border-line-strong bg-surface px-3 text-base text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
const money = (cents: number, currency: string) =>
  new Intl.NumberFormat('en', { style: 'currency', currency }).format(cents / 100);
const units = (value: number) => new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(value);

/**
 * Local-only, company-policy what-if. The work jurisdiction is recorded as user input,
 * never treated as a verified legal rule. The current request ledger lacks leave type;
 * it is incorporated only with explicit user confirmation that entries are vacation.
 * No pay, jurisdiction, balance or request input is written to URLs or analytics here.
 */
export function DeparturePayoutEstimator({
  policy, requests = [],
}: { policy: TimeOffPolicy; requests?: readonly PtoRequest[] }) {
  const id = useId();
  const [departureDate, setDepartureDate] = useState(policy.balanceAsOf);
  const [workJurisdiction, setWorkJurisdiction] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [payMode, setPayMode] = useState<PayMode>('hourly');
  const [payAmount, setPayAmount] = useState('');
  const [annualHours, setAnnualHours] = useState('2080');
  const [companyRule, setCompanyRule] = useState<EmployerRule>('unknown');
  const [cap, setCap] = useState('');
  const [includeTrackedVacation, setIncludeTrackedVacation] = useState(false);
  const pay = payMode === 'hourly'
    ? { kind: 'hourly' as const, hourlyRate: Number(payAmount) }
    : { kind: 'annual' as const, annualSalary: Number(payAmount), annualWorkHours: Number(annualHours) };
  const rule: CompanyPayoutRule = companyRule === 'pays-up-to'
    ? { kind: 'pays-up-to', cap: Number(cap) }
    : { kind: companyRule };
  const complete = workJurisdiction.trim().length > 0 && payAmount.trim() !== ''
    && Number.isFinite(Number(payAmount)) && Number(payAmount) > 0
    && (companyRule !== 'pays-up-to' || cap.trim() !== '');
  const result = complete ? estimateDeparturePayout({
    departureDate, workJurisdiction: workJurisdiction.trim(), currency, pay,
    lines: [{ category: 'vacation', policy, requests: includeTrackedVacation ? requests : [], companyRule: rule }],
  }) : null;
  const line = result?.lines[0];

  return (
    <section id="departure-payout" aria-labelledby={id + '-heading'} className="mt-8 scroll-mt-24 rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-accent-ink">Departure planning</p>
      <h2 id={id + '-heading'} className="mt-2 text-xl font-semibold text-ink">What might my unused vacation be worth?</h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
        Estimate a <strong>gross employer-policy scenario</strong>, not a legal entitlement or take-home pay.
        This uses the vacation balance and accrual settings above. Employment-law coverage is not yet verified for any jurisdiction.
      </p>
      <div className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <label className="block min-w-0 text-sm font-medium text-ink">
          Work jurisdiction (where you work)
          <input className={input} type="text" value={workJurisdiction} maxLength={120}
            onChange={e => setWorkJurisdiction(e.target.value)} placeholder="e.g., New York, US" autoComplete="off" />
        </label>
        <label className="block min-w-0 text-sm font-medium text-ink">
          Departure date
          <input className={input} type="date" min={policy.balanceAsOf} value={departureDate}
            onChange={e => setDepartureDate(e.target.value)} />
        </label>
        <label className="block min-w-0 text-sm font-medium text-ink">
          Pay type
          <select className={input} value={payMode} onChange={e => setPayMode(e.target.value as PayMode)}>
            <option value="hourly">Hourly pay</option>
            <option value="annual">Annual salary</option>
          </select>
        </label>
        <label className="block min-w-0 text-sm font-medium text-ink">
          {payMode === 'hourly' ? 'Hourly pay (gross)' : 'Annual salary (gross)'}
          <input className={input} type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)}
            min="0.01" step="any" inputMode="decimal" placeholder="Enter your pay" />
        </label>
        {payMode === 'annual' && (
          <label className="block min-w-0 text-sm font-medium text-ink">
            Annual working hours
            <input className={input} type="number" min="1" max="10000" value={annualHours}
              onChange={e => setAnnualHours(e.target.value)} inputMode="decimal" />
          </label>
        )}
        <label className="block min-w-0 text-sm font-medium text-ink">
          Pay currency (no conversion)
          <select className={input} value={currency} onChange={e => setCurrency(e.target.value)}>
            <option value="USD">USD</option><option value="GBP">GBP</option>
            <option value="CAD">CAD</option><option value="AUD">AUD</option>
            <option value="EUR">EUR</option><option value="INR">INR</option>
          </select>
        </label>
        <label className="block min-w-0 text-sm font-medium text-ink">
          Employer payout assumption
          <select className={input} value={companyRule} onChange={e => setCompanyRule(e.target.value as EmployerRule)}>
            <option value="unknown">I do not know yet</option>
            <option value="pays-all">Pays all unused vacation</option>
            <option value="pays-up-to">Pays up to a cap</option>
            <option value="pays-none">Says it pays none</option>
          </select>
        </label>
        {companyRule === 'pays-up-to' && (
          <label className="block min-w-0 text-sm font-medium text-ink">
            Payout cap ({policy.unit})
            <input className={input} type="number" min="0" step="any" inputMode="decimal"
              value={cap} onChange={e => setCap(e.target.value)} />
          </label>
        )}
      </div>
      <label className="mt-5 flex min-h-11 max-w-3xl items-center gap-3 text-sm text-ink">
        <input type="checkbox" checked={includeTrackedVacation} className="h-5 w-5 shrink-0"
          onChange={e => setIncludeTrackedVacation(e.target.checked)} />
        Count tracked PTO requests as vacation in this scenario (only enable if they really are vacation requests).
      </label>
      <p className="mt-1 max-w-3xl text-xs text-muted">
        Your request tracker does not classify leave types. Without this confirmation, only the policy’s entered planned dates affect this estimate.
      </p>
      {!complete ? (
        <p role="status" className="mt-5 rounded-lg bg-surface-alt p-4 text-sm text-muted">
          Enter your work jurisdiction and pay rate to see a company-policy scenario. An unknown employer rule cannot produce a payout amount.
        </p>
      ) : !result || !line ? (
        <p role="alert" className="mt-5 rounded-lg border border-line-strong p-4 text-sm text-ink">
          These inputs cannot produce a valid payout scenario. Check the departure date, policy amounts, pay, and any payout cap.
        </p>
      ) : (
        <div className="mt-6 rounded-xl bg-surface-alt p-4 sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Employer-policy scenario • estimated gross</p>
          {result.totalCompanyGrossCents === null ? (
            <p role="status" className="mt-2 text-lg font-semibold text-ink">
              {line.status === 'unsupported-unlimited'
                ? 'Unlimited vacation has no banked cash balance to estimate.'
                : 'Payout amount unknown until you confirm the employer rule.'}
            </p>
          ) : (
            <p aria-live="polite" className="mt-2 text-3xl font-semibold tabular-nums text-ink sm:text-4xl">
              {money(result.totalCompanyGrossCents, currency)}
            </p>
          )}
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div><dt className="text-muted">Projected unused vacation</dt><dd className="mt-1 font-semibold text-ink">{line.status === 'unsupported-unlimited' ? 'Not banked' : units(line.unusedUnits) + ' ' + line.unit}</dd></div>
            <div><dt className="text-muted">Earned by departure</dt><dd className="mt-1 font-semibold text-ink">{units(line.forecast.accrued)} {line.unit}</dd></div>
            <div><dt className="text-muted">Scheduled time off</dt><dd className="mt-1 font-semibold text-ink">{units(line.forecast.scheduled)} {line.unit}</dd></div>
            <div><dt className="text-muted">Eligible under this assumption</dt><dd className="mt-1 font-semibold text-ink">{line.payableUnits === null ? 'Unknown' : units(line.payableUnits) + ' ' + line.unit}</dd></div>
          </dl>
          <p className="mt-4 text-xs leading-relaxed text-muted">
            Gross money equals assumed payable vacation hours times your entered hourly rate (or annual salary divided by entered annual hours).
            Accrual, approved leave and policy resets use the existing forecast. This is not a tax or payroll estimate.
          </p>
        </div>
      )}
      <div className="mt-5 space-y-2 text-sm text-muted">
        <p><strong className="text-ink">Employment law is not verified here.</strong> A company’s stated rule may differ from mandatory rights. We do not calculate legal entitlement or resolve that difference.</p>
        <p><strong className="text-ink">Confirm with HR:</strong> Is unused vacation paid at departure, which leave categories qualify, is there a cap, and what are the final accrual and pay-period rules?</p>
        <a href="/glossary/payout" className="inline-flex min-h-11 items-center font-semibold text-accent-ink underline underline-offset-4">
          Read the guide to unused PTO at departure
        </a>
      </div>
    </section>
  );
}
