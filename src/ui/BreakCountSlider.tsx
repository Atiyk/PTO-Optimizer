import type { Break } from '../solver/types';

interface BreakCountSliderProps {
  value: number; // 1-7, the slider's own stored position (shown disabled while letSolverDecide)
  onChange: (n: number) => void;
  letSolverDecide: boolean;
  onToggleLetSolverDecide: (v: boolean) => void;
  breaks: Break[];
  breakCountRequested: number; // what was actually sent to the solver (0 while letSolverDecide)
  breakCountActual: number;
  budget: number;
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
    return `${requested} ${breakWord} isn't possible with ${budget} PTO ${budgetWord} — showing ${actual}`;
  }
  if (actual === 0 || breaks.length === 0) {
    return letSolverDecide ? 'Solver found no workable plan' : 'Not enough PTO days for a plan';
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
}: BreakCountSliderProps) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">How many breaks</h3>
      <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
        <input
          type="checkbox"
          checked={letSolverDecide}
          onChange={(e) => onToggleLetSolverDecide(e.target.checked)}
        />
        Let the solver decide
      </label>
      {/* Dimmed AND desaturated as a single block (labels + thumb together) - opacity alone
          left a still-fully-coloured thumb sitting at a specific position, which read as
          "a setting the user chose" even once the accent colour itself was muted. Combined
          with grayscale, it reads unambiguously as inert, not just faded. */}
      <div className={letSolverDecide ? 'opacity-40 grayscale' : ''}>
        {/* Phase 3.3: the mechanism is unchanged (still 1-7, still "how many breaks") - only
            the framing around it. "All in one"/"As many as possible" described the slider's
            own structure and said nothing about why either end might matter; too much
            workload to justify time off (43%) and fear of falling behind (30%) are both
            about what a break COSTS to take, which these two captions now name directly. */}
        <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="max-w-[45%]">One big break. More disruption, more recovery.</span>
          <span className="max-w-[45%] text-right">Shorter breaks. Less pile-up when you return.</span>
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
          className={`w-full disabled:cursor-not-allowed ${letSolverDecide ? 'accent-slate-300 dark:accent-slate-600' : 'accent-slate-800 dark:accent-slate-300'}`}
        />
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-300">{caption(breakCountRequested, breakCountActual, breaks, budget, letSolverDecide)}</p>
    </div>
  );
}
