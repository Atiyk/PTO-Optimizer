import { InfoHint } from './InfoHint';

/** UI density pass: moved off its own permanent line, into a hover/focus hint on the label -
 * still true, just no longer worth a fourth line of prose above the calendar on every load. */
const TRAVEL_HINT =
"Not traveling? Set this toward Most days off. This only weighs a rough travel estimate for your dates. In the US it's a 7-day average of 2025 airport checkpoint counts, so it shows seasons, not particular days. Other countries use a generic seasonal rule. It's not a forecast or a fare price.";

// Captions for every step (0, 10, 20, ..., 100) of the weighting slider, already in
// sentence case. The 0 and 100 wordings match the spec's own definitions; the rest fill in a
// legible gradient between them so the midpoints don't read as a jump. F13: these words are
// the only readout (visible and aria-valuetext); the bare 0-100 number stays in the URL only.
const CAPTIONS: Record<number, string> = {
  0: 'Maximize days off, ignore travel demand',
  10: 'Almost entirely maximizing days off',
  20: 'Mostly maximizing days off',
  30: 'Mostly maximizing days off, with a light preference for quieter weeks',
  40: 'Leaning toward days off, but weighing quieter weeks too',
  50: 'Weighing both days off and the travel estimate',
  60: 'Leaning toward quieter weeks, but weighing days off too',
  70: 'Mostly favoring quieter estimated periods, with some weight on days off',
  80: 'Mostly favoring quieter estimated periods',
  90: 'Strongly favoring quieter estimated periods',
  100: 'Prioritize quieter estimated periods',
};

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
        aria-valuetext={CAPTIONS[value]}
        className="h-11 w-full cursor-pointer"
      />
      <p className="-mt-1 text-sm text-muted">{CAPTIONS[value]}</p>
    </div>
  );
}
