import { Container } from './Container';

interface PartnerOverlapBannerProps {
  overlapDayCount: number;
  onDismiss: () => void;
}

/** Shown once to a visitor who just arrived via a "share my days" partner-overlap link -
 * the only built-in two-person loop in the product, so their first few seconds matter.
 * Explains what they received; their partner's days are already marked on the calendar and
 * a plan is already solved beneath this banner (the app always auto-solves with defaults). */
export function PartnerOverlapBanner({ overlapDayCount, onDismiss }: PartnerOverlapBannerProps) {
  return (
    <div className="border-b border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950">
      <Container className="flex items-center justify-between gap-4 px-4 py-3 text-sm text-sky-900 dark:text-sky-100">
        <p>
          <span className="font-semibold">Someone shared their days off with you.</span> Their {overlapDayCount} day
          {overlapDayCount === 1 ? '' : 's'} off {overlapDayCount === 1 ? 'is' : 'are'} already marked on the
          calendar below (look for the overlap dot) - set your own country and PTO days above to see where your
          time off could line up with theirs.
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-md px-2 py-1 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900"
          aria-label="Dismiss"
        >
          &times;
        </button>
      </Container>
    </div>
  );
}
