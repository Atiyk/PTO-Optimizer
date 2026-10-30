'use client';

import { useId, useState, useTransition } from 'react';
import type { DemoHandbook as Result } from '@/demo/demo';
import { HandbookResultView } from './HandbookImport';
import { btnPrimary, btnSecondary, input, label } from './ui';

/** The public demo's handbook reader. Posts to /api/demo/handbook; nothing is saved. */
export function DemoHandbook({ sample }: { sample: string }) {
  const id = useId();
  const [text, setText] = useState(sample);
  const [result, setResult] = useState<Result | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [reading, startReading] = useTransition();

  function read() {
    setMsg(null);
    startReading(async () => {
      try {
        const res = await fetch('/api/demo/handbook', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
        const body = await res.json();
        if (res.ok) setResult(body as Result);
        else setMsg(body?.error?.message ?? 'That did not work. Please try again.');
      } catch {
        setMsg('That did not work. Please try again.');
      }
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <label className={label} htmlFor={`${id}-text`}>A handbook&apos;s time-off section (edit it or paste your own)</label>
        <textarea id={`${id}-text`} className={`${input} mt-1 h-48 font-mono text-xs`} value={text} maxLength={20_000} onChange={(e) => setText(e.target.value)} />
        <p className="mt-1 text-xs text-muted">
          The text is sent to Anthropic&apos;s API to be read, so don&apos;t paste anything confidential. Nothing you do on this page is saved.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button className={btnPrimary} disabled={reading || text.trim().length < 20} onClick={read}>
            {reading ? 'Reading…' : 'Read this handbook'}
          </button>
          {text !== sample && (
            <button className={btnSecondary} onClick={() => setText(sample)}>
              Back to the sample
            </button>
          )}
        </div>
      </div>
      <div aria-live="polite" className="space-y-3">
        {result && <HandbookResultView result={result} sourceLabel={result.label} note="In the product, an admin checks each quote and then saves." />}
        {msg && <p className="text-sm font-medium text-ink">{msg}</p>}
      </div>
    </div>
  );
}
