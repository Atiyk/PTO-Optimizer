'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { runCapability } from '@/app/actions';
import type { CapabilityName } from '@/capabilities/registry';
import { btnSecondary } from './ui';

/** A button that runs one capability and refreshes the page's server data. */
export function ActionButton({
  capability,
  input,
  children,
  className = btnSecondary,
  confirm,
}: {
  capability: CapabilityName;
  input: unknown;
  children: React.ReactNode;
  className?: string;
  confirm?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const run = () =>
    start(async () => {
      const r = await runCapability(capability, input);
      if (r.ok) {
        setError(null);
        setAsking(false);
        router.refresh();
      } else setError(r.error.message);
    });
  return (
    <span className="inline-flex flex-col items-start gap-1">
      {confirm && asking ? (
        <span className="inline-flex items-center gap-2 text-sm">
          <span>{confirm}</span>
          <button className={className} disabled={pending} onClick={run}>Yes</button>
          <button className={btnSecondary} onClick={() => setAsking(false)}>No</button>
        </span>
      ) : (
        <button className={className} disabled={pending} onClick={() => (confirm ? setAsking(true) : run())}>
          {pending ? '…' : children}
        </button>
      )}
      {error && <span role="alert" className="text-xs text-ink">{error}</span>}
    </span>
  );
}
