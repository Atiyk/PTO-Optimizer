// Captions for every step (0, 10, 20, ..., 100) of the weighting slider, already in
// sentence case. The 0 and 100 wordings match the spec's own definitions; the rest fill in a
// legible gradient between them so the midpoints don't read as a jump. F13: these words are
// the only readout (visible and aria-valuetext); the bare 0-100 number stays in the URL only.
const CAPTIONS: Record<number, string> = {
  0: 'Maximize days off, ignore travel demand',
  10: 'Almost all about days off',
  20: 'Mostly days off',
  30: 'Mostly days off, with a slight pull toward quieter travel weeks',
  40: 'Days off first, quieter travel weeks second',
  50: 'Days off and quieter travel weeks count equally',
  60: 'Quieter travel weeks first, days off second',
  70: 'Mostly quieter travel weeks, some weight on days off',
  80: 'Mostly quieter travel weeks',
  90: 'Almost all about quieter travel weeks',
  100: 'Prioritize quieter travel weeks',
};

/** Two or three words per step, for a sentence that also names the break count (R1). */
const SHORT: Record<number, string> = {
  0: 'days off only',
  10: 'mostly days off',
  20: 'mostly days off',
  30: 'mostly days off',
  40: 'days off first',
  50: 'days off and quiet weeks equally',
  60: 'quiet weeks first',
  70: 'mostly quiet weeks',
  80: 'mostly quiet weeks',
  90: 'mostly quiet weeks',
  100: 'quiet weeks only',
};

function step(w: number): number {
  return Math.max(0, Math.min(100, Math.round(w / 10) * 10));
}

/** The words for a weighting value, as the slider shows them (F13: never the bare number). */
export function weightingCaption(w: number): string {
  return CAPTIONS[w] ?? CAPTIONS[step(w)];
}

/** A lowercase short form of the caption, for the planning-style helper line. */
export function weightingShort(w: number): string {
  return SHORT[step(w)];
}
