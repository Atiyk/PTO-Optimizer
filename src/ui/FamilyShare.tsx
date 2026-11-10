import { useId, useState } from 'react';
import type { PartnerAvailability } from '../planning/partner';
import { Button } from './Button';
import { PlusMinus } from './Chevron';
import { copyText } from './requestText';
import { ShareDatePreview } from './ShareDatePreview';
import { track } from './analytics';

/**
 * "Share with family", modelled on PartnerPlanner's consent panel: the sender chooses what
 * goes in the link, is told exactly what that is (dates only), and copies it. Nothing is
 * sent anywhere by this site; the link is the whole transfer.
 */
export function FamilyShare({
  schoolDates, availableDays, freeDays, buildLink,
}: {
  /** School closure dates the link would carry (preset + added). */
  schoolDates: readonly string[];
  /** Days this parent is with the kids during school closures (already off or PTO). */
  availableDays: readonly string[];
  /** The subset of availableDays that are already free without PTO. */
  freeDays: readonly string[];
  buildLink: (opts: { includeSchool: boolean; availability?: PartnerAvailability }) => string;
}) {
  const [open, setOpen] = useState(false);
  const [includeSchool, setIncludeSchool] = useState(false);
  const [includeAvailability, setIncludeAvailability] = useState(false);
  const [discloseFree, setDiscloseFree] = useState(false);
  const [confirmedSelection, setConfirmedSelection] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const id = useId();
  const schoolDayCount = schoolDates.length;
  const canShareAvailability = availableDays.length > 0;
  const selectionKey = includeAvailability && canShareAvailability ? `${availableDays.join(',')}|${freeDays.join(',')}` : null;
  if (confirmedSelection !== null && confirmedSelection !== selectionKey) setConfirmedSelection(null);
  const availability: PartnerAvailability | undefined = selectionKey ? {
    days: [...availableDays], freeDays: discloseFree ? [...freeDays] : null,
    status: confirmedSelection === selectionKey ? 'confirmed' : 'proposed',
  } : undefined;
  const shareSchool = includeSchool && schoolDayCount > 0;
  const nothing = !shareSchool && !availability;

  return (
    <section className="rounded-[10px] border border-line bg-surface px-4 py-2 sm:px-5" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>
        <button type="button" className="flex min-h-12 w-full items-center justify-between gap-3 text-left text-xl font-bold text-ink type-condensed" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
          <span>Share with family</span><PlusMinus open={open} className="h-4 w-4" />
        </button>
      </h2>
      {!open && <p className="pb-2 text-sm text-muted">Send a co-parent or grandparent the school dates, and the days you can cover, as a link.</p>}
      {open && (
        <div id={id} className="mt-1 space-y-3 pb-3">
          <fieldset className="min-w-0">
            <legend className="text-sm font-semibold text-ink">What to include</legend>
            <label className="mt-1 flex min-h-11 items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={includeSchool} disabled={schoolDayCount === 0} onChange={(e) => setIncludeSchool(e.target.checked)} />
              School closure dates ({schoolDayCount} {schoolDayCount === 1 ? 'day' : 'days'})
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={includeAvailability} disabled={!canShareAvailability} onChange={(e) => setIncludeAvailability(e.target.checked)} />
              Days I&apos;m with the kids ({availableDays.length} school {availableDays.length === 1 ? 'day' : 'days'} off)
            </label>
            {includeAvailability && canShareAvailability && (
              <>
                <label className="flex min-h-11 items-center gap-2 pl-6 text-sm text-ink">
                  <input type="checkbox" checked={confirmedSelection === selectionKey} onChange={(e) => setConfirmedSelection(e.target.checked ? selectionKey : null)} />
                  I&apos;ve confirmed I can cover these days.
                </label>
                <label className="flex min-h-11 items-center gap-2 pl-6 text-sm text-ink">
                  <input type="checkbox" checked={discloseFree} onChange={e => setDiscloseFree(e.target.checked)} />
                  Show which of these dates I already have off.
                </label>
              </>
            )}
          </fieldset>
          <p className="max-w-2xl text-sm text-muted">
            Anyone with the link can see the dates you select and whether your availability is proposed or confirmed. Your balance, employer, names, notes and original imports stay in your plan.
          </p>
          {!nothing && <ShareDatePreview
            expanded
            schoolDates={shareSchool ? schoolDates : undefined}
            dates={availability?.days}
            status={availability?.status}
            freeDays={availability?.freeDays}
          />}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" disabled={nothing} onClick={async () => {
              try {
                const ok = await copyText(buildLink({ includeSchool: shareSchool, availability }));
                if (ok) track('family_share_generated');
                setMessage(ok ? 'Family link copied.' : 'Could not copy the link. Please try again.');
              } catch (err) {
                setMessage(err instanceof Error ? err.message : 'Could not create the link.');
              }
            }}>Copy family link</Button>
            <span role="status" className="text-sm text-muted">{message}</span>
          </div>
        </div>
      )}
    </section>
  );
}
