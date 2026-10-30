'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { runCapability } from '@/app/actions';
import { ExportButtons } from './ExportButtons';
import { btnSecondary, input, label } from './ui';

/** Per-person export and erasure, and (owner only) deleting the workspace. Both destructive steps ask twice. */
export function PrivacyActions({ people, orgName, isOwner }: { people: { id: string; name: string; erasable: boolean }[]; orgName: string; isOwner: boolean }) {
  const id = useId();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [who, setWho] = useState(people[0]?.id ?? '');
  const [asking, setAsking] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const person = people.find((p) => p.id === who);

  const erase = () =>
    start(async () => {
      const r = await runCapability('eraseMember', { memberId: who });
      setAsking(false);
      setMsg(r.ok ? 'Personal data erased. Their leave dates stay as “Former member”.' : r.error.message);
      if (r.ok) router.refresh();
    });
  const destroy = () =>
    start(async () => {
      const r = await runCapability('deleteWorkspace', { confirmName: typed });
      if (!r.ok) return setMsg(r.error.message);
      await fetch('/api/auth/signout', { method: 'POST' });
      window.location.assign('/signin');
    });

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <label className={label} htmlFor={`${id}-who`}>Person</label>
        <select id={`${id}-who`} value={who} onChange={(e) => { setWho(e.target.value); setAsking(false); setMsg(null); }} className={input}>
          {people.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <ExportButtons memberId={who} />
        {person?.erasable &&
          (asking ? (
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <span>Erase {person.name}&rsquo;s name, email, notes and tokens for good?</span>
              <button className={btnSecondary} disabled={pending} onClick={erase}>Yes, erase</button>
              <button className={btnSecondary} onClick={() => setAsking(false)}>No</button>
            </p>
          ) : (
            <button className={btnSecondary} onClick={() => setAsking(true)}>Erase personal data…</button>
          ))}
        {msg && <p role="status" className="text-sm text-ink">{msg}</p>}
      </div>
      {isOwner && (
        <div className="space-y-2 border-t border-line pt-4">
          <p className="text-sm font-medium text-ink">Delete this workspace</p>
          <p className="text-sm text-muted">Removes everyone&rsquo;s data, the audit log, tokens and webhooks. Download an export first.</p>
          <label className={label} htmlFor={`${id}-confirm`}>Type <strong>{orgName}</strong> to confirm</label>
          <input id={`${id}-confirm`} value={typed} onChange={(e) => setTyped(e.target.value)} className={input} autoComplete="off" />
          <button className={btnSecondary} disabled={pending || typed.trim() !== orgName} onClick={destroy}>Delete workspace permanently</button>
        </div>
      )}
    </div>
  );
}
