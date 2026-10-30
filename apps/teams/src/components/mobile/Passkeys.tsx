'use client';

import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

async function post(path: string, body?: unknown) {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as { error?: string; next?: string };
  if (!res.ok) throw new Error(json.error ?? 'Something went wrong. Try again.');
  return json as never;
}

const cancelled = (e: unknown) => (e as Error).name === 'NotAllowedError';

/** Adds a passkey for the signed-in person (Face ID, fingerprint or screen lock next time). */
export function AddPasskey({ count }: { count: number }) {
  const router = useRouter();
  const [supported, setSupported] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => setSupported(browserSupportsWebAuthn()), []);
  const add = () =>
    start(async () => {
      try {
        const optionsJSON = await post('/api/auth/passkey/register-options');
        await post('/api/auth/passkey/register-verify', await startRegistration({ optionsJSON }));
        setMsg('Passkey added. Next time, sign in with one tap.');
        router.refresh();
      } catch (e) {
        setMsg(cancelled(e) ? 'Cancelled. Nothing was changed.' : (e as Error).message);
      }
    });
  if (!supported) return <p className="text-sm text-muted">This browser can’t use passkeys. Ask your manager for a sign-in code when you need one.</p>;
  return (
    <div className="space-y-2">
      <p className="text-sm text-ink">{count === 0 ? 'No passkey yet. Add one so you don’t need a code to sign in.' : `${count === 1 ? 'One passkey' : `${count} passkeys`} set up.`}</p>
      <button onClick={add} disabled={pending} className="min-h-12 w-full rounded-md bg-accent text-base font-semibold text-white">
        {pending ? 'Waiting for your device…' : count === 0 ? 'Add a passkey' : 'Add another device'}
      </button>
      {msg && (
        <p role="status" className="text-sm text-ink">
          {msg}
        </p>
      )}
    </div>
  );
}

/** Sign in: passkey first (no username), the manager's one-time code as the fallback. */
export function SignIn() {
  const router = useRouter();
  const [supported, setSupported] = useState(true);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => setSupported(browserSupportsWebAuthn()), []);
  // Always land on the staff app; the server's `next` is not trusted as a redirect target.
  const done = () => router.replace('/m');
  const withPasskey = () =>
    start(async () => {
      try {
        const optionsJSON = await post('/api/auth/passkey/login-options');
        await post('/api/auth/passkey/login-verify', await startAuthentication({ optionsJSON }));
        done();
      } catch (e) {
        setMsg(cancelled(e) ? 'Cancelled.' : (e as Error).message);
      }
    });
  const withCode = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      try {
        await post('/api/auth/code', { code });
        done();
      } catch (err) {
        setMsg((err as Error).message);
      }
    });
  };
  return (
    <div className="space-y-6">
      {supported && (
        <button onClick={withPasskey} disabled={pending} className="min-h-14 w-full rounded-md bg-accent text-base font-semibold text-white">
          Sign in with a passkey
        </button>
      )}
      <form onSubmit={withCode} className="space-y-2 rounded-lg border border-line bg-page p-4">
        <label htmlFor="code" className="block text-base font-semibold text-ink">
          Sign-in code from your manager
        </label>
        <input
          id="code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="ABCDE-23456"
          className="min-h-12 w-full rounded-md border border-line bg-page px-3 font-mono text-lg tracking-widest text-ink"
        />
        <button type="submit" disabled={pending || code.trim().length < 10} className="min-h-12 w-full rounded-md border-2 border-ink text-base font-semibold text-ink disabled:opacity-50">
          Sign in with code
        </button>
      </form>
      {msg && (
        <p role="alert" className="text-sm font-medium text-ink">
          {msg}
        </p>
      )}
    </div>
  );
}
