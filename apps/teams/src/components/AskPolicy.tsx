'use client';

import { useId, useState, useTransition } from 'react';
import { runCapability } from '@/app/actions';
import { btnPrimary, input, label } from './ui';

/** "Ask about my policy": answered from the engine's summary of your policies, balances and rules. */
export function AskPolicy({ compact = false }: { compact?: boolean }) {
  const id = useId();
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim().length < 2) return;
        start(async () => {
          const r = await runCapability('askPolicyQuestion', { question: q.trim().slice(0, 300) });
          setAnswer(r.ok ? r.data.text : r.error.message);
        });
      }}
    >
      <label className={label} htmlFor={`${id}-q`}>Your question</label>
      <input
        id={`${id}-q`}
        className={input}
        value={q}
        maxLength={300}
        onChange={(e) => setQ(e.target.value)}
        placeholder={compact ? 'Does unused vacation carry over?' : 'e.g. "Does unused vacation carry over?" or "When can I take time off in December?"'}
      />
      <button className={btnPrimary} disabled={pending}>{pending ? 'Looking it up…' : 'Ask'}</button>
      {answer && (
        <div aria-live="polite" className="rounded-md border border-line bg-surface p-3 text-sm text-ink">
          <p>{answer}</p>
          <p className="mt-1 text-xs text-muted">From your workspace&rsquo;s policies. Not legal advice; ask your approver if unsure.</p>
        </div>
      )}
    </form>
  );
}
