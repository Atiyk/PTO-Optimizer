interface ValidationBannerProps {
  issues: string[];
}

/** Shown above the calendar whenever the current inputs are invalid - the calendar itself
 * keeps showing the last good plan underneath (useAppState.ts stops re-solving rather than
 * collapsing to an empty result), so this is purely additive, never a replacement. */
export function ValidationBanner({ issues }: ValidationBannerProps) {
  if (issues.length === 0) return null;
  return (
    <div
      role="alert"
      className="border-b border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 px-4 py-3 text-sm text-amber-900 dark:text-amber-100"
    >
      <p className="font-semibold">Showing the last valid plan &mdash; fix the following to update it:</p>
      <ul className="mt-1 list-inside list-disc">
        {issues.map((issue) => (
          <li key={issue}>{issue}</li>
        ))}
      </ul>
    </div>
  );
}
