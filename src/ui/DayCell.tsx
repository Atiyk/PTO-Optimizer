import { useState, type KeyboardEvent } from 'react';
import type { MarginalValue } from '../solver/marginalValue';
import { COLORS, HOLIDAY_DOT, TEXT_MUTED, TEXT_PRIMARY, BAND_TEXT } from './colorScheme';
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
  hasHover: boolean;
  onToggle: (date: string) => void;
  onSwapAlternative?: () => void;
  onHoverAlternativeStart?: () => void;
  onHoverAlternativeEnd?: () => void;
  onArrowKey?: (direction: 'left' | 'right' | 'up' | 'down') => void;
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

function formatMonthDay(iso: string): string {
  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  return `${MONTHS[month - 1]} ${day}`;
}

function marginalValueText(mv: MarginalValue): string {
  const base = `+${mv.deltaDays} day${mv.deltaDays === 1 ? '' : 's'} off for 1 PTO day (${mv.multiplier.toFixed(1)}x)`;
  const withCaveat = mv.multiplier <= 1 ? `${base} — the suggestions above do better.` : base;
  return `${withCaveat} Click to pin.`;
}

function stateLabel(category: DayCategory, isAlternative: boolean, isBlackout: boolean, isOutOfRange: boolean): string {
  if (isOutOfRange) return 'outside the selected date range';
  if (isBlackout) return 'blackout, cannot be used for PTO';
  if (isAlternative) return 'alternative placement';
  switch (category) {
    case 'suggested-pto':
      return 'suggested PTO day';
    case 'pinned':
      return 'pinned by you';
    case 'public-holiday':
      return 'public holiday';
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
  hasHover,
  onToggle,
  onSwapAlternative,
  onHoverAlternativeStart,
  onHoverAlternativeEnd,
  onArrowKey,
}: DayCellProps) {
  const [tooltipOpen, setTooltipOpen] = useState(false);

  const tooltipText = isOutOfRange
    ? null
    : category === 'public-holiday' && holidayName
      ? holidayName
      : marginalValue
        ? marginalValueText(marginalValue)
        : null;

  const ariaLabel = [
    formatMonthDay(date),
    stateLabel(category, isAlternative, isBlackout, isOutOfRange),
    tooltipText && category !== 'public-holiday' ? `gains ${marginalValue!.deltaDays} day${marginalValue!.deltaDays === 1 ? '' : 's'} off` : null,
    tooltipText && category === 'public-holiday' ? tooltipText : null,
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

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      primaryAction?.();
      return;
    }
    const direction =
      e.key === 'ArrowLeft' ? 'left' : e.key === 'ArrowRight' ? 'right' : e.key === 'ArrowUp' ? 'up' : e.key === 'ArrowDown' ? 'down' : null;
    if (direction && onArrowKey) {
      e.preventDefault();
      onArrowKey(direction);
    }
  };

  // The calendar's only two colours: the PTO role (coral/blue, "a day you're taking") and
  // the band role (teal/amber, rendered separately in MonthGrid), plus the one neutral
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
  const textColor = inBand ? BAND_TEXT : category === 'weekend' ? TEXT_MUTED : TEXT_PRIMARY;
  const isPtoLike = category === 'suggested-pto' || category === 'pinned';
  // Suggested PTO is the thing the user must act on - the strongest, most saturated
  // treatment on the page, deliberately heavier than the quiet "days off" band behind it
  // (font-bold, not font-medium - no border-weight change, which DayCell.test.tsx already
  // pins pinned/suggested-pto to sharing exactly, border weight included).
  const categoryClasses = isOutOfRange
    ? 'text-slate-300'
    : isPtoLike
      ? `${COLORS.ptoBg} border ${COLORS.ptoBorder} ${COLORS.ptoText} font-bold`
      : textColor;

  return (
    <div className="relative">
      <button
        type="button"
        id={`day-${date}`}
        data-date={date}
        disabled={isOutOfRange}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onMouseEnter={() => {
          if (isOutOfRange) return;
          if (isAlternative) onHoverAlternativeStart?.();
          if (tooltipText) setTooltipOpen(true);
        }}
        onMouseLeave={() => {
          if (isAlternative) onHoverAlternativeEnd?.();
          if (hasHover) setTooltipOpen(false);
        }}
        onFocus={() => {
          if (isOutOfRange) return;
          if (isAlternative) onHoverAlternativeStart?.();
          if (tooltipText) setTooltipOpen(true);
        }}
        onBlur={() => {
          if (isAlternative) onHoverAlternativeEnd?.();
          setTooltipOpen(false);
        }}
        aria-label={ariaLabel}
        aria-describedby={tooltipOpen ? `tooltip-${date}` : undefined}
        // Every day cell is click-to-force (pin in / rule out), not just the ones with a
        // marginal-value tooltip - cursor-pointer plus a subtle hover outline is the only
        // signal that's true everywhere, which is why it isn't gated on tooltipText. An
        // out-of-range cell gets none of this: no cursor, no hover, no focus ring -
        // `disabled` already removes it from the tab order and all hover/click handling.
        className={`relative z-10 flex h-12 w-full items-center justify-center rounded text-sm transition-colors ${
          isOutOfRange
            ? 'cursor-default'
            : `cursor-pointer hover:brightness-95 hover:outline hover:outline-1 hover:outline-offset-1 hover:outline-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${COLORS.focusRing}`
        } ${categoryClasses} ${
          // Noticeably fainter than the solid fill, not equal weight - an alternative is a
          // suggestion about a suggestion, not a second plan.
          isAlternative && !isOutOfRange ? `border border-dashed ${COLORS.altBorder}/40` : ''
        } ${
          // A thin, mid-tone ring, not the old thick near-black/near-white box - that read
          // as a selection state rather than a "today" marker, clearly distinct from any
          // interactive/pressed state a cell can actually be in.
          isToday && !isOutOfRange ? 'ring-1 ring-inset ring-slate-400' : ''
        } ${
          // `outline`, not `ring` - a separate CSS property from the "today" ring above, so
          // a day that's both today AND part of the hovered break shows both at once
          // instead of one Tailwind ring utility silently overriding the other. A darker,
          // heavier neutral than the "today" ring (slate-700 vs slate-400) - distinguished
          // by weight, not a second hue; the accent is reserved for suggested PTO, the
          // primary action, and focus rings only.
          isHighlighted && !isOutOfRange ? 'outline outline-2 outline-slate-700 -outline-offset-1' : ''
        }`}
      >
        {!isOutOfRange && category === 'pinned' ? (
          <span className="flex items-center gap-0.5">
            {dayOfMonth}
            <PinIcon className="h-3 w-3" />
          </span>
        ) : (
          dayOfMonth
        )}
        {!isOutOfRange && category === 'public-holiday' && (
          <span aria-hidden className={`absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full ${HOLIDAY_DOT}`} />
        )}
        {!isOutOfRange && hasOverlap && (
          // A ring around the dot (not just a colour swap) so it stays visible whatever it
          // happens to sit on - a plain dark cell in dark mode, or the now-light pto/band
          // fills - rather than needing one colour choice that only works on some of them.
          <span
            aria-label="Overlaps someone else's time off"
            className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-slate-900 ring-1 ring-white"
          />
        )}
      </button>

      {tooltipOpen && tooltipText && (
        <div
          id={`tooltip-${date}`}
          role="tooltip"
          className="absolute left-1/2 top-full z-20 mt-1 w-max max-w-[14rem] -translate-x-1/2 rounded-md bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow-lg"
        >
          {tooltipText}
          {!hasHover && !isAlternative && marginalValue && (
            <button
              type="button"
              onClick={() => {
                onToggle(date);
                setTooltipOpen(false);
              }}
              className="mt-1.5 block w-full rounded bg-white/10 px-2 py-1 text-center font-medium hover:bg-white/20"
            >
              Toggle this day
            </button>
          )}
          {!hasHover && isAlternative && (
            <button
              type="button"
              onClick={() => {
                onSwapAlternative?.();
                setTooltipOpen(false);
              }}
              className="mt-1.5 block w-full rounded bg-white/10 px-2 py-1 text-center font-medium hover:bg-white/20"
            >
              Swap this in
            </button>
          )}
        </div>
      )}
    </div>
  );
}
