import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { TimeOffPolicy } from '../policy/model';
import type { PtoRequest } from '../personal/requestLedger';
import { EXPIRATION_REMINDER_LEADS, expirationReminders, expirationRisks, type ExpirationReminderLead } from '../personal/expiration';
import { forecastWithRequests } from '../personal/forecast';
import { carryoverSnapshot } from '../personal/carryoverSnapshot';
import { Button } from './Button';
import { downloadReminderICS } from './icsExport';
import { compactDate, compactDatesIn } from './compactDate';

const PREFS_KEY = 'gapless.personal.expiration.v1';
interface GuardPreferences { enabled: boolean; leads: ExpirationReminderLead[]; dismissed: string[] }
const DEFAULT_PREFS: GuardPreferences = { enabled: true, leads: [60, 30, 7], dismissed: [] };
const EMPTY_REQUESTS: readonly PtoRequest[] = [];

function loadPreferences(): GuardPreferences {
  try {
    if (typeof window === 'undefined') return DEFAULT_PREFS;
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw || raw.length > 10000) return DEFAULT_PREFS;
    const value = JSON.parse(raw);
    if (value.version !== 1 || typeof value.enabled !== 'boolean' || !Array.isArray(value.leads) || !Array.isArray(value.dismissed)) return DEFAULT_PREFS;
    return { enabled: value.enabled,
      leads: value.leads.filter((lead: unknown): lead is ExpirationReminderLead => typeof lead === 'number' && EXPIRATION_REMINDER_LEADS.includes(lead as ExpirationReminderLead)),
      dismissed: value.dismissed.filter((id: unknown) => typeof id === 'string' && id.length < 200).slice(0, 100) };
  } catch { return DEFAULT_PREFS; }
}

export interface ExpirationGuardProps {
  policy: TimeOffPolicy;
  country: string;
  requests?: readonly PtoRequest[];
  today?: string;
  onAlertViewed?: () => void;
  onAlertAction?: () => void;
}

