'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { runCapability } from '@/app/actions';
import { btnPrimary, btnSecondary, input } from './ui';

export function DecideButtons({ requestId }: { requestId: string }) {
  const id = useId();
  const router = useRouter();
  const [note, setNote] = useState('');
  const [reason, setReason] = useState<'' | 'coverage' | 'notice' | 'peak_period' | 'other'>('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const decide = (decision: 'approve' | 'decline') =>
    start(async () => {
      if (decision === 'decline' && !reason) {
        setError('Pick a reason to decline. The person gets it with other dates that work.');
        return;
      }
      const r = await runCapability('decideLeaveRequest', { requestId, decision, note: note.trim() || undefined, ...(decision === 'decline' ? { reason } : {}) });
      if (r.ok) router.refresh();
      else setError(r.error.message);
    });
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-40 flex-1">
        <label htmlFor={id} className="sr-only">Note (optional)</label>
        <input id={id} className={input} placeholder="Note (optional)" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div>
        <label htmlFor={`${id}-reason`} className="sr-only">Reason, if you decline</label>
        <select id={`${id}-reason`} className={input} value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
          <option value="">Decline reason…</option>
          <option value="coverage">Not enough cover</option>
          <option value="notice">Not enough notice</option>
          <option value="peak_period">Busy period</option>
          <option value="other">Other (add a note)</option>
        </select>
      </div>
      <button className={btnPrimary} disabled={pending} onClick={() => decide('approve')}>Approve</button>
      <button className={btnSecondary} disabled={pending} onClick={() => decide('decline')}>Decline</button>
      {error && <p role="alert" className="w-full text-sm text-ink">{error}</p>}
    </div>
  );
}
