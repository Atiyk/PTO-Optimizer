import { useEffect, useId, useState } from 'react';
import { Button } from './Button';
import { employerLabelsWouldBeShared } from './publicSharePrivacy';

/**
 * Optional sign-in for reminder emails and "forward the approval". Renders nothing unless the
 * site has accounts set up (GET /api/account says so), so the free, signed-out app looks and
 * works exactly as before. Nothing here gates a result: plans and feeds never need an account.
 */
export interface AccountStatus {
  features: { accounts: boolean; inbound: boolean };
  inboundAddress?: string | null;
  account: { email: string; planLink: string | null; policyLink: string | null; reminders: boolean } | null;
}

export interface EmailRemindersProps {
  /** Which saved link this block manages: the plan (book-by reminders) or the policy (expiry reminders). */
  kind: 'plan' | 'policy';
  /** The current query string, without "?". */
  search: string;
  /** For tests and screenshots: skips the fetch. */
  initialStatus?: AccountStatus | null;
  /** Whether this build has accounts set up (defaults to the build-time flag). */
  enabled?: boolean;
}

/** Set by vite.config.ts from the server's settings at build time; undefined outside Vite. */
const BUILD_ENABLED = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_GAPLESS_ACCOUNTS === 'true';
/** A non-secret cookie the server sets beside the HttpOnly session, so the page only asks
 * /api/account who is signed in when someone actually is. */
const SIGNED_IN_HINT = 'gapless_signed_in=1';
const SIGNED_OUT: AccountStatus = { features: { accounts: true, inbound: false }, account: null };

async function post(body: Record<string, unknown>): Promise<Response> {
  return fetch('/api/account', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body) });
}

const INPUT = 'h-11 w-full min-w-0 flex-1 rounded-[6px] border border-line-strong bg-surface px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]';

export function EmailReminders({ kind, search, initialStatus, enabled = BUILD_ENABLED }: EmailRemindersProps) {
  const id = useId();
  const [status, setStatus] = useState<AccountStatus | null>(initialStatus ?? null);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [path, setPath] = useState<string | null>(null);

  useEffect(() => {
    setPath(window.location.pathname);
    const params = new URLSearchParams(window.location.search);
    if (params.get('signin') === 'ok') setMessage('You’re signed in.');
    if (params.get('signin') === 'expired') setMessage('That sign-in link has expired or was already used. Ask for a new one.');
    if (initialStatus !== undefined || !enabled) return;
    if (!document.cookie.split(/;\s*/).includes(SIGNED_IN_HINT)) { setStatus(SIGNED_OUT); return; }
    let live = true;
    fetch('/api/account', { credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() as Promise<AccountStatus> : null))
      .then((data) => { if (live && data?.features) setStatus(data); })
      .catch(() => {});
    return () => { live = false; };
  }, [initialStatus, enabled]);

  if (!enabled || !status?.features.accounts || path === null) return null;

  const currentLink = `${kind === 'policy' ? '/policy' : path}?${search}`;
  const account = status.account;
  const savedLink = account ? (kind === 'plan' ? account.planLink : account.policyLink) : null;
  const linkField = kind === 'plan' ? 'planLink' : 'policyLink';
  const what = kind === 'plan' ? 'plan' : 'policy';
  const remindersText = kind === 'plan' ? 'the week before each “book by” date, and on the day' : '60, 30 and 7 days before PTO expires';
  const privateCalendarInLink = kind === 'plan' && employerLabelsWouldBeShared(search);
  const approvePrivateSave = () => !privateCalendarInLink || window.confirm(
    'Your plan link contains custom employer calendar names. Signing in or saving this plan can store them in your private reminder link. Continue?',
  );

  const act = async (body: Record<string, unknown>, done?: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await post(body);
      const data = await res.json().catch(() => ({})) as { error?: string; account?: AccountStatus['account'] };
      if (!res.ok) { setMessage(data.error ?? 'Something went wrong. Try again.'); return; }
      if (body.action === 'signout' || body.action === 'delete') setStatus({ ...status, account: null });
      else if (data.account) setStatus({ ...status, account: data.account });
      if (done) setMessage(done);
    } catch {
      setMessage('Couldn’t reach Timebower. Check your connection and try again.');
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  return (
    <section id="account" aria-labelledby={`${id}-heading`} className="flex min-w-0 flex-col gap-3 border-t border-line pt-5">
      <h3 id={`${id}-heading`} className="text-xl font-bold leading-6 text-ink type-condensed">Get reminders by email</h3>
      {privateCalendarInLink && <p className="text-sm text-muted">Your private reminder link includes custom employer calendar names. You will be asked before saving or emailing that link.</p>}
      {!account ? (
        <>
          <p className="max-w-prose text-sm text-muted">
            Optional. Sign in with just your email and Timebower emails you {remindersText}. It stores your email, the links you save and when it last emailed you, and you can delete them in one click.
          </p>
          <form
            className="flex min-w-0 flex-wrap gap-2 sm:flex-nowrap"
            onSubmit={(event) => { event.preventDefault(); if (!approvePrivateSave()) return; void act({ action: 'login', email, returnTo: `${window.location.pathname}${window.location.search}` }, `Check ${email.trim()} for a sign-in link. It works for 30 minutes.`); }}
          >
            <label htmlFor={`${id}-email`} className="sr-only">Email address</label>
            <input id={`${id}-email`} type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} className={INPUT} />
            <Button variant="secondary" type="submit" disabled={busy}>Email me a sign-in link</Button>
          </form>
        </>
      ) : (
        <>
          <p className="max-w-prose text-sm text-muted">Signed in as <span className="font-semibold text-ink">{account.email}</span>.</p>
          <label className="flex items-start gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4"
              checked={account.reminders && savedLink !== null}
              disabled={busy}
              onChange={(event) => {
                if (event.target.checked && !approvePrivateSave()) return;
                void act(event.target.checked
                  ? { action: 'save', [linkField]: currentLink, reminders: true }
                  : { action: 'save', reminders: false });
              }}
            />
            <span>Email me {remindersText} for this {what}</span>
          </label>
          {account.reminders && savedLink !== null && savedLink !== currentLink && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
              <span>Emails follow the {what} you saved earlier, not this one.</span>
              <Button variant="quiet" size="sm" disabled={busy} onClick={() => { if (approvePrivateSave()) void act({ action: 'save', [linkField]: currentLink }, `Emails now follow this ${what}.`); }}>Use this {what} instead</Button>
            </div>
          )}
          {status.features.inbound && status.inboundAddress && (
            <p className="max-w-prose text-sm text-muted">
              Got an approval email? Forward it from {account.email} to <span className="font-semibold text-ink break-all">{status.inboundAddress}</span>. Timebower replies with the dates and an out-of-office message, and doesn’t keep the email.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="quiet" size="sm" disabled={busy} onClick={() => void act({ action: 'signout' }, 'You’re signed out.')}>Sign out</Button>
            <Button variant="quiet" size="sm" disabled={busy} onClick={() => (confirmDelete ? void act({ action: 'delete' }, 'Your account and everything saved in it are deleted.') : setConfirmDelete(true))}>
              {confirmDelete ? 'Click again to delete everything' : 'Delete my account'}
            </Button>
          </div>
        </>
      )}
      <p className="text-sm text-muted" role="status">{message ?? ''}</p>
    </section>
  );
}
