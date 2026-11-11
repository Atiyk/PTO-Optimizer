import { sharedPlanChangeText, type SharedPlanDifferences } from './shareSnapshot';

/** Issue 9: what a recipient of a public plan link needs to know to trust the breaks.
 * Names no sender value: private adjustments are described only in general terms. */
export function SharedPlanNotice({ differences, savedCalendarOff, onUseSavedCalendar }: {
  differences: SharedPlanDifferences;
  savedCalendarOff: boolean;
  onUseSavedCalendar: () => void;
}) {
  const change = sharedPlanChangeText(differences);
  return (
    <div role="status" data-testid="shared-plan-notice" className="space-y-1 rounded-[10px] bg-surface-alt p-4 text-sm text-ink">
      {change && <p data-testid="shared-plan-recalculated" className="font-semibold">{change}</p>}
      <p>This is a shared plan, built from the settings in the link. Anything the sender kept private, such as company holidays or time off they already booked, isn&rsquo;t included.</p>
      {savedCalendarOff && (
        <p>
          Your saved company calendar isn&rsquo;t applied, so you see the plan as shared.{' '}
          <button type="button" className="link-mark min-h-11" onClick={onUseSavedCalendar}>Use my saved calendar</button>
        </p>
      )}
    </div>
  );
}
