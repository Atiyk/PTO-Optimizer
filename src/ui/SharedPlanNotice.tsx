import { trackOnceInDocument } from './analytics';
import { Button } from './Button';
import { sharedPlanChangeText, type SharedPlanDifferences } from './shareSnapshot';

const PTO_FIELD_LABEL = 'PTO days available';

/** The planner's PTO field, found by its visible label so this notice needs nothing wired in.
 * Prefers a rendered label (the planner can lay its controls out twice across widths). */
function focusPtoField(): void {
  const labels = [...document.querySelectorAll<HTMLLabelElement>('label[for]')]
    .filter((label) => label.textContent?.trim() === PTO_FIELD_LABEL);
  const label = labels.find((candidate) => candidate.getClientRects().length > 0) ?? labels[0];
  const field = label ? document.getElementById(label.htmlFor) : null;
  if (!(field instanceof HTMLInputElement)) return;
  field.scrollIntoView?.({ block: 'center' });
  field.focus({ preventScroll: true });
  field.select();
}

/** Issue 9: what a recipient of a public plan link needs to know to trust the breaks, and the
 * one step that turns the sender's plan into theirs. Names no sender value: private
 * adjustments are described only in general terms. */
export function SharedPlanNotice({ differences, savedCalendarOff, onUseSavedCalendar }: {
  differences: SharedPlanDifferences;
  savedCalendarOff: boolean;
  onUseSavedCalendar: () => void;
}) {
  const change = sharedPlanChangeText(differences);
  return (
    <div role="status" data-testid="shared-plan-notice" className="space-y-2 rounded-[10px] bg-surface-alt p-4 text-sm leading-6 text-ink">
      <p className="text-base font-semibold">Someone shared a time-off plan with you.</p>
      {change && <p data-testid="shared-plan-recalculated" className="font-semibold">{change}</p>}
      <p>It&rsquo;s built from the PTO days, country, dates and holidays in the link. Anything the sender kept private, such as company holidays or time off they already booked, isn&rsquo;t included.</p>
      <p>To make it yours, put in your own PTO days; the plan updates as you type. Check the holidays your own employer gives you before requesting these dates.</p>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <Button variant="secondary" onClick={() => { trackOnceInDocument('shared_plan_made_own'); focusPtoField(); }}>Use my own PTO days</Button>
        <a href="#planning-assumptions" className="link-mark inline-flex min-h-11 items-center font-semibold">Check your company holidays</a>
      </div>
      {savedCalendarOff && (
        <p>
          Your saved company calendar isn&rsquo;t applied, so you see the plan as shared.{' '}
          <button type="button" className="link-mark min-h-11" onClick={onUseSavedCalendar}>Use my saved calendar</button>
        </p>
      )}
    </div>
  );
}
