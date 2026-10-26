// The calendar's palette: one accent (suggested PTO) plus one quiet neutral tint (the
// days-off band) and a single neutral mark (the holiday dot) - nothing else. Values come
// from the CSS custom properties in index.css, so this is the one place the calendar's
// colours are assembled from the shared design-system tokens.
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

// Contrast ratios: ptoBg/ptoText (blue-900/white) = 10.36:1, bandBg/bandText
// (amber-100/slate-800) = 11.75:1. Verified in colorScheme.test.ts.
/**
 * THE primary-action treatment - the accent's second of its three reserved uses (suggested
 * PTO, this, and focus rings). One button on the page gets this at a time; everything else
 * is a neutral, bordered secondary button.
 */
export const ACCENT_BUTTON =
  'bg-[var(--pto-bg)] text-white hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[var(--focus-ring)]';

export const COLORS: ColorTokens = {
  ptoBg: 'bg-[var(--pto-bg)]',
  ptoBorder: 'border-[var(--pto-border)]',
  ptoText: 'text-[var(--pto-text)]',
  bandBg: 'bg-[var(--band-bg)]',
  previewBandBg: 'bg-[var(--band-bg)]/60',
  altBorder: 'border-[var(--alt-border)]',
  focusRing: 'ring-[var(--focus-ring)]',
};

// Shared text tokens, independent of the PTO/band scheme above. One token, one value: slate-900
// on white = 17.85:1 (headings, primary numerals), slate-500 on white = 4.76:1 (secondary text).
export const TEXT_PRIMARY = 'text-[var(--text-primary)]';
export const TEXT_MUTED = 'text-[var(--text-muted)]';

/**
 * Text for a numeral sitting inside the days-off BAND specifically (a weekend day whose
 * cell is drawn over the band fill) - deliberately NOT TEXT_PRIMARY, which is slate-900 and
 * reserved for the page background, not the amber band fill. BAND_TEXT is pinned to
 * slate-800 against bandBg's amber-100, matching the band's own always-light background.
 */
export const BAND_TEXT = 'text-[var(--band-text)]';

/**
 * Public holiday marker: a small dot, not a fill - a holiday is a fact about the
 * calendar, not something to act on. Deliberately the app's existing neutral (slate)
 * family, not a new hue: the calendar's only two "colours" are the PTO role (the accent)
 * and the band role (the amber tint); a third saturated hue for holidays was the actual bug
 * ("too busy" from each feature claiming its own colour) this token set replaces.
 * Slate-600 on white = 7.58:1.
 */
export const HOLIDAY_DOT = 'bg-[var(--holiday-dot)]';
