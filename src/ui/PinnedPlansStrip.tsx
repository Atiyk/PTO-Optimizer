import { MAX_PINNED_PLANS } from './pinnedPlanStore';

export interface PinnedPlanSummary {
  budgetSpent: number;
  totalDaysOff: number;
  breakCountActual: number;
  travelPercentile: number | null;
  /** Made with a different employer holiday calendar than the plan uses now. */
  differentHolidays?: boolean;
}

interface PinnedPlansStripProps {
  summaries: PinnedPlanSummary[];
  onRestore: (index: number) => void;
  onRemove: (index: number) => void;
}

function summaryText(s: PinnedPlanSummary): string {
  const dayWord = s.budgetSpent === 1 ? 'day' : 'days';
  const offWord = s.totalDaysOff === 1 ? 'day' : 'days';
  const breakWord = s.breakCountActual === 1 ? 'break' : 'breaks';
  return `${s.budgetSpent} PTO ${dayWord} → ${s.totalDaysOff} ${offWord} off · ${s.breakCountActual} ${breakWord}`;
}

/** Up to two saved scenarios. "Open saved plan" (P3; formerly "Restore") puts back every
 * setting the plan was saved with, exactly as before. */
export function PinnedPlansStrip({ summaries, onRestore, onRemove }: PinnedPlansStripProps) {
  if (summaries.length === 0) return null;
  return (
    <div id="saved-plans" className="space-y-1">
      <p className="text-xs text-muted">{summaries.length} of {MAX_PINNED_PLANS} plans saved on this device.</p>
      <ul aria-label="Saved plans" className="m-0 flex list-none flex-wrap items-center gap-2 p-0">
      {summaries.map((s, i) => (
        <li
          key={i}
          className="flex min-h-11 items-center gap-1 rounded-[6px] border border-line bg-surface pl-3 text-sm tabular-nums text-ink"
        >
          <span aria-hidden="true" className="mr-1 inline-block h-2.5 w-2.5 shrink-0 rounded-[2px] bg-accent" />
          <span>
            {summaryText(s)}
            {s.differentHolidays && <span className="block text-xs text-muted">Made with different company holidays</span>}
          </span>
          <button
            type="button"
            onClick={() => onRestore(i)}
            aria-label={summaries.length > 1 ? `Open saved plan ${i + 1}` : undefined}
            className="flex min-h-11 items-center px-2 font-semibold underline underline-offset-[0.22em] hover:bg-surface-alt"
          >
            Open saved plan
          </button>
          <button
            type="button"
            onClick={() => onRemove(i)}
            aria-label={`Remove saved plan ${i + 1}`}
            className="flex h-11 w-11 items-center justify-center text-lg text-muted hover:bg-surface-alt hover:text-ink"
          >
            &times;
          </button>
        </li>
      ))}
      </ul>
    </div>
  );
}
