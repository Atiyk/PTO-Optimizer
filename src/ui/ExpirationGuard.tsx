import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { TimeOffPolicy } from '../policy/model';
import type { PtoRequest } from '../personal/requestLedger';
import { EXPIRATION_REMINDER_LEADS, expirationReminders, expirationRisks, type ExpirationReminderLead } from '../personal/expiration';
import { forecastWithRequests } from '../personal/forecast';
import { carryoverSnapshot } from '../personal/carryoverSnapshot';
import { Button } from './Button';
import { downloadReminderICS } from './icsExport';

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
    <section aria-labelledby={`${id}-heading`} className="min-w-0 rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`${id}-heading`} className="text-xl font-semibold text-ink">PTO expiration guard</h2>
        <label className="flex min-h-11 items-center gap-2 text-sm text-muted"><input type="checkbox" checked={prefs.enabled} onChange={(event) => update({ ...prefs, enabled: event.target.checked })} />Show in-app alerts</label>
      </div>
      <p className="mt-1 text-sm leading-6 text-muted">Based on your current balance, approved leave, and the policy you entered. Planned and requested leave is a separate scenario in your balance forecast.</p>
      {!prefs.enabled ? <p className="mt-4 text-sm text-muted">In-app expiration alerts are off in this browser.</p>
        : !validPolicy ? <p role="status" className="mt-4 text-sm text-accent-ink">Enter valid policy values, including a current carried portion no greater than your balance and its future use-by date, to check expiration risk.</p>
          : visible.length === 0 ? <p className="mt-4 rounded-xl bg-surface-alt p-4 text-sm text-muted">{risks.length ? 'All current alerts are dismissed.' : 'No upcoming forfeiture, carryover expiration, or accrual-cap risk found under these rules.'}</p>
          : <ul className="mt-4 space-y-3">{visible.map((risk) => (
            <li key={risk.id} className="rounded-xl border border-accent bg-accent-soft p-4">
              <p className="font-semibold text-accent-ink">{risk.text}</p>
              <p className="mt-1 text-sm text-accent-ink">{risk.kind === 'cap' ? 'Creating space in your balance may prevent lost accrual.' : `Last day to use this PTO: ${risk.deadline}.`}</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {risk.canPlan ? <a href={risk.ptoHref} className="min-h-11 py-2 text-sm font-semibold text-accent-ink underline underline-offset-4" onClick={onAlertAction}>Find the best way to use those days →</a>
                  : <p className="text-sm text-accent-ink">No additional whole PTO day is safely available to plan before this deadline under the entered rules. Review your forecast and policy.</p>}
                <Button variant="quiet" size="sm" onClick={() => update({ ...prefs, dismissed: [...prefs.dismissed, risk.id] })} aria-label={`Dismiss ${risk.text}`}>Dismiss</Button>
              </div>
              {risk.canPlan && <p className="mt-2 text-xs leading-5 text-accent-ink">Plans up to {risk.planningBudget} whole PTO {risk.planningBudget === 1 ? 'day' : 'days'} once earned, reserving your scheduled leave. Check the optimizer&apos;s employer holidays and workweek.</p>}
            </li>
          ))}</ul>}
      {prefs.dismissed.length > 0 && <Button variant="quiet" size="sm" className="mt-3" onClick={() => update({ ...prefs, dismissed: [] })}>Show dismissed alerts</Button>}
      <div className="mt-5 rounded-xl border border-line bg-surface-alt p-4">
        <button type="button" aria-expanded={showReset}
          className="min-h-11 w-full text-left text-sm font-semibold text-ink underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          onClick={() => setShowReset((open) => !open)}>
          {showReset ? 'Hide next policy reset' : 'Review next policy reset'}
        </button>
        {showReset && (!reset ? (
          <p role="status" className="mt-3 text-sm text-muted">
            {policy.accrual.kind === 'unlimited'
              ? 'Unlimited PTO has no banked carryover or forfeiture to project.'
              : 'A reset projection is not available. Check your dates and entered policy.'}
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-muted">Based on the policy you entered, the next reset is <strong className="text-ink">{reset.resetDate}</strong>.
              These amounts include scheduled approved leave, and are estimates rather than employer-verified forfeiture.</p>
            <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div><dt className="text-muted">Before reset</dt><dd className="mt-1 font-semibold text-ink">{fmt(reset.confirmed.beforeResetBalance)} {reset.unit}</dd></div>
              <div><dt className="text-muted">Estimated carryover</dt><dd className="mt-1 font-semibold text-ink">{fmt(reset.confirmed.carriedAtReset)} {reset.unit}</dd></div>
              <div><dt className="text-muted">Potentially forfeited at reset</dt><dd className="mt-1 font-semibold text-ink">{fmt(reset.confirmed.forfeitedAtReset)} {reset.unit}</dd></div>
              <div><dt className="text-muted">After reset, including new credits</dt><dd className="mt-1 font-semibold text-ink">{fmt(reset.confirmed.afterResetBalance)} {reset.unit}</dd></div>
            </dl>
            <p className="text-xs leading-relaxed text-muted">
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
                Separate carried-time deadline: {reset.carriedUseByDate}.
                Estimated carried units expiring at that deadline: {fmt(reset.carriedExpiry.confirmed)} {reset.unit}.
              </p>
            )}
            {reset.deadlineNeedsReview && (
              <p role="status" className="text-sm text-muted">
                The entered carried-time deadline cannot be safely applied to this reset cycle. Confirm it with HR before planning around it.
              </p>
            )}
            {planRisk && (
              <a href={planRisk.ptoHref} onClick={onAlertAction} className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-ink underline underline-offset-4">
                Find possible PTO days before the deadline
              </a>
            )}
          </div>
        ))}
      </div>
      <details className="mt-5 rounded-xl bg-surface-alt p-4">
        <summary className="cursor-pointer font-medium text-ink">Calendar reminders</summary>
        <p className="mt-3 text-sm leading-6 text-muted">Download reminders before PTO expires. Import the file into your calendar to receive its alerts. Gapless does not send scheduled email or push notifications.</p>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
          {EXPIRATION_REMINDER_LEADS.map((lead) => <label key={lead} className="flex min-h-11 items-center gap-2 text-sm text-ink"><input type="checkbox" checked={prefs.leads.includes(lead)} onChange={(event) => update({ ...prefs, leads: event.target.checked ? [...prefs.leads, lead] : prefs.leads.filter((value) => value !== lead) })} />{lead} days before</label>)}
        </div>
        <Button variant="secondary" className="mt-3" disabled={reminders.length === 0} onClick={() => {
          try { downloadReminderICS(reminders); setMessage('Calendar reminder download started. Import the file into your calendar.'); }
          catch { setMessage('The calendar file could not be downloaded. Try again.'); }
        }}>Download calendar reminders</Button>
        {reminders.length === 0 && <p className="mt-2 text-xs text-muted">No selected reminder dates remain in the future for the visible expiration alerts.</p>}
      </details>
      {message && <p role="status" className="mt-3 text-sm text-muted">{message}</p>}
    </section>
  );
}
