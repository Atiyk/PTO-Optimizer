import { useState } from 'react';
import type { Break } from '../solver/types';
import { formatWorkingDaysList, formatManagerEmail, copyText } from './requestText';

interface BreakCardProps {
  brk: Break;
  highlighted?: boolean;
  isPtoDay: (iso: string) => boolean;
}

type CopyState = 'idle' | 'done';

function CopyRequestButton({ label, text }: { label: string; text: string }) {
  const [state, setState] = useState<CopyState>('idle');
  return (
    <button
      type="button"
      onClick={async () => {
        const ok = await copyText(text);
        if (ok) {
          setState('done');
          setTimeout(() => setState('idle'), 2000);
        }
      }}
      className="rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
    >
      {state === 'done' ? 'Copied' : label}
    </button>
  );
}

export function BreakCard({ brk, highlighted = false, isPtoDay }: BreakCardProps) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-lg border p-4 transition-colors duration-700 ${
        highlighted
          ? 'border-teal-300 dark:border-teal-700 bg-teal-50/60 dark:bg-teal-950/40'
          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium text-slate-800 dark:text-slate-100">
            {brk.start} &rarr; {brk.end}
          </div>
          <div className="text-sm text-slate-500 dark:text-slate-400">
            {brk.totalDaysOff} days off for {brk.ptoCost} PTO day{brk.ptoCost === 1 ? '' : 's'}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-teal-50 dark:bg-teal-950 px-3 py-1 text-sm font-semibold text-teal-700 dark:text-teal-300">
            {brk.multiplier.toFixed(2)}x
          </span>
          {brk.tags.map((tag) => (
            <span
              key={tag}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                tag === 'Peak travel'
                  ? 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                  : tag === 'Overlaps'
                    ? 'bg-sky-50 dark:bg-sky-950 text-sky-700 dark:text-sky-300'
                    : tag === 'Estimated'
                      ? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                      : 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
              }`}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-slate-100 dark:border-slate-700 pt-3">
        <span className="text-xs text-slate-400 dark:text-slate-400">Request this time off:</span>
        <CopyRequestButton label="Copy date list" text={formatWorkingDaysList(brk, isPtoDay)} />
        <CopyRequestButton label="Copy email draft" text={formatManagerEmail(brk, isPtoDay)} />
      </div>
    </div>
  );
}
