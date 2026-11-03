import { Container } from './Container';

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
    <section role="alert" aria-label="Planning needs attention" className="border-b border-amber-300 bg-amber-50">
      <Container className="px-4 py-4">
        <h2 className="text-sm font-semibold text-amber-950">These settings don&apos;t produce a valid plan yet.</h2>
        <p className="mt-1 max-w-prose text-sm text-amber-950">{issue}</p>
        <p className="mt-1 max-w-prose text-sm text-amber-900">
          Your calendar is still available. Adjust a pinned or excluded date, or review your planning settings.
          There is no plan ready to export until the constraint is resolved.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {hasForcedDays && (
            <button
              type="button"
              onClick={onClearForcedDays}
              className="min-h-11 rounded-lg border border-amber-700 bg-white px-4 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Clear pinned and excluded dates
            </button>
          )}
          <button
            type="button"
            onClick={onReviewSettings}
            className="min-h-11 rounded-lg border border-amber-500 px-4 py-2 text-sm font-medium text-amber-950 hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Review advanced settings
          </button>
        </div>
      </Container>
    </section>
  );
}
