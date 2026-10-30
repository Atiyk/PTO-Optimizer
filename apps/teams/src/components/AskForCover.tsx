'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { runCapability } from '@/app/actions';
import { btnPrimary } from './ui';

/** Sends cover offers in waves (the engine's ranking order). One click; a retry never doubles up. */
export function AskForCover({ target, eligible }: { target: { locationId: string; roomId: string; date: string; start: string; end: string }; eligible: number }) {
  const router = useRouter();
  const [key] = useState(() => crypto.randomUUID());
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ask = () =>
    start(async () => {
      const r = await runCapability('requestCover', { op: 'create', ...target, waveSize: 3, waveWaitMinutes: 15, idempotencyKey: key });
      if (!r.ok) return setMsg(r.error.message);
      setMsg(r.data.offersSent ? `Offers sent to ${r.data.offersSent} ${r.data.offersSent === 1 ? 'person' : 'people'}. The next 3 are asked after 15 minutes if nobody takes it.` : 'Nobody can take this legally right now, so no offers went out.');
      router.refresh();
    });
  return (
    <div className="space-y-2">
      <button onClick={ask} disabled={pending || eligible === 0 || msg !== null} className={btnPrimary}>
        {eligible === 0 ? 'Nobody eligible' : `Ask the top ${Math.min(3, eligible)} now`}
      </button>
      {msg && (
        <p role="status" className="text-sm text-ink">
          {msg}
        </p>
      )}
    </div>
  );
}
