'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { runCapability } from '@/app/actions';
import { btnPrimary, btnSecondary, input, label } from './ui';

/** A secret shown exactly once, with a copy button. */
function OneTimeSecret({ items }: { items: { label: string; value: string }[] }) {
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <div role="status" className="mt-3 space-y-2 rounded-md border border-accent bg-surface p-3 text-sm">
      <p className="font-medium text-ink">Copy this now. You won&rsquo;t see it again.</p>
      {items.map((it) => (
        <div key={it.label}>
          <div className="text-muted">{it.label}</div>
          <div className="mt-1 flex gap-2">
            <input readOnly value={it.value} onFocus={(e) => e.currentTarget.select()} className={`${input} font-mono`} aria-label={it.label} />
            <button
              type="button"
              className={btnSecondary}
              onClick={() => navigator.clipboard?.writeText(it.value).then(() => setCopied(it.label), () => setCopied(null))}
            >
              {copied === it.label ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

type ScopeOption = { scope: string; description: string };

/**
 * Create a personal token, API key or OAuth client. The scope list reads like a consent
 * screen: each box says in plain words what the agent will be able to do.
 */
export function TokenCreator({
  kind,
  scopes,
  defaultScopes,
}: {
  kind: 'pat' | 'api_key' | 'oauth_client';
  scopes: ScopeOption[];
  defaultScopes: string[];
}) {
  const id = useId();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<{ label: string; value: string }[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set(defaultScopes));

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get('name') ?? '').trim();
    const picked = [...chosen];
    start(async () => {
      setSecret(null);
      if (kind === 'pat') {
        const r = await runCapability('managePersonalTokens', { op: 'create', name, scopes: picked, expiresInDays: Number(fd.get('days') ?? 90) });
        if (!r.ok) return setError(r.error.message);
        setSecret([{ label: 'Personal token', value: r.data.created!.token }]);
      } else {
        const r = await runCapability('manageAgentAccess', { op: kind === 'api_key' ? 'createApiKey' : 'createOAuthClient', name, scopes: picked });
        if (!r.ok) return setError(r.error.message);
        const c = r.data.created!;
        setSecret(c.token ? [{ label: 'API key', value: c.token }] : [{ label: 'Client ID', value: c.clientId! }, { label: 'Client secret', value: c.clientSecret! }]);
      }
      setError(null);
      router.refresh();
    });
  }

  const what = kind === 'pat' ? 'personal token' : kind === 'api_key' ? 'API key' : 'OAuth client';
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor={`${id}-name`}>Name</label>
          <input id={`${id}-name`} name="name" required maxLength={80} placeholder={kind === 'pat' ? 'Claude Code on my laptop' : 'Copilot Studio HR agent'} className={`${input} mt-1`} />
        </div>
        {kind === 'pat' && (
          <div>
            <label className={label} htmlFor={`${id}-days`}>Expires after</label>
            <select id={`${id}-days`} name="days" defaultValue="90" className={`${input} mt-1`}>
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="365">1 year</option>
            </select>
          </div>
        )}
      </div>
      <fieldset>
        <legend className={label}>This {what} will be able to</legend>
        <ul className="mt-2 space-y-2">
          {scopes.map((s) => (
            <li key={s.scope} className="flex items-start gap-2 text-sm">
              <input
                id={`${id}-${s.scope}`}
                type="checkbox"
                className="mt-0.5 size-4"
                checked={chosen.has(s.scope)}
                onChange={(e) => {
                  const next = new Set(chosen);
                  if (e.target.checked) next.add(s.scope);
                  else next.delete(s.scope);
                  setChosen(next);
                }}
              />
              <label htmlFor={`${id}-${s.scope}`}>
                <span className="text-ink">{s.description}</span> <code className="text-xs text-muted">{s.scope}</code>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <button className={btnPrimary} disabled={pending || chosen.size === 0}>{pending ? 'Creating…' : `Create ${what}`}</button>
        {error && <span role="alert" className="text-sm text-ink">{error}</span>}
      </div>
      {secret && <OneTimeSecret items={secret} />}
    </form>
  );
}

export function WebhookCreator({ events }: { events: { event: string; description: string }[] }) {
  const id = useId();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set(events.map((e) => e.event)));
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const url = String(new FormData(e.currentTarget).get('url') ?? '').trim();
    start(async () => {
      const r = await runCapability('manageWebhooks', { op: 'create', url, events: [...chosen] });
      if (!r.ok) return setError(r.error.message);
      setError(null);
      setSecret(r.data.created!.secret);
      router.refresh();
    });
  }
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label className={label} htmlFor={`${id}-url`}>Endpoint URL</label>
        <input id={`${id}-url`} name="url" type="url" required placeholder="https://example.com/hooks/days-off" className={`${input} mt-1`} />
      </div>
      <fieldset>
        <legend className={label}>Send these events</legend>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {events.map((ev) => (
            <li key={ev.event} className="flex items-start gap-2 text-sm">
              <input
                id={`${id}-${ev.event}`}
                type="checkbox"
                className="mt-0.5 size-4"
                checked={chosen.has(ev.event)}
                onChange={(e) => {
                  const next = new Set(chosen);
                  if (e.target.checked) next.add(ev.event);
                  else next.delete(ev.event);
                  setChosen(next);
                }}
              />
              <label htmlFor={`${id}-${ev.event}`}>
                <code className="text-xs text-ink">{ev.event}</code> <span className="text-muted">{ev.description}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <button className={btnPrimary} disabled={pending || chosen.size === 0}>{pending ? 'Adding…' : 'Add webhook'}</button>
        {error && <span role="alert" className="text-sm text-ink">{error}</span>}
      </div>
      {secret && <OneTimeSecret items={[{ label: 'Signing secret', value: secret }]} />}
    </form>
  );
}

export function SendTestEvent({ endpointId, events }: { endpointId: string; events: string[] }) {
  const id = useId();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [event, setEvent] = useState(events[0] ?? 'leave.requested');
  const [result, setResult] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <label htmlFor={`${id}-ev`} className="sr-only">Test event</label>
      <select id={`${id}-ev`} value={event} onChange={(e) => setEvent(e.target.value)} className={`${input} w-auto py-1`}>
        {events.map((e) => (
          <option key={e} value={e}>{e}</option>
        ))}
      </select>
      <button
        type="button"
        className={btnSecondary}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await runCapability('manageWebhooks', { op: 'sendTest', endpointId, event });
            if (!r.ok) return setResult(r.error.message);
            const t = r.data.test!;
            setResult(t.ok ? `Delivered (HTTP ${t.statusCode}).` : `Not delivered: ${t.error}`);
            router.refresh();
          })
        }
      >
        {pending ? 'Sending…' : 'Send test event'}
      </button>
      {result && <span aria-live="polite" className="text-xs text-muted">{result}</span>}
    </span>
  );
}
