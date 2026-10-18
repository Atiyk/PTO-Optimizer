import { COLORS, HOLIDAY_DOT } from './colorScheme';
import { PinIcon } from './DayCell';

/**
 * Exactly the five swatches the calendar actually uses, mixed swatch types matching what
 * each thing looks like - a dot stays a dot, not forced into a box it doesn't have.
 * "Pinned by you" reuses the exact Suggested PTO fill plus the same PinIcon glyph the
 * calendar itself renders, so the legend never describes a treatment the calendar doesn't
 * have. Weekend's entry is gone - the grid's own day-of-week headers already make
 * weekends self-evident. Overlap day and the click/hover instructions live beneath the
 * calendar now, not here, so this row stays short enough to wrap naturally instead of
 * stretching edge to edge.
 */
export function Legend() {
  return (
    <div className="flex flex-wrap items-center justify-start gap-4 text-sm text-slate-600 dark:text-slate-300">
      <span className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center">
          <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${HOLIDAY_DOT}`} />
        </span>
        Public holiday
      </span>
      <span className="flex items-center gap-2">
        <span className={`h-5 w-5 rounded border ${COLORS.ptoBorder} ${COLORS.ptoBg}`} />
        Suggested PTO
      </span>
      <span className="flex items-center gap-2">
        <span className={`flex h-5 w-5 items-center justify-center gap-0.5 rounded border ${COLORS.ptoBorder} ${COLORS.ptoBg} ${COLORS.ptoText}`}>
          <PinIcon className="h-3 w-3" />
        </span>
        Pinned by you
      </span>
      <span className="flex items-center gap-2">
        <span className={`h-5 w-5 rounded border border-dashed ${COLORS.altBorder}/40`} />
        Alternative
      </span>
      <span className="flex items-center gap-2">
        <span className={`h-4 w-6 rounded-full ${COLORS.bandBg}`} />
        Days off
      </span>
    </div>
  );
}
