import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { MarginalValue } from '@daysoff/engine/solver/marginalValue';
import { COLORS, HOLIDAY_DOT, TEXT_MUTED, TEXT_PRIMARY, BAND_TEXT } from './colorScheme';
import { buttonClasses } from './Button';
import type { DayCategory } from './types';

interface DayCellProps {
  date: string;
  dayOfMonth: number;
  category: DayCategory;
  hasOverlap: boolean;
  isAlternative: boolean;
  isToday: boolean;
  /** True when this date falls inside a rendered days-off band (restores primary text over muted). */
  inBand: boolean;
  /** True while this date's break is hovered/focused - via its own calendar badge, or its
   * matching break card below. The two directions share one highlight so hovering either
   * end of the link reads as the same state. */
  isHighlighted: boolean;
  isBlackout: boolean;
  /** Outside [rangeStart, rangeEnd] - the month grid shows full calendar months, so the
   * first/last months routinely have real dates that aren't part of the solve at all. */
  isOutOfRange: boolean;
  marginalValue: MarginalValue | null;
  holidayName: string | undefined;
  /** 'company' marks a day the employer calendar adds; drawn with a square, not a dot. */
  holidayKind?: 'public' | 'company';
  hasHover: boolean;
  onToggle: (date: string) => void;
  onSwapAlternative?: () => void;
  onHoverAlternativeStart?: () => void;
  onHoverAlternativeEnd?: () => void;
  onArrowKey?: (direction: 'left' | 'right' | 'up' | 'down' | 'home' | 'end') => void;
  /** Roving tabindex: the calendar is one tab stop; only the active day has 0. */
  tabIndex?: 0 | -1;
  /** Tells the calendar which day now holds the roving tab stop. */
  onFocusDay?: (date: string) => void;
  /** 1-based number of the break whose run this day sits in, for the accessible name. */
  breakIndex?: number;
  /** The person's explicit choice for this day, when the planner tracks one. */
  forcedState?: 'include' | 'exclude';
  /** With this, the touch sheet offers Take / Never / Let the planner decide directly. */
  onSetState?: (date: string, state: 'include' | 'exclude' | null) => void;
  /** The real outcome of pinning this day, from the planner's own solve (lazy). When
   * given, it replaces the engine's marginal estimate, so a hover never promises a gain the
   * plan cannot deliver. */
  pinPreview?: (date: string) => string | null;
}

/** A small pin glyph, not a colour, carries "pinned vs suggested" - placed beside the
 * numeral (not a corner mark, which wasn't legible at cell size), monochrome via
 * currentColor so it always matches the numeral's own text colour and never introduces a
 * new hue. */
export function PinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden="true">
      <path d="M8 1a4.25 4.25 0 0 0-4.25 4.25c0 2.9 3.4 7.49 4.03 8.32a.28.28 0 0 0 .44 0c.63-.83 4.03-5.42 4.03-8.32A4.25 4.25 0 0 0 8 1Zm0 6a1.75 1.75 0 1 1 0-3.5A1.75 1.75 0 0 1 8 7Z" />
    </svg>
  );
}

/** Phase 4C: marks an 'unpaid-leave' day beside its numeral, the same way PinIcon marks
 * 'pinned' - a shape, not a third fill colour (see the comment above categoryClasses). An
 * open ring reads distinctly from the solid pin glyph at cell size. */
export function UnpaidIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <circle cx="8" cy="8" r="5.25" />
    </svg>
  );
}

function formatMonthDay(iso: string): string {
  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  return `${MONTHS[month - 1]} ${day}`;
}

