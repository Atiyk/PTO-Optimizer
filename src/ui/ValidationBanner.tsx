interface ValidationBannerProps {
  issues: string[];
}

/** Shown above the calendar whenever the current inputs are invalid - the calendar itself
 * keeps showing the last good plan underneath (useAppState.ts stops re-solving rather than
 * collapsing to an empty result), so this is purely additive, never a replacement. An ink
 * frame, a warning glyph and words carry the state; no alarm colour. */
export function ValidationBanner({ issues }: ValidationBannerProps) {
  if (issues.length === 0) return null;
  return (
    <div role="alert" className="flex gap-3 rounded-[4px] border-2 border-ink bg-surface p-4 text-sm text-ink">
      <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-0.5 h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10 2.5 18 17H2L10 2.5Z" strokeLinejoin="round" /><path d="M10 8v4" strokeLinecap="round" /><circle cx="10" cy="14.6" r="0.9" fill="currentColor" stroke="none" /></svg>
      <div className="min-w-0">
        <p className="font-semibold">Showing the last valid plan &mdash; fix the following to update it:</p>
        <ul className="mt-1 list-inside list-disc">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
