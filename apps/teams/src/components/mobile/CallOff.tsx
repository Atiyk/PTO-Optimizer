'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { runCapability } from '@/app/actions';
import type { CapabilityOutput } from '@/capabilities/registry';

/**
 * Two taps: "I can't come in" → "Yes, tell my manager". No reason is asked. Today or
 * tomorrow only (a planned absence is a leave request).
 */
export function CallOff({ today, tomorrow }: { today: string; tomorrow: string }) {
  const router = useRouter();
  const [step, setStep] = useState<'idle' | 'confirm' | 'done'>('idle');
  const [day, setDay] = useState(today);
  const [result, setResult] = useState<CapabilityOutput<'reportCallOff'> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [key, setKey] = useState(() => crypto.randomUUID());

  const confirm = () =>
    start(async () => {
      const r = await runCapability('reportCallOff', { date: day, idempotencyKey: key });
      if (r.ok) {
        setResult(r.data);
        setStep('done');
        setKey(crypto.randomUUID());
        router.refresh();
      } else setError(r.error.message);
    });

  if (step === 'done' && result) {
    return (
      <section className="rounded-lg border-l-4 border-ok-line bg-ok-bg p-4" role="status">
        <p className="font-semibold text-ok-text">Your manager knows you’re out {result.date === today ? 'today' : 'tomorrow'}.</p>
        <p className="mt-1 text-sm text-ink">
          {result.coverRequests.length
            ? `Cover has been asked for ${result.coverRequests.length === 1 ? 'one time slot' : `${result.coverRequests.length} time slots`}. You don’t need to find it.`
            : 'No cover is needed for your shift.'}
        </p>
        {result.balanceNote && <p className="mt-1 text-sm text-muted">{result.balanceNote}</p>}
        <p className="mt-2 text-sm text-muted">Feel better.</p>
      </section>
    );
  }
  if (step === 'confirm') {
    return (
      <section className="space-y-3 rounded-lg border-2 border-ink bg-page p-4">
        <p className="font-semibold text-ink">Tell your manager you can’t come in?</p>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Which day">
          {[
            [today, 'Today'],
            [tomorrow, 'Tomorrow'],
          ].map(([d, label]) => (
            <button
              key={d}
              role="radio"
              aria-checked={day === d}
              onClick={() => setDay(d!)}
              className={`min-h-12 rounded-md border text-base ${day === d ? 'border-2 border-ink font-semibold' : 'border-line'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted">You don’t have to give a reason.</p>
        <button onClick={confirm} disabled={pending} className="min-h-14 w-full rounded-md bg-accent text-base font-semibold text-white">
          {pending ? 'Sending…' : 'Yes, tell my manager'}
        </button>
        <button onClick={() => setStep('idle')} className="min-h-12 w-full rounded-md border border-line text-base text-ink">
          Cancel
        </button>
        {error && <p className="text-sm font-medium text-ink">{error}</p>}
      </section>
    );
  }
  return (
    <button onClick={() => setStep('confirm')} className="min-h-14 w-full rounded-lg border-2 border-gap-line bg-gap-bg text-lg font-semibold text-gap-text">
      I can’t come in
    </button>
  );
}
