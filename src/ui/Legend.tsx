import { COLORS, HOLIDAY_DOT } from './colorScheme';
import { PinIcon } from './DayCell';

/**
 * The calendar's key, drawn with exactly the treatments the grid uses: a teal holiday dot on
 * the soft teal fill (a square for employer days off), a solid Signal Blue PTO block, the
 * same block with the pin glyph, a dashed blue outline for an alternative, the soft blue run
 * with its rule for a recommended break, neutral hatching for blackout days, and the ink
 * ring for today. Every entry is a shape plus words, never colour alone. Employer and
 * blackout entries appear only when the plan has such days.
 */
export function Legend({ showCompany, showBlackout, showPinned, showAlternatives, showOutside }: {
  showCompany?: boolean;
  /** F27: when the calendar shows dates before or after the planning range. */
  showOutside?: boolean;
  showBlackout?: boolean;
  showPinned?: boolean;
  showAlternatives?: boolean;
} = {}) {
  return (
    <ul className="m-0 flex list-none flex-wrap items-center gap-x-5 gap-y-2 p-0 text-sm text-muted">
      <li className="flex items-center gap-2">
        <span aria-hidden className="relative flex h-5 w-5 items-center justify-center rounded-[6px] bg-holiday-soft">
          <span className={`absolute bottom-0.5 h-1.5 w-1.5 rounded-full ${HOLIDAY_DOT}`} />
        </span>
        Public holiday
      </li>
      {showCompany && (
        <li className="flex items-center gap-2">
          <span aria-hidden className="relative flex h-5 w-5 items-center justify-center rounded-[6px] bg-holiday-soft">
            <span className={`absolute bottom-0.5 h-1.5 w-1.5 rounded-[1px] ${HOLIDAY_DOT}`} />
          </span>
          Employer day off
        </li>
      )}
      <li className="flex items-center gap-2">
        <span aria-hidden className={`h-5 w-5 rounded-[6px] border ${COLORS.ptoBorder} ${COLORS.ptoBg}`} />
        PTO to request
      </li>
      {showPinned && <li className="flex items-center gap-2">
        <span aria-hidden className={`flex h-5 w-5 items-center justify-center rounded-[6px] border ${COLORS.ptoBorder} ${COLORS.ptoBg} ${COLORS.ptoText}`}>
          <PinIcon className="h-3 w-3" />
        </span>
        Pinned PTO
      </li>}
      {showAlternatives && <li className="flex items-center gap-2">
        <span aria-hidden className={`h-5 w-5 rounded-[6px] border border-dashed ${COLORS.altBorder}`} />
        Alternative
      </li>}
      <li className="flex items-center gap-2">
        <span aria-hidden className={`h-5 w-9 rounded-[8px] border-b-[3px] border-[var(--accent)] ${COLORS.bandBg}`} />
        Suggested break
      </li>
      {showBlackout && (
        <li className="flex items-center gap-2">
          <span aria-hidden className="h-5 w-5 rounded-[6px] border border-line bg-[repeating-linear-gradient(135deg,var(--border-default)_0_2px,transparent_2px_7px)]" />
          Unavailable
        </li>
      )}
      {showOutside && (
        <li className="flex items-center gap-2">
          <span aria-hidden className="flex h-5 w-5 items-center justify-center text-xs tabular-nums text-[var(--outside-text)]">9</span>
          Outside your dates
        </li>
      )}
      <li className="flex items-center gap-2">
        <span aria-hidden className="h-4 w-4 rounded-[6px] ring-2 ring-[var(--text-primary)] ring-offset-2 ring-offset-[var(--bg-page)]" />
        Today
      </li>
    </ul>
  );
}
