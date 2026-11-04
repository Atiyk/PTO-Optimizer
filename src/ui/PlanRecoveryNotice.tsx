import { buttonClasses } from './Button';

interface PlanRecoveryNoticeProps {
  issue: string;
  hasForcedDays: boolean;
  onClearForcedDays: () => void;
  onReviewSettings: () => void;
}

/**
 * A solver constraint error is not an invalid date range. Keep the calendar
 * mounted so a person can unpin a day; explain why there is no exportable plan
 * and offer a single explicit way to reset only their manual date overrides.
 */
export function PlanRecoveryNotice({
  issue,
  hasForcedDays,
  onClearForcedDays,
  onReviewSettings,
}: PlanRecoveryNoticeProps) {
  return (
    <section role="alert" aria-label="Planning needs attention" className="flex gap-3 rounded-[4px] border-2 border-ink bg-surface p-4 text-ink">
      <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-0.5 h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10 2.5 18 17H2L10 2.5Z" strokeLinejoin="round" /><path d="M10 8v4" strokeLinecap="round" /><circle cx="10" cy="14.6" r="0.9" fill="currentColor" stroke="none" /></svg>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold">These settings don&apos;t produce a valid plan yet.</h2>
        <p className="mt-1 max-w-prose text-sm">{issue}</p>
        <p className="mt-1 max-w-prose text-sm text-muted">
          Your calendar is still available. Adjust a pinned or excluded date, or review your planning settings.
          There is no plan ready to export until the constraint is resolved.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {hasForcedDays && (
            <button type="button" onClick={onClearForcedDays} className={buttonClasses('secondary', 'md', 'min-h-11')}>
              Clear pinned and excluded dates
            </button>
          )}
          <button type="button" onClick={onReviewSettings} className={buttonClasses('quiet', 'md', 'min-h-11')}>
            Review advanced settings
          </button>
        </div>
      </div>
    </section>
  );
}
