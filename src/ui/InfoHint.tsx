import { useState } from 'react';

/**
 * UI density pass: a slider used to carry its secondary explanation as a permanent second
 * line of prose - two sliders, four lines of text, above the calendar. That reasoning is
 * still true and still worth having, just not worth the vertical space it was costing every
 * visitor on every load. Moved here, behind a small hover/focus target next to the label;
 * both texts this is used for already live in the FAQ too, so nothing is lost, only
 * de-prioritised.
 *
 * Interaction-detail pass: originally just a native `title` attribute - the lowest-risk
 * implementation, but title tooltips are notoriously inconsistent on keyboard focus across
 * browsers, and "tooltips on keyboard focus as well as hover" is a real requirement, not a
 * nice-to-have (a keyboard user tabbing through the controls deserves the same explanation a
 * mouse user gets by hovering). Replaced with a small self-contained tooltip using the same
 * visual pattern DayCell's own tooltip already established (dark pill, shadow, role="tooltip"),
 * opened by both hover and focus and closed by both their opposites.
 */
export function InfoHint({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <span
        tabIndex={0}
        aria-label={text}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="relative inline-flex h-[18px] w-[18px] shrink-0 cursor-help items-center justify-center rounded-full border border-line-strong text-xs font-bold leading-none text-muted before:absolute before:-inset-3 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[var(--focus-ring)]"
      >
        i
      </span>
      {open && (
        <span
          role="tooltip"
          className="absolute left-1/2 top-full z-20 mt-2 w-max max-w-[min(16rem,calc(100vw-2rem))] -translate-x-1/2 rounded-[3px] bg-ink px-2.5 py-1.5 text-sm font-normal text-white shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  );
}
