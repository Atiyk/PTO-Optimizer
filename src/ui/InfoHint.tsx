/**
 * UI density pass: a slider used to carry its secondary explanation as a permanent second
 * line of prose - two sliders, four lines of text, above the calendar. That reasoning is
 * still true and still worth having, just not worth the vertical space it was costing every
 * visitor on every load. Moved here, behind a small hover/focus target next to the label;
 * both texts this is used for already live in the FAQ too, so nothing is lost, only
 * de-prioritised. A native `title` is the lowest-risk way to do this with no new dependency
 * - it only shows on hover in most browsers, which is an accepted trade-off for a detail
 * that's secondary by design.
 */
export function InfoHint({ text }: { text: string }) {
  return (
    <span
      tabIndex={0}
      title={text}
      aria-label={text}
      className="inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full border border-slate-400 dark:border-slate-500 text-[10px] font-semibold leading-none text-slate-500 dark:text-slate-400"
    >
      i
    </span>
  );
}
