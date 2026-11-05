import { ordinal } from './scoreFormat';

export interface PinnedPlanSummary {
  budgetSpent: number;
  totalDaysOff: number;
  breakCountActual: number;
  travelPercentile: number | null;
}

interface PinnedPlansStripProps {
  summaries: PinnedPlanSummary[];
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
 * this plan" (now a small control in the Headline itself - see UI density pass) snapshots
 * the full input state (everything that would be in the shareable URL) so sliders become
 * genuinely explorable: try something, pin it if it's interesting, keep exploring, restore
 * it later if the new direction doesn't pan out. Capped at two, since this is a quick
 * side-by-side comparison strip, not a saved-plans library.
 *
 * UI density pass: this component now renders ONLY the pinned-plan chips - the button and
 * its explanatory text moved into Headline.tsx ("a small control beside the result, not a
 * row"), so with nothing pinned yet there is nothing here to show at all.
 */
export function PinnedPlansStrip({ summaries, onRestore, onRemove }: PinnedPlansStripProps) {
  if (summaries.length === 0) return null;
  return (
    <ul aria-label="Pinned plans" className="m-0 flex list-none flex-wrap items-center gap-2 p-0">
      {summaries.map((s, i) => (
        <li
          key={i}
          className="flex min-h-11 items-center gap-1 rounded-[6px] border border-line bg-surface pl-3 text-sm tabular-nums text-ink"
        >
          <span aria-hidden="true" className="mr-1 inline-block h-2.5 w-2.5 shrink-0 bg-mark ring-1 ring-ink" />
          <span>{summaryText(s)}</span>
          <button
            type="button"
            onClick={() => onRestore(i)}
            className="flex min-h-11 items-center px-2 font-semibold underline underline-offset-[0.22em] hover:bg-surface-alt"
          >
            restore
          </button>
          <button
            type="button"
            onClick={() => onRemove(i)}
            aria-label="Remove pinned plan"
            className="flex h-11 w-11 items-center justify-center text-lg text-muted hover:bg-surface-alt hover:text-ink"
          >
            &times;
          </button>
        </li>
      ))}
    </ul>
  );
}
