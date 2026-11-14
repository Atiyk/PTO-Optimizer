import { InfoHint } from './InfoHint';
import { weightingCaption } from './weightingCaptions';

/** UI density pass: moved off its own permanent line, into a hover/focus hint on the label -
 * still true, just no longer worth a fourth line of prose above the calendar on every load. */
const TRAVEL_HINT =
"Not traveling? Set this toward Most days off. This only weighs a rough travel estimate for your dates. In the US it's a 7-day average of 2025 airport checkpoint counts, so it shows seasons, not particular days. Other countries use a generic seasonal rule. It's not a forecast or a fare price.";

interface WeightingSliderProps {
  value: number;
  onChange: (w: number) => void;
}

export function WeightingSlider({ value, onChange }: WeightingSliderProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-[15px] font-semibold text-ink">
        What matters more?
        <InfoHint text={TRAVEL_HINT} />
      </div>
      <div className="flex items-center justify-between gap-3 text-xs text-muted">
        <span>Most days off</span>
        <span>Favor quieter estimates</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={10}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="What matters more?"
        aria-valuetext={weightingCaption(value)}
        className="h-11 w-full cursor-pointer"
      />
      <p className="-mt-1 text-sm text-muted">{weightingCaption(value)}</p>
    </div>
  );
}
