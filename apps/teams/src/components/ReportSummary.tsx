'use client';

import { useState, useTransition } from 'react';
import { runCapability } from '@/app/actions';
import { btnSecondary } from './ui';

/** The written summary of an absence report: Claude when AI is on, the same numbers as a template otherwise. */
export function ReportSummary({ input }: { input: { from: string; to: string; teamId?: string; groupId?: string } }) {
  const [out, setOut] = useState<{ headline: string; points: string[]; note: string | null } | { error: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2" aria-live="polite">
      {!out && (
        <button
          className={btnSecondary}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await runCapability('explainAbsenceReport', input);
              setOut(r.ok ? { headline: r.data.headline, points: r.data.points, note: r.data.source.used === 'ai' ? 'Written by Claude from the numbers below; every number was checked.' : 'Written from the numbers below (AI is off or unavailable).' } : { error: r.error.message });
            })
          }
        >
          {pending ? 'Writing the summary…' : 'Write a summary'}
        </button>
      )}
      {out && 'error' in out && <p className="text-sm text-ink">{out.error}</p>}
      {out && 'headline' in out && (
        <div className="space-y-2">
          <p className="font-medium text-ink">{out.headline}</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink">
            {out.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          {out.note && <p className="text-xs text-muted">{out.note}</p>}
        </div>
      )}
    </div>
  );
}
