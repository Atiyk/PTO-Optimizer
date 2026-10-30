'use client';

import { useState, useTransition } from 'react';
import { runCapability } from '@/app/actions';

/** "Why this number?": engine facts in plain words (AI when on, template otherwise). */
export function ExplainBalance({ leaveType }: { leaveType: string }) {
  const [text, setText] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (text) return <p className="text-sm text-ink" aria-live="polite">{text}</p>;
  return (
    <button
      className="text-sm font-medium text-accent underline-offset-2 hover:underline disabled:opacity-60"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await runCapability('explainBalanceInWords', { leaveType });
          setText(r.ok ? r.data.text : r.error.message);
        })
      }
    >
      {pending ? 'Explaining…' : 'Why this number?'}
    </button>
  );
}
