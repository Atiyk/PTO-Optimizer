import { ordinal } from './scoreFormat';
import { Container } from './Container';

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
    <div className="border-b border-slate-200 bg-slate-50">
      <Container className="flex flex-wrap items-center gap-2 px-4 py-4">
      {summaries.map((s, i) => (
        <div
          key={i}
          className="flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs text-slate-700"
        >
          <span>{summaryText(s)}</span>
          <button
            type="button"
            onClick={() => onRestore(i)}
            className="font-medium text-slate-800 underline underline-offset-2 hover:no-underline"
          >
            restore
          </button>
          <button
            type="button"
            onClick={() => onRemove(i)}
            aria-label="Remove pinned plan"
            className="text-slate-400 hover:text-slate-700"
          >
            &times;
          </button>
        </div>
      ))}
      </Container>
    </div>
  );
}
