'use client';

import { useState, useTransition } from 'react';
import { runCapability } from '@/app/actions';
import { btnSecondary, input } from './ui';

/** Admin: a one-time sign-in code for someone without Slack, shown once to read out. */
export function IssueSignInCode({ people, staffUrl }: { people: { id: string; name: string }[]; staffUrl: string }) {
  const [memberId, setMemberId] = useState(people[0]?.id ?? '');
  const [out, setOut] = useState<{ name: string; code: string; until: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const issue = () =>
    start(async () => {
      const r = await runCapability('manageStaffSignIn', { op: 'issueCode', memberId });
      if (!r.ok) return setError(r.error.message);
      setError(null);
      setOut({
        name: people.find((p) => p.id === memberId)?.name ?? '',
        code: r.data.code ?? '',
        until: new Date(r.data.expiresAt ?? '').toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      });
    });
  return (
    <div className="space-y-3 text-sm">
      <p className="text-ink">
        Staff open <span className="font-medium break-all">{staffUrl}</span> on their phone and type the code. It works once, for 15 minutes. Read it to them in person or on a call; don’t send it by
        message.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-muted">Person</span>
          <select value={memberId} onChange={(e) => setMemberId(e.target.value)} className={input}>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <button onClick={issue} disabled={pending || !memberId} className={btnSecondary}>
          Get a sign-in code
        </button>
      </div>
      {out && (
        <p role="status" className="text-ink">
          Code for {out.name}: <span className="font-mono text-lg font-semibold tracking-widest">{out.code}</span> (until {out.until}). Making a new code cancels this one.
        </p>
      )}
      {error && <p className="font-medium text-ink">{error}</p>}
    </div>
  );
}
