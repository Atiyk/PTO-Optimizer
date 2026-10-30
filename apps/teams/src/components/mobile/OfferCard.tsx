'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { runCapability } from '@/app/actions';

const LABEL = {
  filled: 'It’s yours. It’s on your schedule.',
  already_filled: 'Someone else took this one first. Thanks for answering.',
  cancelled: 'This cover is no longer needed.',
  declined: 'Declined. Thanks for letting us know.',
} as const;

export function OfferCard({ offerId, title, when, open }: { offerId: string; title: string; when: string; open: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const answer = (response: 'accept' | 'decline') =>
    start(async () => {
      const r = await runCapability('respondToCover', { offerId, response });
      if (!r.ok) return setMsg(r.error.message);
      setMsg(r.data.status === 'no_longer_eligible' ? `You can’t take this one: ${r.data.reason}` : LABEL[r.data.status]);
      router.refresh();
    });
  return (
    <section className="rounded-xl border border-line bg-page p-4 shadow-sm">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <p className="text-sm text-ink">{when}</p>
      {open && !msg && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button disabled={pending} onClick={() => answer('accept')} className="min-h-14 rounded-lg bg-accent text-base font-semibold text-white">
            Take it
          </button>
          <button disabled={pending} onClick={() => answer('decline')} className="min-h-14 rounded-lg border border-line text-base text-ink">
            Can’t
          </button>
        </div>
      )}
      {msg && (
        <p role="status" className="mt-2 text-sm font-medium text-ink">
          {msg}
        </p>
      )}
    </section>
  );
}
