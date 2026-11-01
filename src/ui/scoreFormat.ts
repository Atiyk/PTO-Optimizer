import type { Scores } from '@daysoff/engine/solver/types';

/** "78th", "91st", "1st", "2nd", "3rd", "11th"/"12th"/"13th" (the -teen exception). */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export interface ScoreLineInput {
  label: string;
  percentile: number;
  gloss: string;
}

/**
 * The single shared formatter every score line goes through, so Efficiency and Travel
 * always render in the identical "Label Nth · gloss" shape rather than two separately
 * hand-written templates that could drift apart.
 */
export function formatScoreLine({ label, percentile, gloss }: ScoreLineInput): string {
  return `${label} ${ordinal(percentile)} · ${gloss}`;
}

/**
 * Glosses are DERIVED from the percentile band, not hardcoded - a static "better than
 * most plans" string next to a 14th-percentile number was the actual bug (the gloss said
 * "better" for a below-average result). Shares the exact [33, 66] thresholds from
 * SCORE_INTENSITY, so the words and the bar's colour band always agree about what counts
 * as "below average," "average," and "above average" - one definition of the bands, not two.
 */
const EFFICIENCY_GLOSS: Record<IntensityBand, string> = {
  0: 'worse than most plans at this budget',
  1: 'about average for this budget',
  2: 'better than most plans at this budget',
};
const TRAVEL_GLOSS: Record<IntensityBand, string> = {
  0: 'busier than most weeks',
  1: 'about average for the year',
  2: 'quieter than most weeks',
};

export function efficiencyLine(scores: Scores): string {
  return formatScoreLine({
    label: 'Efficiency',
    percentile: scores.efficiency.percentile,
    gloss: EFFICIENCY_GLOSS[intensityBand(scores.efficiency.percentile)],
  });
}

export function travelLine(scores: Scores): string {
  return formatScoreLine({
    label: 'Travel',
    percentile: scores.travel.percentile,
    gloss: TRAVEL_GLOSS[intensityBand(scores.travel.percentile)],
  });
}

// --- Percentile bar: a single-hue intensity ramp on the FILL only, never the numeral ---

export type IntensityBand = 0 | 1 | 2;

/**
 * Thresholds and all three colour values live in this ONE constant, as specced, so the
 * band boundaries and their rendering can never drift apart or get edited independently.
 * Even thirds (33/66), not 40/60: an uneven split would flag two-fifths of outcomes as
 * the worst band, training users to ignore it.
 *
 * Single hue at three intensities, not red/yellow/green: that palette is the worst case for
 * colourblindness (red/green is the classic confusion pair, and the yellow between them
 * doesn't separate from either in greyscale), and "red" reads as "broken" when a
 * 30th-percentile plan is merely below average, not wrong.
 *
 * Redesign Phase 1: the hue is the site's one accent (burnt orange) and its two darker
 * shades - "one accent hue only" - instead of a separate indigo. The bars always sit next to
 * their percentile and gloss text, so sharing the accent never makes a bar read as a PTO
 * day. All three clear 4.5:1 on every background the strip can sit on (tokens.test.ts).
 *
 * `barClasses` are Tailwind classes referencing index.css's `--score-N` custom properties so
 * there is exactly one place these values live. `rgb` is the same three values as plain
 * triples for the contrast tests; tokens.test.ts checks they match the stylesheet.
 */
export const SCORE_INTENSITY = {
  thresholds: [33, 66] as const,
  barClasses: ['bg-[var(--score-1)]', 'bg-[var(--score-2)]', 'bg-[var(--score-3)]'] as const,
  rgb: [
    [194, 65, 12], // #c2410c
    [154, 52, 18], // #9a3412
    [124, 45, 18], // #7c2d12
  ] as [number, number, number][],
} as const;

/** Below the first threshold = band 0 (lightest/most muted of the three), between the
 * thresholds = band 1 (mid), at or above the second threshold = band 2 (strongest). */
export function intensityBand(percentile: number): IntensityBand {
  const [low, high] = SCORE_INTENSITY.thresholds;
  if (percentile < low) return 0;
  if (percentile < high) return 1;
  return 2;
}

export function barFillClass(percentile: number): string {
  return SCORE_INTENSITY.barClasses[intensityBand(percentile)];
}

/** The bar fill's width as a percentage of the track - literally the percentile, clamped.
 * Position is the primary, colour-independent signal: this function carries the actual
 * value regardless of which intensity band the fill happens to render in. */
export function barFillWidthPercent(percentile: number): number {
  return Math.max(0, Math.min(100, percentile));
}

// --- WCAG 2.x contrast, used only to verify the colours above meet 4.5:1 ---

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function relativeLuminance([r, g, b]: [number, number, number]): number {
  const [R, G, B] = [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

export function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const L1 = relativeLuminance(a);
  const L2 = relativeLuminance(b);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}
