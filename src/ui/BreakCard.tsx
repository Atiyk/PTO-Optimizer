import { useState } from 'react';
import type { Break } from '../solver/types';
import { formatWorkingDaysList, formatManagerEmail, copyText } from './requestText';
import { formatCardDateRange } from './dateFormat';

interface BreakCardProps {
  brk: Break;
  /** 1-based, chronological - the same number its calendar badge shows (see
   * useAppState's `orderedBreaks`, the one shared source for both). */
  index: number;
  highlighted?: boolean;
  isPtoDay: (iso: string) => boolean;
  onHover: (id: string | null) => void;
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

/** A break at or below 1.0x gains NO extra days off beyond the PTO day(s) spent - a
 * legitimate trade at a weighting that favours quieter travel, never a bug, but it looks
 * broken with no explanation on screen. Verified empirically (not assumed) that this is a
 * budget-maximization effect independent of w, not a demand-scaling bug - see NOTES.md. */
function isLowValue(brk: Break): boolean {
  return brk.multiplier <= 1.0;
}

export function BreakCard({ brk, index, highlighted = false, isPtoDay, onHover }: BreakCardProps) {
  const lowValue = isLowValue(brk);
  const dayWord = brk.totalDaysOff === 1 ? 'day' : 'days';
  const ptoWord = brk.ptoCost === 1 ? 'day' : 'days';

  return (
    <div
      onMouseEnter={() => onHover(brk.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(brk.id)}
      onBlur={() => onHover(null)}
      className={`flex flex-col gap-3 rounded-lg border p-4 transition-colors duration-700 ${
        highlighted
          ? 'border-teal-300 dark:border-teal-700 bg-teal-50/60 dark:bg-teal-950/40'
          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-600 dark:bg-slate-400 text-[11px] font-semibold leading-none text-white dark:text-slate-900">
            {index}
          </span>
          <span className="min-w-0 truncate font-medium text-slate-800 dark:text-slate-100">
            {formatCardDateRange(brk.start, brk.end)} &middot; {brk.totalDaysOff} {dayWord} off for {brk.ptoCost} PTO{' '}
            {ptoWord}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span
            className={
              lowValue
                ? 'rounded-full bg-slate-100 dark:bg-slate-700 px-3 py-1 text-sm font-medium text-slate-500 dark:text-slate-400'
                : 'rounded-full bg-teal-50 dark:bg-teal-950 px-3 py-1 text-sm font-semibold text-teal-700 dark:text-teal-300'
            }
          >
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
                    : tag === 'Estimated' || tag === 'Low travel demand'
                      ? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                      : 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
              }`}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {lowValue && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          No extra days off &mdash; chosen for low travel demand.
        </p>
      )}

      <div className="flex items-center gap-2 border-t border-slate-100 dark:border-slate-700 pt-3">
        <span className="text-xs text-slate-400 dark:text-slate-400">Request this time off:</span>
        <CopyRequestButton label="Copy date list" text={formatWorkingDaysList(brk, isPtoDay)} />
        <CopyRequestButton label="Copy email draft" text={formatManagerEmail(brk, isPtoDay)} />
      </div>
    </div>
  );
}
