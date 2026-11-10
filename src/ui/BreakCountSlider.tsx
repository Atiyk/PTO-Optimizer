import type { Break } from '@daysoff/engine/solver/types';
import { InfoHint } from './InfoHint';

/** UI density pass: the full disruption/pile-up reasoning moved off its own permanent line
 * into a hover/focus hint on the label - still the Phase 3.3 framing, just not a fourth
 * line of prose above the calendar on every load. */
const BREAK_COUNT_HINT =
  'One big break means more disruption but more recovery time. Shorter, more frequent breaks mean less pile-up when you return to work.';

interface BreakCountSliderProps {
  value: number; // 1-7, the slider's own stored position (shown disabled while letSolverDecide)
  onChange: (n: number) => void;
  letSolverDecide: boolean;
  onToggleLetSolverDecide: (v: boolean) => void;
  breaks: Break[];
  breakCountRequested: number; // what was actually sent to the solver (0 while letSolverDecide)
  breakCountActual: number;
  budget: number;
  pending?: boolean;
}

/** Position 1 and 7 get the spec's own wording; 2-6 are just their number - the fewest-to-
 * most progression already reads as "1, 2, 3 ... 7" without a label on every step. */
function positionLabel(pos: number): string {
  if (pos === 1) return '1 (all in one)';
  if (pos === 7) return 'As many as possible';
  return String(pos);
}

/**
 * The caption always describes the SOLVED plan, never a prediction computed by dividing
 * the budget - a 9-day break costs 4 PTO days, not 9, so arithmetic on the budget alone
 * would be roughly double the right answer. While "let the solver decide" is checked, the
 * caption is phrased as a RESULT ("Solver chose N breaks..."), not as if the user had set
 * the slider to that position themselves - the slider is inert then, and the text should
 * read that way too.
 */
function caption(requested: number, actual: number, breaks: Break[], budget: number, letSolverDecide: boolean): string {
  if (requested >= 1 && requested <= 6 && actual !== requested) {
    const breakWord = requested === 1 ? 'break' : 'breaks';
    const budgetWord = budget === 1 ? 'day' : 'days';
    return `Found ${actual} of ${requested} requested ${breakWord} with ${budget} PTO ${budgetWord} and the current date settings.`;
  }
  if (actual === 0 || breaks.length === 0) {
    return 'The planner found no breaks for the current dates and settings.';
  }
  const avgLen = Math.round(breaks.reduce((s, b) => s + b.totalDaysOff, 0) / breaks.length);
  const dayWord = avgLen === 1 ? 'day' : 'days';
  if (requested === 1) return `1 (all in one) · about ${avgLen} ${dayWord}`;
  if (requested === 7) return `As many as possible · ${actual} break${actual === 1 ? '' : 's'}, about ${avgLen} ${dayWord} each`;
  const breakWord = actual === 1 ? 'break' : 'breaks';
  return letSolverDecide
    ? `Solver chose ${actual} ${breakWord} · about ${avgLen} ${dayWord} each`
    : `${actual} ${breakWord} · about ${avgLen} ${dayWord} each`;
}

export function BreakCountSlider({
  value,
  onChange,
  letSolverDecide,
  onToggleLetSolverDecide,
  breaks,
  breakCountRequested,
  breakCountActual,
  budget,
  pending = false,
}: BreakCountSliderProps) {
  return (
    <div className="flex flex-col gap-1">
      {/* Interaction-detail pass: the chosen position shows in the label row itself when the
          slider is actually the user's own setting - when the solver decides instead, the
          slider is inert and the caption below already states the result ("Solver chose N
          breaks..."), so a second number up here would just duplicate it. */}
      <div className="flex items-center gap-1.5 text-[15px] font-semibold text-ink">
        How many breaks
        <InfoHint text={BREAK_COUNT_HINT} />
        {!letSolverDecide && <span className="ml-auto tabular-nums text-muted">{positionLabel(value)}</span>}
      </div>
      <label className="flex min-h-11 w-fit cursor-pointer items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={letSolverDecide}
          onChange={(e) => onToggleLetSolverDecide(e.target.checked)}
        />
        Let the planner choose
      </label>
      {/* Dimmed AND desaturated as a single block (labels + thumb together) - opacity alone
          left a still-fully-coloured thumb sitting at a specific position, which read as
          "a setting the user chose" even once the accent colour itself was muted. Combined
          with grayscale, it reads unambiguously as inert, not just faded. */}
      <div className={letSolverDecide ? 'grayscale' : ''}>
        {/* Phase 3.3's full "more disruption/less pile-up" reasoning now lives in the
            InfoHint above - these are short axis labels (matching WeightingSlider's own
            "Most days off"/"Cheapest to travel" pattern), not the explanation itself. */}
        <div className="flex items-center justify-between gap-3 text-xs text-muted">
          <span>One big break</span>
          <span>Many short breaks</span>
        </div>
        <input
          type="range"
          min={1}
          max={7}
          step={1}
          value={value}
          disabled={letSolverDecide}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="How many breaks"
          aria-valuetext={`${positionLabel(value)}${letSolverDecide ? ' (disabled — letting the solver decide)' : ''}`}
          className={`h-11 w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${letSolverDecide ? 'accent-slate-300' : ''}`}
        />
      </div>
      <p className="-mt-1 text-sm tabular-nums text-muted">{pending ? 'Updating your plan…' : caption(breakCountRequested, breakCountActual, breaks, budget, letSolverDecide)}</p>
    </div>
  );
}