export function ExpirationGuard({ policy, country, requests = EMPTY_REQUESTS, today, onAlertViewed, onAlertAction }: ExpirationGuardProps) {
  const id = useId();
  const [visitDate] = useState(() => new Date().toISOString().slice(0, 10));
  const effectiveToday = today ?? visitDate;
  const [prefs, setPrefs] = useState(loadPreferences);
  const [message, setMessage] = useState('');
  const viewed = useRef(new Set<string>());
  const validPolicy = useMemo(() => forecastWithRequests(policy, policy.balanceAsOf) !== null, [policy]);
  const risks = useMemo(() => expirationRisks(policy, country, requests, effectiveToday), [policy, country, requests, effectiveToday]);
  const visible = useMemo(() => prefs.enabled ? risks.filter((risk) => !prefs.dismissed.includes(risk.id)) : [], [prefs, risks]);
  const reminders = useMemo(() => expirationReminders(visible, prefs.leads, effectiveToday), [visible, prefs.leads, effectiveToday]);
  const [showReset, setShowReset] = useState(false);
  // Lazy: no extra reset projection until a user asks to inspect their next reset.
  const reset = useMemo(() => showReset ? carryoverSnapshot(policy, requests) : null, [showReset, policy, requests]);
  const fmt = (value: number) => new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(value);
  const planRisk = visible.find((risk) => risk.canPlan && risk.kind !== 'cap');
  useEffect(() => {
    for (const risk of visible) {
      if (!viewed.current.has(risk.id)) { viewed.current.add(risk.id); onAlertViewed?.(); }
    }
  }, [visible, onAlertViewed]);

  function update(next: GuardPreferences) {
    setPrefs(next);
    try { window.localStorage.setItem(PREFS_KEY, JSON.stringify({ version: 1, ...next })); setMessage('Reminder preferences saved in this browser.'); }
    catch { setMessage('Preferences changed for this visit. Browser storage is unavailable.'); }
  }

  return (
    <section aria-labelledby={`${id}-heading`} className="min-w-0 rounded-[4px] border border-line bg-surface p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        <h2 id={`${id}-heading`} className="text-lg font-bold type-condensed text-ink">PTO expiration guard</h2>
        <label className="flex min-h-11 items-center gap-2 text-sm text-muted"><input type="checkbox" className="h-4 w-4" checked={prefs.enabled} onChange={(event) => update({ ...prefs, enabled: event.target.checked })} />Show in-app alerts</label>
      </div>
      <p className="text-sm leading-6 text-muted">What you could lose under your balance, approved leave and policy. Requested leave is a separate scenario in the forecast.</p>
      {!prefs.enabled ? <p className="mt-3 text-sm text-muted">In-app expiration alerts are off in this browser.</p>
        : !validPolicy ? <p role="status" className="mt-3 text-sm text-ink">Enter valid policy values, including a current carried portion no greater than your balance and its future use-by date, to check expiration risk.</p>
          : visible.length === 0 ? (
            <p className="mt-3 flex items-start gap-2 text-sm text-ink">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="mt-0.5 shrink-0"><path d="M3 8.4 6.4 11.5 13 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" /></svg>
              <span>{risks.length ? 'All current alerts are dismissed.' : 'No upcoming forfeiture, carryover expiration, or accrual-cap risk found under these rules.'}</span>
            </p>
          )
          : <ul className="mt-3 divide-y divide-line border-t border-ink">{visible.map((risk) => (
            <li key={risk.id} className="py-3">
              <p className="flex items-start gap-2 font-bold text-ink">
                <span aria-hidden="true" className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center bg-ink text-xs font-bold text-white">!</span>
                <span>{compactDatesIn(risk.text)}</span>
              </p>
              <p className="mt-1 pl-7 text-sm text-ink">{risk.kind === 'cap' ? 'Creating space in your balance may prevent lost accrual.' : `Last day to use this PTO: ${compactDate(risk.deadline)}.`}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pl-7">
                {risk.canPlan ? <a href={risk.ptoHref} className="link-mark inline-flex min-h-11 items-center text-sm font-semibold" onClick={onAlertAction}>Find the best way to use those days →</a>
                  : <p className="text-sm text-ink">No additional whole PTO day is safely available to plan before this deadline under the entered rules. Review your forecast and policy.</p>}
                <Button variant="quiet" size="sm" className="min-h-11" onClick={() => update({ ...prefs, dismissed: [...prefs.dismissed, risk.id] })} aria-label={`Dismiss ${compactDatesIn(risk.text)}`}>Dismiss</Button>
              </div>
              {risk.canPlan && <p className="mt-1 pl-7 text-xs leading-5 text-muted">Plans up to {risk.planningBudget} whole PTO {risk.planningBudget === 1 ? 'day' : 'days'} once earned, reserving your scheduled leave. Check the optimizer&apos;s employer holidays and workweek.</p>}
            </li>
          ))}</ul>}
      {prefs.dismissed.length > 0 && <Button variant="quiet" size="sm" className="mt-2 min-h-11" onClick={() => update({ ...prefs, dismissed: [] })}>Show dismissed alerts</Button>}
      <div className="mt-4 border-t border-line">
        <button type="button" aria-expanded={showReset}
          className="flex min-h-11 w-full items-center justify-between gap-2 text-left text-sm font-semibold text-ink hover:underline"
          onClick={() => setShowReset((open) => !open)}>
          {showReset ? 'Hide next policy reset' : 'Review next policy reset'}
          <span aria-hidden="true" className="text-muted">{showReset ? '−' : '+'}</span>
        </button>
        {showReset && (!reset ? (
          <p role="status" className="pb-3 text-sm text-muted">
            {policy.accrual.kind === 'unlimited'
              ? 'Unlimited PTO has no banked carryover or forfeiture to project.'
              : 'A reset projection is not available. Check your dates and entered policy.'}
          </p>
        ) : (
          <div className="space-y-3 pb-3">
            <p className="text-sm text-muted">Based on the policy you entered, the next reset is <strong className="text-ink">{compactDate(reset.resetDate)}</strong>.
              These amounts include scheduled approved leave, and are estimates rather than employer-verified forfeiture.</p>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-muted">Before reset</dt><dd className="mt-0.5 font-semibold text-ink">{fmt(reset.confirmed.beforeResetBalance)} {reset.unit}</dd></div>
              <div><dt className="text-muted">Estimated carryover</dt><dd className="mt-0.5 font-semibold text-ink">{fmt(reset.confirmed.carriedAtReset)} {reset.unit}</dd></div>
              <div><dt className="text-muted">Potentially forfeited at reset</dt><dd className="mt-0.5 font-semibold text-ink">{fmt(reset.confirmed.forfeitedAtReset)} {reset.unit}</dd></div>
              <div><dt className="text-muted">After reset, including new credits</dt><dd className="mt-0.5 font-semibold text-ink">{fmt(reset.confirmed.afterResetBalance)} {reset.unit}</dd></div>
            </dl>
            <p className="text-xs leading-5 text-muted">
              New credits on reset: {fmt(reset.confirmed.creditedOnReset)} {reset.unit}.
              Accrual blocked by a cap through reset: {fmt(reset.confirmed.lostAccrualThroughReset)} {reset.unit}.
              Carried time expiring before reset: {fmt(reset.confirmed.carriedExpiredBeforeReset)} {reset.unit}.
            </p>
            {reset.tentative.scheduledThroughReset > reset.confirmed.scheduledThroughReset && (
              <p className="text-sm text-muted">
                Including requested and planned leave, estimated forfeiture becomes {fmt(reset.tentative.forfeitedAtReset)} {reset.unit}
                and the post-reset balance becomes {fmt(reset.tentative.afterResetBalance)} {reset.unit}. These requests are not approved.
              </p>
            )}
            {reset.carriedUseByDate && reset.carriedExpiry && (
              <p className="text-sm text-muted">
                Separate carried-time deadline: {compactDate(reset.carriedUseByDate)}.
                Estimated carried units expiring at that deadline: {fmt(reset.carriedExpiry.confirmed)} {reset.unit}.
              </p>
            )}
            {reset.deadlineNeedsReview && (
              <p role="status" className="text-sm text-muted">
                The entered carried-time deadline cannot be safely applied to this reset cycle. Confirm it with HR before planning around it.
              </p>
            )}
            {planRisk && (
              <a href={planRisk.ptoHref} onClick={onAlertAction} className="link-mark inline-flex min-h-11 items-center text-sm font-semibold">
                Find possible PTO days before the deadline
              </a>
            )}
          </div>
        ))}
      </div>
      <details className="group border-t border-line">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold text-ink hover:underline [&::-webkit-details-marker]:hidden">
          Calendar reminders
          <span aria-hidden="true" className="text-muted group-open:hidden">+</span>
          <span aria-hidden="true" className="hidden text-muted group-open:inline">−</span>
        </summary>
        <div className="pb-2">
          <p className="text-sm leading-6 text-muted">Download reminders before PTO expires. Import the file into your calendar to receive its alerts. Gapless does not send scheduled email or push notifications.</p>
          <div className="mt-1 flex flex-wrap gap-x-5">
            {EXPIRATION_REMINDER_LEADS.map((lead) => <label key={lead} className="flex min-h-11 items-center gap-2 text-sm text-ink"><input type="checkbox" className="h-4 w-4" checked={prefs.leads.includes(lead)} onChange={(event) => update({ ...prefs, leads: event.target.checked ? [...prefs.leads, lead] : prefs.leads.filter((value) => value !== lead) })} />{lead} days before</label>)}
          </div>
          <Button variant="secondary" className="mt-2" disabled={reminders.length === 0} onClick={() => {
            try { downloadReminderICS(reminders); setMessage('Calendar reminder download started. Import the file into your calendar.'); }
            catch { setMessage('The calendar file could not be downloaded. Try again.'); }
          }}>Download calendar reminders</Button>
          {reminders.length === 0 && <p className="mt-2 text-xs text-muted">No selected reminder dates remain in the future for the visible expiration alerts.</p>}
        </div>
      </details>
      {message && <p role="status" className="mt-2 text-sm text-muted">{message}</p>}
    </section>
  );
}
