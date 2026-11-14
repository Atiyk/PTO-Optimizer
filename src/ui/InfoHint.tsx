import { useEffect, useId, useRef, useState } from 'react';

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
/**
 * N5: a real <button> with a short accessible name ("About how many breaks") and the full
 * text as its description, instead of an 18px span[tabindex=0] named by the whole paragraph.
 * The drawn "i" stays 18px so the label row keeps its rhythm, but the button is 24x24 (pulled
 * back with a negative margin, so layout does not move) and a transparent ::before extends
 * the touch target to 44x44. Tap, click, hover and focus open it (touch has no hover);
 * Escape, blur or a tap elsewhere close it.
 */
export function InfoHint({ text, label = 'More information' }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const tipId = useId();
  // Browsers send a compatibility mouseout right after a tap; only a real mouse may close
  // the hint by leaving it, or a tap would open and immediately close it.
  const lastPointer = useRef<string>('mouse');
  useEffect(() => {
    if (!open) return;
    const onEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [open]);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-describedby={tipId}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onPointerDown={(event) => { lastPointer.current = event.pointerType; }}
        onMouseLeave={() => { if (lastPointer.current === 'mouse') setOpen(false); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
        className="group relative -m-[3px] inline-flex h-6 w-6 shrink-0 cursor-help items-center justify-center rounded-full before:absolute before:-inset-2.5 before:content-[''] focus-visible:outline-none"
      >
        <span
          aria-hidden="true"
          className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border border-line-strong text-xs font-bold leading-none text-muted transition-colors duration-150 group-hover:border-ink group-hover:text-ink group-focus-visible:ring-2 group-focus-visible:ring-offset-1 group-focus-visible:ring-[var(--focus-ring)]"
        >
          i
        </span>
      </button>
      {/* Always in the DOM so the button's description is there before it opens; shown only
          while open. */}
      <span
        id={tipId}
        role="tooltip"
        hidden={!open}
        className="absolute left-1/2 top-full z-20 mt-2 w-max max-w-[min(16rem,calc(100vw-2rem))] -translate-x-1/2 rounded-[6px] bg-ink px-2.5 py-1.5 text-sm font-normal text-white shadow-lg"
      >
        {text}
      </span>
    </span>
  );
}
