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

/** The words for a weighting value, as the slider shows them (F13: never the bare number). */
export function weightingCaption(w: number): string {
  return CAPTIONS[w] ?? CAPTIONS[Math.max(0, Math.min(100, Math.round(w / 10) * 10))];
}
