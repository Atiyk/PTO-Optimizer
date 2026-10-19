// Single switch for the calendar's two color semantics. Flip COLOR_SCHEME to compare.
//   A: coral = suggested PTO, teal = days-off band (the original design)
//   B: deep neutral-blue = suggested PTO, warm amber = days-off band
// Coral reads as a warning color while marking the thing being recommended, so B is the
// default; A is kept fully working behind the switch for comparison. Scheme A has no dark
// variant defined (see colorScheme.test.ts) - B is the one actually shipped.
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

// Values come from the CSS custom properties in index.css, which redefine themselves under
// prefers-color-scheme - so this ONE token set already covers both light and dark, with no
// separate dark token object and no component ever branching on theme itself. Light-mode
// values: ptoBg blue-900/white text = 10.36:1, bandBg amber-200/slate-800 text = 11.75:1.
// Dark-mode values: ptoBg blue-400/slate-900 text = 7.02:1, bandBg unchanged (already pops
// against a dark background). Both re-verified in colorScheme.test.ts.
const SCHEME_B: ColorTokens = {
  ptoBg: 'bg-[var(--pto-bg)]',
  ptoBorder: 'border-[var(--pto-border)]',
  ptoText: 'text-[var(--pto-text)]',
  bandBg: 'bg-[var(--band-bg)]',
  previewBandBg: 'bg-[var(--band-bg)]/60',
  altBorder: 'border-[var(--alt-border)]',
  focusRing: 'ring-[var(--focus-ring)]',
};

const SCHEMES: Record<'A' | 'B', ColorTokens> = { A: SCHEME_A, B: SCHEME_B };
export const COLORS: ColorTokens = SCHEMES[COLOR_SCHEME];

// Shared text tokens, independent of the PTO/band scheme above. Same CSS-variable approach:
// one token, both themes. Light: slate-800/slate-500 on white = 14.63:1 / 4.76:1. Dark:
// slate-100/slate-400 on slate-800 (the card surface) = 13.35:1 / 5.71:1.
export const TEXT_PRIMARY = 'text-[var(--text-primary)]';
export const TEXT_MUTED = 'text-[var(--text-muted)]';

/**
 * Text for a numeral sitting inside the days-off BAND specifically (a weekend day whose
 * cell is drawn over the band fill) - deliberately NOT TEXT_PRIMARY. bandBg never changes
 * between light and dark mode (amber-200 in both), but TEXT_PRIMARY DOES - it flips to a
 * light colour in dark mode for use on the now-dark page/card background. Reusing
 * TEXT_PRIMARY here was a real bug: a dark-mode weekend-in-band cell rendered near-white
 * text (slate-100) on the still-pale-amber band fill, 1.13:1 - found by Lighthouse's
 * accessibility audit, not by inspection. BAND_TEXT is pinned to slate-800 in both themes,
 * matching bandBg's own light-mode-always value.
 */
export const BAND_TEXT = 'text-[var(--band-text)]';

/**
 * Public holiday marker: a small dot, not a fill - a holiday is a fact about the
 * calendar, not something to act on. Deliberately the app's existing neutral (slate)
 * family, not a new hue: the calendar's only two "colours" are the PTO role (coral/blue)
 * and the band role (teal/amber); a third saturated hue for holidays was the actual bug
 * ("too busy" from each feature claiming its own colour) this token set replaces.
 * Light: slate-600 on white = 7.58:1. Dark: slate-300 on slate-800 = 9.85:1 - light mode's
 * slate-600 would be nearly invisible against a dark card, so the dark value is lighter,
 * not darker.
 */
export const HOLIDAY_DOT = 'bg-[var(--holiday-dot)]';
