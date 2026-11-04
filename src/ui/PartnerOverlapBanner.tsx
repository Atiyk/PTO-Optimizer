
interface PartnerOverlapBannerProps {
  overlapDayCount: number;
  onDismiss: () => void;
}

/** Shown once to a visitor who just arrived via a "share my days" partner-overlap link -
 * the only built-in two-person loop in the product, so their first few seconds matter.
 * Explains what they received; their partner's days are already marked on the calendar and
 * a plan is already solved beneath this banner (the app always auto-solves with defaults).
 * Neutral, not a new colour - this is information, not a warning or an error, the only two
 * states the design system reserves a semantic colour for. */
export function PartnerOverlapBanner({ overlapDayCount, onDismiss }: PartnerOverlapBannerProps) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-[4px] bg-accent-soft py-2 pl-4 pr-1 text-sm text-ink">
        <p className="py-2">
          <span className="font-semibold">Someone shared their days off with you.</span> Their{' '}
          {overlapDayCount} day
          {overlapDayCount === 1 ? '' : 's'} off {overlapDayCount === 1 ? 'is' : 'are'} already marked on the
          calendar (look for the overlap dot) - set your own country and PTO days in the settings to see where your
          time off could line up with theirs.
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[3px] text-lg text-ink hover:bg-mark"
          aria-label="Dismiss"
        >
          &times;
        </button>
    </div>
  );
}
