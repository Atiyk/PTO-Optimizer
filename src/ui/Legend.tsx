import { COLORS, HOLIDAY_DOT } from './colorScheme';
import { PinIcon } from './DayCell';

/**
 * The calendar's key, drawn with exactly the treatments the grid uses: a holiday dot, a
 * solid ink PTO block, the same block with the pin glyph, a dashed ink outline for an
 * alternative, the marker run for days off, and the ink ring for today. Every entry is a
 * shape plus words, never colour alone.
 */
export function Legend() {
  return (
    <ul className="m-0 flex list-none flex-wrap items-center gap-x-5 gap-y-2 p-0 text-sm text-muted">
      <li className="flex items-center gap-2">
        <span aria-hidden className="relative flex h-5 w-5 items-center justify-center rounded-[6px] border border-line bg-surface">
          <span className={`absolute bottom-0.5 h-1.5 w-1.5 rounded-full ${HOLIDAY_DOT}`} />
        </span>
        Public holiday
      </li>
      <li className="flex items-center gap-2">
        <span aria-hidden className={`h-5 w-5 rounded-[6px] border ${COLORS.ptoBorder} ${COLORS.ptoBg}`} />
        Suggested PTO
      </li>
      <li className="flex items-center gap-2">
        <span aria-hidden className={`flex h-5 w-5 items-center justify-center rounded-[6px] border ${COLORS.ptoBorder} ${COLORS.ptoBg} ${COLORS.ptoText}`}>
          <PinIcon className="h-3 w-3" />
        </span>
        Pinned by you
      </li>
      <li className="flex items-center gap-2">
        <span aria-hidden className={`h-5 w-5 rounded-[6px] border border-dashed ${COLORS.altBorder}`} />
        Alternative
      </li>
      <li className="flex items-center gap-2">
        <span aria-hidden className={`h-5 w-9 rounded-[10px] border-b border-[var(--text-primary)] ${COLORS.bandBg}`} />
        Days off
      </li>
      <li className="flex items-center gap-2">
        <span aria-hidden className="h-4 w-4 rounded-[6px] ring-2 ring-[var(--text-primary)] ring-offset-2 ring-offset-[var(--bg-page)]" />
        Today
      </li>
    </ul>
  );
}
