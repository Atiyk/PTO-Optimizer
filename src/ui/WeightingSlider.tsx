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
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">What matters more?</h3>
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
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
        className="w-full accent-slate-800 dark:accent-slate-300"
      />
      <p className="text-xs text-slate-600 dark:text-slate-300">
        <span className="font-medium text-slate-800 dark:text-slate-100">{value}</span> &middot; {CAPTIONS[value]}
      </p>
    </div>
  );
}