function formatWeekdayMonthDay(iso: string): string {
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const [y, m, d] = iso.split('-').map(Number);
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${formatMonthDay(iso)}`;
}

function marginalValueText(mv: MarginalValue): string {
  const base = `+${mv.deltaDays} day${mv.deltaDays === 1 ? '' : 's'} off for 1 PTO day (${mv.multiplier.toFixed(1)}x)`;
  const withCaveat = mv.multiplier <= 1 ? `${base} — the suggestions above do better.` : base;
  return `${withCaveat} Click to pin.`;
}

function stateLabel(category: DayCategory, isAlternative: boolean, isBlackout: boolean, isOutOfRange: boolean, holidayKind?: 'public' | 'company'): string {
  if (isOutOfRange) return 'outside the selected date range';
  if (isBlackout) return 'blackout, cannot be used for PTO';
  if (isAlternative) return 'alternative placement';
  switch (category) {
    case 'suggested-pto':
      return 'suggested PTO day';
    case 'pinned':
      return 'pinned by you';
    case 'unpaid-leave':
      return 'unpaid leave day';
    case 'public-holiday':
      return holidayKind === 'company' ? 'employer day off' : 'public holiday';
    case 'weekend':
      return 'weekend';
    case 'working':
      return 'working day';
  }
}

export function DayCell({
  date,
  dayOfMonth,
  category,
  hasOverlap,
  isAlternative,
  isToday,
  inBand,
  isHighlighted,
  isBlackout,
  isOutOfRange,
  marginalValue,
  holidayName,
  holidayKind,
  hasHover,
  onToggle,
  onSwapAlternative,
  onHoverAlternativeStart,
  onHoverAlternativeEnd,
  onArrowKey,
  tabIndex,
  onFocusDay,
  breakIndex,
  forcedState,
  onSetState,
  pinPreview,
}: DayCellProps) {
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dayButtonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Touch: the sheet sits at the bottom of the screen; if the tapped day would be under it,
  // scroll just enough to keep the day in view above the sheet.
  useEffect(() => {
    if (!tooltipOpen || hasHover) return;
    const frame = requestAnimationFrame(() => {
      const day = dayButtonRef.current?.getBoundingClientRect();
      const sheet = sheetRef.current?.getBoundingClientRect();
      if (day && sheet && day.bottom > sheet.top - 12) window.scrollBy?.({ top: day.bottom - sheet.top + 24 });
    });
    return () => cancelAnimationFrame(frame);
  }, [tooltipOpen, hasHover]);

  // Touch actions are a disclosure, not a hover-only tooltip. Dismiss when
  // tapping outside or pressing Escape, but preserve focus within the action panel.
  useEffect(() => {
    if (!tooltipOpen || hasHover) return;
    const onOutsidePointer = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setTooltipOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setTooltipOpen(false);
      dayButtonRef.current?.focus();
    };
    document.addEventListener('pointerdown', onOutsidePointer);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('pointerdown', onOutsidePointer);
      document.removeEventListener('keydown', onEscape);
    };
  }, [tooltipOpen, hasHover]);

  const isHolidayTip = !isOutOfRange && category === 'public-holiday' && !!holidayName;
  const hasTip = !isOutOfRange && (isHolidayTip || !!marginalValue);
  // The pin outcome is computed only while the tip is open (one solve per day, cached).
  const previewText = tooltipOpen && !isHolidayTip && marginalValue && pinPreview ? pinPreview(date) : null;
  const tooltipText = !hasTip
    ? null
    : isHolidayTip
      ? holidayName!
      : pinPreview
        ? previewText ?? 'Pin it to add it to the plan.'
        : marginalValueText(marginalValue!);

  const ariaLabel = [
    formatMonthDay(date),
    stateLabel(category, isAlternative, isBlackout, isOutOfRange, holidayKind),
    !isOutOfRange && breakIndex ? `part of break ${breakIndex}` : null,
    // The engine's estimate is only spoken where no verified preview exists (sabbatical);
    // the planner announces the real outcome through the tooltip description instead.
    hasTip && !isHolidayTip && !pinPreview ? `gains ${marginalValue!.deltaDays} day${marginalValue!.deltaDays === 1 ? '' : 's'} off` : null,
    isHolidayTip ? holidayName : null,
  ]
    .filter(Boolean)
    .join(', ');

  const primaryAction = isAlternative ? onSwapAlternative : () => onToggle(date);

  const handleClick = () => {
    if (isOutOfRange) return; // no interaction at all - there's nothing here to toggle
    if (hasHover) {
      primaryAction?.();
      return;
    }
    // Touch: tap only inspects - a real toggle needs the explicit button in the tooltip,
    // so a silent tap never does just one of (show info) / (change the plan).
    setTooltipOpen((v) => !v);
  };

  const handleKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      primaryAction?.();
      setTooltipOpen(false);
      return;
    }
    const direction =
      e.key === 'ArrowLeft' ? 'left' : e.key === 'ArrowRight' ? 'right' : e.key === 'ArrowUp' ? 'up' : e.key === 'ArrowDown' ? 'down' : e.key === 'Home' ? 'home' : e.key === 'End' ? 'end' : null;
    if (direction && onArrowKey) {
      e.preventDefault();
      onArrowKey(direction);
    }
  };

  // The calendar's only two colours: the PTO role (solid ink, "a day you're taking") and
  // the band role (the marker, rendered separately in MonthGrid), plus the one neutral
  // holiday dot. 'pinned' shares the exact same fill AND border as 'suggested-pto' -
  // deliberately - distinguished by the pin glyph beside the numeral below, never a third
  // fill colour or a border-weight difference that turned out illegible at cell size (see
  // NOTES.md).
  // Any non-PTO-like numeral that happens to sit on the days-off BAND fill (a weekend or
  // public holiday inside a qualifying off-stretch) needs BAND_TEXT specifically, not
  // TEXT_PRIMARY - bandBg never changes between light/dark mode, but TEXT_PRIMARY does (it
  // flips light for dark mode's now-dark page background), so TEXT_PRIMARY-on-band was a
  // real bug in dark mode (near-white text on the still-pale amber fill, 1.13:1 - caught by
  // Lighthouse, not by inspection). Outside a band, weekends stay muted; everything else
  // (holiday not in a band, working) stays TEXT_PRIMARY, matching the original intent.
  // Highlighted schedule (2026-11): ink numerals on the marker run, muted numerals on the
  // tone-stepped weekend column, and a solid ink block for every PTO day. Pinned shares the
  // PTO fill exactly and is told apart by its pin glyph, never by a third fill.
  // Ink & Signal Blue (2026-11): a holiday is Sea Glass Teal. Off a recommended run it sits on
  // the soft teal fill; inside a run the soft blue run shows through and the numeral and
  // marker turn teal, so "a holiday inside your break" reads as both at once.
  const isHoliday = category === 'public-holiday';
  const textColor = isHoliday
    ? 'text-[var(--holiday-ink)] font-semibold'
    : inBand ? BAND_TEXT : category === 'weekend' ? TEXT_MUTED : TEXT_PRIMARY;
  const isPtoLike = category === 'suggested-pto' || category === 'pinned' || category === 'unpaid-leave';
  const categoryClasses = isOutOfRange
    ? 'text-slate-300'
    : isPtoLike
      ? `${COLORS.ptoBg} border ${COLORS.ptoBorder} ${COLORS.ptoText} font-bold`
      : `${textColor} ${!inBand && category === 'weekend' ? 'bg-surface-alt' : ''} ${!inBand && isHoliday ? 'bg-holiday-soft' : ''} ${
          // A blackout day: neutral hatching (no brand colour), so "PTO can't go here" is a
          // texture plus its label, never a hue alone.
          isBlackout && !isPtoLike ? 'bg-[repeating-linear-gradient(135deg,var(--border-default)_0_2px,transparent_2px_7px)]' : ''
        } ${
          // A second marker pass over the run while its break is hovered or focused.
          isHighlighted ? 'bg-mark-strong' : ''
        }`;

  return (
    <div
      ref={wrapperRef}
      className="relative"
      onBlur={(event) => {
        // Mobile Safari can report a null relatedTarget when the action is tapped.
        // Outside pointer events and Escape handle touch dismissal separately.
        if (!hasHover && !event.relatedTarget) return;
        if (event.currentTarget.contains(event.relatedTarget)) return;
        if (isAlternative) onHoverAlternativeEnd?.();
        setTooltipOpen(false);
      }}
    >
      <button
        type="button"
        ref={dayButtonRef}
        id={`day-${date}`}
        data-date={date}
        disabled={isOutOfRange}
        tabIndex={isOutOfRange ? undefined : tabIndex}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onMouseEnter={() => {
          if (isOutOfRange) return;
          if (isAlternative) onHoverAlternativeStart?.();
          if (hasHover && hasTip) setTooltipOpen(true);
        }}
        onMouseLeave={() => {
          if (isAlternative) onHoverAlternativeEnd?.();
          if (hasHover) setTooltipOpen(false);
        }}
        onFocus={() => {
          if (isOutOfRange) return;
          onFocusDay?.(date);
          if (isAlternative) onHoverAlternativeStart?.();
          if (hasHover && hasTip) setTooltipOpen(true);
        }}
        aria-label={ariaLabel}
        aria-expanded={!hasHover ? tooltipOpen : undefined}
        aria-controls={!hasHover && tooltipOpen ? `tooltip-${date}` : undefined}
        aria-describedby={hasHover && tooltipOpen ? `tooltip-${date}` : undefined}
        // Every day cell is click-to-force (pin in / rule out), not just the ones with a
        // marginal-value tooltip - cursor-pointer plus a subtle hover outline is the only
        // signal that's true everywhere, which is why it isn't gated on tooltipText. An
        // out-of-range cell gets none of this: no cursor, no hover, no focus ring -
        // `disabled` already removes it from the tab order and all hover/click handling.
        className={`relative z-10 flex h-12 w-full items-center justify-center rounded-[6px] text-sm font-medium tabular-nums transition-colors duration-150 ${
          isOutOfRange
            ? 'cursor-default'
            : `cursor-pointer hover:outline hover:outline-1 hover:outline-offset-1 hover:outline-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${COLORS.focusRing}`
        } ${categoryClasses} ${
          // An alternative is a suggestion about a suggestion: a 1px dashed ink outline, no fill.
          isAlternative && !isOutOfRange ? `border border-dashed ${COLORS.altBorder}` : ''
        } ${
          // Today: a 2px ink ring, set off from the cell so it reads on an ink PTO block too.
          isToday && !isOutOfRange ? 'ring-2 ring-[var(--text-primary)] ring-offset-2 ring-offset-[var(--bg-surface)]' : ''
        } ${
          // The hovered break: an ink outline (a separate property from the today ring, so a
          // day that is both shows both).
          isHighlighted && !isOutOfRange ? 'outline outline-2 outline-offset-1 outline-[var(--text-primary)]' : ''
        }`}
      >
        {!isOutOfRange && category === 'pinned' ? (
          <span className="flex items-center gap-0.5">
            {dayOfMonth}
            <PinIcon className="h-3 w-3" />
          </span>
        ) : !isOutOfRange && category === 'unpaid-leave' ? (
          <span className="flex items-center gap-0.5">
            {dayOfMonth}
            <UnpaidIcon className="h-3 w-3" />
          </span>
        ) : (
          dayOfMonth
        )}
        {!isOutOfRange && category === 'public-holiday' && (
          <span
            aria-hidden
            className={`absolute bottom-1.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 ${holidayKind === 'company' ? 'rounded-[1px]' : 'rounded-full'} ${HOLIDAY_DOT}`}
          />
        )}
        {!isOutOfRange && hasOverlap && (
          // A ring around the dot (not just a colour swap) so it stays visible whatever it
          // happens to sit on - a plain dark cell in dark mode, or the now-light pto/band
          // fills - rather than needing one colour choice that only works on some of them.
          <span
            aria-label="Overlaps someone else's time off"
            className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-ink ring-1 ring-white"
          />
        )}
      </button>

      {tooltipOpen && (tooltipText || !hasHover) && (
        <div
          id={`tooltip-${date}`}
          ref={sheetRef}
          role={hasHover ? 'tooltip' : 'group'}
          aria-label={!hasHover ? `Actions for ${formatMonthDay(date)}` : undefined}
          className={hasHover
            ? 'absolute left-1/2 top-full z-20 mt-1 w-max max-w-[15rem] -translate-x-1/2 rounded-[6px] bg-ink px-2.5 py-1.5 text-sm text-white shadow-lg'
            : 'fixed inset-x-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-sm rounded-[10px] border border-line bg-surface p-4 text-sm text-ink shadow-xl md:bottom-4'}
        >
          {!hasHover && <p className="text-[15px] font-bold">{formatWeekdayMonthDay(date)}</p>}
          {hasHover ? <p>{tooltipText}</p> : (
            <p className="mt-0.5 text-muted">
              <span>{stateLabel(category, isAlternative, isBlackout, isOutOfRange, holidayKind)}</span>
              {tooltipText && <>. <span>{tooltipText}</span></>}
            </p>
          )}
          {!hasHover && (
            onSetState && !isAlternative ? (
              <div className="mt-3 grid gap-2" role="group" aria-label="Choose for this day">
                {([
                  ['include', 'Take this day off'],
                  ['exclude', 'Never take this day'],
                  [null, 'Let the planner decide'],
                ] as const).map(([value, label]) => {
                  const current = (forcedState ?? null) === value;
                  return (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={current}
                      onClick={() => {
                        onSetState(date, value);
                        setTooltipOpen(false);
                        dayButtonRef.current?.focus();
                      }}
                      className={buttonClasses(current ? 'primary' : 'secondary', 'md', 'w-full justify-start!')}
                    >
                      {label}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    setTooltipOpen(false);
                    dayButtonRef.current?.focus();
                  }}
                  className={buttonClasses('quiet', 'md', 'w-full')}
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                {!isAlternative && (
                  <p className="mt-1 text-sm text-muted">Change this date to include it, exclude it, or let the planner decide.</p>
                )}
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      primaryAction?.();
                      setTooltipOpen(false);
                      dayButtonRef.current?.focus();
                    }}
                    className={buttonClasses('primary', 'md', 'flex-1')}
                  >
                    {isAlternative ? 'Swap this in' : 'Change this day'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTooltipOpen(false);
                      dayButtonRef.current?.focus();
                    }}
                    className={buttonClasses('secondary', 'md')}
                  >
                    Close
                  </button>
                </div>
              </>
            )
          )}
        </div>
      )}
    </div>
  );
}
