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

// Values live in index.css (2026-11 "highlighted schedule": ink actions, one marker for days off).
// Every pair is verified against the real stylesheet in tokens.test.ts / colorScheme.test.ts.
export const COLORS: ColorTokens = {
  ptoBg: 'bg-[var(--pto-bg)]',
  ptoBorder: 'border-[var(--pto-border)]',
  ptoText: 'text-[var(--pto-text)]',
  bandBg: 'bg-[var(--band-bg)]',
  previewBandBg: 'bg-[var(--band-bg)]/60',
  altBorder: 'border-[var(--alt-border)]',
  focusRing: 'ring-[var(--focus-ring)]',
};

// Shared text tokens, independent of the PTO/band scheme above. One token, one value: ink
// (headings, primary numerals) and muted (secondary text), both >= 4.5:1 on every surface.
export const TEXT_PRIMARY = 'text-[var(--text-primary)]';
export const TEXT_MUTED = 'text-[var(--text-muted)]';

/**
 * Text for a numeral sitting inside the days-off BAND specifically (a weekend day whose
 * cell is drawn over the band fill) - deliberately NOT TEXT_PRIMARY, which is slate-900 and
 * reserved for the page background, not the band fill. BAND_TEXT is its own token, pinned
 * against bandBg, matching the band's own always-light background.
 */
export const BAND_TEXT = 'text-[var(--band-text)]';

/**
 * Public holiday marker: a small dot, not a fill - a holiday is a fact about the
 * calendar, not something to act on. Deliberately the app's existing neutral (slate)
 * family, not a new hue: the calendar's only two "colours" are the PTO role (the accent)
 * and the band role (the warm tint); a third saturated hue for holidays was the actual bug
 * ("too busy" from each feature claiming its own colour) this token set replaces.
 */
export const HOLIDAY_DOT = 'bg-[var(--holiday-dot)]';
