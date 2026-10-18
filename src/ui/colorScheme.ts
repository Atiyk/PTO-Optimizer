// Single switch for the calendar's two color semantics. Flip COLOR_SCHEME to compare.
//   A: coral = suggested PTO, teal = days-off band (the original design)
//   B: deep neutral-blue = suggested PTO, warm amber = days-off band
// Coral reads as a warning color while marking the thing being recommended, so B is the
// default; A is kept fully working behind the switch for comparison.
export const COLOR_SCHEME: 'A' | 'B' = 'B';

export interface ColorTokens {
  ptoBg: string;
  ptoBorder: string;
  /** Darkest shade of the same hue as ptoBg - never white-on-midtone (fails WCAG AA ~3.5:1). */
  ptoText: string;
  bandBg: string;
  previewBandBg: string;
  /** Alternative-placement dashed outline - same hue family as ptoBg, never a new color. */
  altBorder: string;
  focusRing: string;
}

// Contrast ratios below computed via the WCAG relative-luminance formula; see NOTES.md.
const SCHEME_A: ColorTokens = {
  ptoBg: 'bg-[#ff6b4a]',
  ptoBorder: 'border-[#c23f23]',
  ptoText: 'text-red-950', // #450a0a on #ff6b4a = 5.73:1, passes AA (was white = 2.82:1, failed)
  bandBg: 'bg-teal-300',
  previewBandBg: 'bg-teal-300/60',
  altBorder: 'border-[#ff6b4a]',
  focusRing: 'ring-[#ff6b4a]',
};

const SCHEME_B: ColorTokens = {
  ptoBg: 'bg-blue-900',
  ptoBorder: 'border-blue-950',
  ptoText: 'text-white', // white on #1e3a8a = 10.36:1
  bandBg: 'bg-amber-200',
  previewBandBg: 'bg-amber-200/60',
  altBorder: 'border-blue-900',
  focusRing: 'ring-blue-900',
};

const SCHEMES: Record<'A' | 'B', ColorTokens> = { A: SCHEME_A, B: SCHEME_B };
export const COLORS: ColorTokens = SCHEMES[COLOR_SCHEME];

// Shared text tokens, independent of the PTO/band scheme above.
// slate-500 (not the previous slate-400) on white = 4.76:1, passes AA; slate-400 was 2.56:1.
export const TEXT_PRIMARY = 'text-slate-800';
export const TEXT_MUTED = 'text-slate-500';

/**
 * Public holiday marker: a small dot, not a fill - a holiday is a fact about the
 * calendar, not something to act on. Deliberately the app's existing neutral (slate)
 * family, not a new hue: the calendar's only two "colours" are the PTO role (coral/blue)
 * and the band role (teal/amber); a third saturated hue for holidays was the actual bug
 * ("too busy" from each feature claiming its own colour) this token set replaces.
 * slate-600 on white = 7.58:1 - not load-bearing since only numerals need 4.5:1 per the
 * spec, but comfortably legible regardless.
 */
export const HOLIDAY_DOT = 'bg-slate-600';
