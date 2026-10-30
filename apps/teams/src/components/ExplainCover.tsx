'use client';

import { useState, useTransition } from 'react';
import { runCapability } from '@/app/actions';
import { btnSecondary } from './ui';

const SOURCE = { ai: 'Written by AI from the engine’s numbers', demo: 'Demo mode: a fixed template', rules: 'A fixed template (AI off or its numbers didn’t check out)' } as const;

/** The ranking in plain words. Every number is checked against the engine's facts. */
export function ExplainCover({ target }: { target: { locationId: string; roomId: string; date: string; start: string; end: string } }) {
  const [out, setOut] = useState<{ text: string; used: keyof typeof SOURCE } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const explain = () =>
    start(async () => {
      const r = await runCapability('explainCoverInWords', target);
      if (r.ok) setOut({ text: r.data.text, used: r.data.source.used });
      else setError(r.error.message);
    });
  return (
    <div className="space-y-2 text-sm">
      {!out && (
        <button onClick={explain} disabled={pending} className={btnSecondary}>
          {pending ? 'Explaining…' : 'Explain in words'}
        </button>
      )}
      {out && (
        <div role="status" className="rounded-md border border-line p-3">
          <p className="text-ink">{out.text}</p>
          <p className="mt-1 text-xs text-muted">{SOURCE[out.used]}.</p>
        </div>
      )}
      {error && <p className="text-ink">{error}</p>}
    </div>
  );
}
