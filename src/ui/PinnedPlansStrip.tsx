import { ordinal } from './scoreFormat';

export interface PinnedPlanSummary {
  budgetSpent: number;
  totalDaysOff: number;
  breakCountActual: number;
  travelPercentile: number | null;
}

interface PinnedPlansStripProps {
  pinnedCount: number;
  summaries: PinnedPlanSummary[];
  canPin: boolean;
  onPin: () => void;
  onRestore: (index: number) => void;
  onRemove: (index: number) => void;
}

function summaryText(s: PinnedPlanSummary): string {
  const dayWord = s.budgetSpent === 1 ? 'day' : 'days';
  const breakWord = s.breakCountActual === 1 ? 'break' : 'breaks';
  const travel = s.travelPercentile !== null ? ` · Travel ${ordinal(s.travelPercentile)}` : '';
  return `Pinned: ${s.budgetSpent} ${dayWord} → ${s.totalDaysOff} off · ${s.breakCountActual} ${breakWord}${travel}`;
}

/**
 * Phase 3 item 7: moving a slider used to permanently discard whatever plan was on screen
 * before it - the only way to compare two plans was to remember the numbers yourself. "Pin
 * this plan" snapshots the full input state (everything that would be in the shareable URL)
 * so sliders become genuinely explorable: try something, pin it if it's interesting, keep
 * exploring, restore it later if the new direction doesn't pan out. Capped at two, since
 * this is a quick side-by-side comparison strip, not a saved-plans library.
 */
export function PinnedPlansStrip({ pinnedCount, summaries, canPin, onPin, onRestore, onRemove }: PinnedPlansStripProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2">
      <button
        type="button"
        onClick={onPin}
        disabled={!canPin}
        className="rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Pin this plan
      </button>
      {pinnedCount === 0 && (
        <span className="text-xs text-slate-400 dark:text-slate-400">Pin up to two plans to compare side by side.</span>
      )}
      {!canPin && pinnedCount >= 2 && (
        <span className="text-xs text-slate-400 dark:text-slate-400">Two pinned &mdash; remove one to pin another.</span>
      )}
      {summaries.map((s, i) => (
        <div
          key={i}
          className="flex items-center gap-2 rounded-full bg-slate-100 dark:bg-slate-700 px-3 py-1 text-xs text-slate-700 dark:text-slate-200"
        >
          <span>{summaryText(s)}</span>
          <button
            type="button"
            onClick={() => onRestore(i)}
            className="font-medium text-slate-800 dark:text-slate-100 underline underline-offset-2 hover:no-underline"
          >
            restore
          </button>
          <button
            type="button"
            onClick={() => onRemove(i)}
            aria-label="Remove pinned plan"
            className="text-slate-400 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}
