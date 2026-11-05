import { useId, useState } from 'react';
import type { TimeOffPolicy } from '../policy/model';
import type { PtoRequest } from '../personal/requestLedger';
import { estimateDeparturePayout, type CompanyPayoutRule } from '../personal/payoutEstimate';

type PayMode = 'hourly' | 'annual';
type EmployerRule = CompanyPayoutRule['kind'];
const input = 'mt-1.5 h-11 w-full min-w-0 rounded-[6px] border border-line-strong bg-surface px-3 text-base font-normal text-ink';
const selectCls = 'select-ink mt-1.5 h-11 w-full min-w-0 text-base font-normal';
const labelCls = 'block min-w-0 text-sm font-semibold text-ink';
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
    <section id="departure-payout" aria-labelledby={id + '-heading'} className="scroll-mt-24">
      <h2 id={id + '-heading'} className="text-h2 font-bold type-condensed text-ink">What might my unused vacation be worth?</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
        If you left on a given date: a <strong className="text-ink">gross employer-policy scenario</strong> from the balance and accrual above,
        not a legal entitlement or take-home pay. Employment-law coverage is not yet verified for any jurisdiction.
      </p>
      <div className="mt-5 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="min-w-0">
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <label className={labelCls}>
              Work jurisdiction (where you work)
              <input className={input} type="text" value={workJurisdiction} maxLength={120}
                onChange={e => setWorkJurisdiction(e.target.value)} placeholder="e.g., New York, US" autoComplete="off" />
            </label>
            <label className={labelCls}>
              Departure date
              <input className={input} type="date" min={policy.balanceAsOf} value={departureDate}
                onChange={e => setDepartureDate(e.target.value)} />
            </label>
            <label className={labelCls}>
              Pay type
              <select className={selectCls} value={payMode} onChange={e => setPayMode(e.target.value as PayMode)}>
                <option value="hourly">Hourly pay</option>
                <option value="annual">Annual salary</option>
              </select>
            </label>
            <label className={labelCls}>
              {payMode === 'hourly' ? 'Hourly pay (gross)' : 'Annual salary (gross)'}
              <input className={input} type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                min="0.01" step="any" inputMode="decimal" placeholder="Enter your pay" />
            </label>
            {payMode === 'annual' && (
              <label className={labelCls}>
                Annual working hours
                <input className={input} type="number" min="1" max="10000" value={annualHours}
                  onChange={e => setAnnualHours(e.target.value)} inputMode="decimal" />
              </label>
            )}
            <label className={labelCls}>
              Pay currency (no conversion)
              <select className={selectCls} value={currency} onChange={e => setCurrency(e.target.value)}>
                <option value="USD">USD</option><option value="GBP">GBP</option>
                <option value="CAD">CAD</option><option value="AUD">AUD</option>
                <option value="EUR">EUR</option><option value="INR">INR</option>
              </select>
            </label>
            <label className={labelCls}>
              Employer payout assumption
              <select className={selectCls} value={companyRule} onChange={e => setCompanyRule(e.target.value as EmployerRule)}>
                <option value="unknown">I do not know yet</option>
                <option value="pays-all">Pays all unused vacation</option>
                <option value="pays-up-to">Pays up to a cap</option>
                <option value="pays-none">Says it pays none</option>
              </select>
            </label>
            {companyRule === 'pays-up-to' && (
              <label className={labelCls}>
                Payout cap ({policy.unit})
                <input className={input} type="number" min="0" step="any" inputMode="decimal"
                  value={cap} onChange={e => setCap(e.target.value)} />
              </label>
            )}
          </div>
          <label className="mt-4 flex min-h-11 items-center gap-3 text-sm text-ink">
            <input type="checkbox" checked={includeTrackedVacation} className="h-5 w-5 shrink-0"
              onChange={e => setIncludeTrackedVacation(e.target.checked)} />
            Count my tracked PTO requests as vacation (only if they really are vacation)
          </label>
          <p className="text-xs leading-5 text-muted">
            Your request tracker does not classify leave types. Without this, only the planned dates in your policy affect the estimate.
          </p>
        </div>
        <div className="min-w-0 self-start border-t-2 border-ink pt-4 lg:border-l lg:border-t-0 lg:border-line lg:pl-6 lg:pt-0">
          {!complete ? (
            <p role="status" className="text-sm text-ink">
              Enter your work jurisdiction and pay rate to see a company-policy scenario. An unknown employer rule cannot produce a payout amount.
            </p>
          ) : !result || !line ? (
            <p role="alert" className="text-sm text-ink">
              These inputs cannot produce a valid payout scenario. Check the departure date, policy amounts, pay, and any payout cap.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted">Estimated gross payout under this employer rule</p>
              {result.totalCompanyGrossCents === null ? (
                <p role="status" className="mt-1 text-lg font-semibold text-ink">
                  {line.status === 'unsupported-unlimited'
                    ? 'Unlimited vacation has no banked cash balance to estimate.'
                    : 'Payout amount unknown until you confirm the employer rule.'}
                </p>
              ) : (
                <p aria-live="polite" className="mt-1 break-words text-h1 type-display tabular-nums text-ink">
                  {money(result.totalCompanyGrossCents, currency)}
                </p>
              )}
              <dl className="mt-4 divide-y divide-line border-t border-line text-sm">
                <div className="flex justify-between gap-3 py-1.5"><dt className="text-muted">Projected unused vacation</dt><dd className="text-right font-semibold text-ink">{line.status === 'unsupported-unlimited' ? 'Not banked' : units(line.unusedUnits) + ' ' + line.unit}</dd></div>
                <div className="flex justify-between gap-3 py-1.5"><dt className="text-muted">Earned by departure</dt><dd className="text-right font-semibold text-ink">{units(line.forecast.accrued)} {line.unit}</dd></div>
                <div className="flex justify-between gap-3 py-1.5"><dt className="text-muted">Scheduled time off</dt><dd className="text-right font-semibold text-ink">{units(line.forecast.scheduled)} {line.unit}</dd></div>
                <div className="flex justify-between gap-3 py-1.5"><dt className="text-muted">Eligible under this assumption</dt><dd className="text-right font-semibold text-ink">{line.payableUnits === null ? 'Unknown' : units(line.payableUnits) + ' ' + line.unit}</dd></div>
              </dl>
              <p className="mt-3 text-xs leading-5 text-muted">
                Payable vacation hours times your hourly rate (or annual salary divided by annual hours). Accrual, approved leave and resets use the same forecast. Not a tax or payroll estimate.
              </p>
            </>
          )}
        </div>
      </div>
      <div className="mt-5 max-w-3xl space-y-2 border-t border-line pt-4 text-sm leading-6 text-muted">
        <p><strong className="text-ink">Employment law is not verified here.</strong> A company’s stated rule may differ from mandatory rights. We do not calculate legal entitlement or resolve that difference.</p>
        <p><strong className="text-ink">Confirm with HR:</strong> Is unused vacation paid at departure, which leave categories qualify, is there a cap, and what are the final accrual and pay-period rules?</p>
        <a href="/glossary/payout" className="link-mark inline-flex min-h-11 items-center font-semibold">
          Read the guide to unused PTO at departure
        </a>
      </div>
    </section>
  );
}
