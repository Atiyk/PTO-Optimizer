import { InfoHint } from './InfoHint';

/** UI density pass: moved off its own permanent line, into a hover/focus hint on the label -
 * still true, just no longer worth a fourth line of prose above the calendar on every load. */
const TRAVEL_HINT =
  "Not travelling? Set this toward 0 — this slider is about demand on your dates, not whether you're going anywhere.";

// Captions for every step (0, 10, 20, ..., 100) of the weighting slider. The 0 and 100
// wordings match the spec's own definitions verbatim; the rest fill in a legible gradient
// between them so the midpoints don't read as a jump.
const CAPTIONS: Record<number, string> = {
  0: 'maximise days off, ignore travel demand',
  10: 'almost entirely maximising days off',
  20: 'mostly maximising days off',
  30: 'mostly maximising days off, with a light preference for quieter weeks',
  40: 'leaning toward days off, but weighing quieter weeks too',
  50: 'equally balancing days off and quieter weeks',
  60: 'leaning toward quieter weeks, but weighing days off too',
  70: 'mostly minimising travel demand, with some weight on days off',
  80: 'mostly minimising travel demand',
  90: 'almost entirely minimising travel demand',
  100: 'minimise travel demand, accept fewer days off',
};

interface WeightingSliderProps {
  value: number;
  onChange: (w: number) => void;
}

export function WeightingSlider({ value, onChange }: WeightingSliderProps) {
  return (
    <div className="flex flex-col gap-1">
      {/* Interaction-detail pass: the value sits in the label row itself, not only in the
          caption below - the eye shouldn't have to travel down to see what's currently set. */}
      <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
        What matters more?
        <InfoHint text={TRAVEL_HINT} />
        <span className="ml-auto tabular-nums text-slate-500">{value}</span>
      </div>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Most days off</span>
        <span>Cheapest to travel</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={10}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="What matters more?"
        aria-valuetext={`${value}: ${CAPTIONS[value]}`}
        className="w-full accent-slate-800"
      />
      <p className="text-xs text-slate-600">{CAPTIONS[value]}</p>
    </div>
  );
}
