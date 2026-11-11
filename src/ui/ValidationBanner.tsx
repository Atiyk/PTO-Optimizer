interface ValidationBannerProps {
  issues: string[];
}

export function ValidationBanner({ issues }: ValidationBannerProps) {
  if (issues.length === 0) return null;
  return (
    <div role="alert" className="flex gap-3 rounded-[10px] border border-error bg-error-soft p-4 text-sm text-ink">
      <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-0.5 h-5 w-5 shrink-0 text-error" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10 2.5 18 17H2L10 2.5Z" strokeLinejoin="round" /><path d="M10 8v4" strokeLinecap="round" /><circle cx="10" cy="14.6" r="0.9" fill="currentColor" stroke="none" /></svg>
      <div className="min-w-0">
        <p className="font-semibold">Check your planning settings</p>
        {issues.length === 1 ? <p className="mt-1">{issues[0]}</p> : (
          <ul className="mt-1 list-inside list-disc">
            {issues.map(issue => <li key={issue}>{issue}</li>)}
          </ul>
        )}
      </div>
    </div>
  );
}
