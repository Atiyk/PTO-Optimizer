import { OfferCard } from '@/components/mobile/OfferCard';
import { Shell } from '@/components/mobile/Shell';
import { getOrg } from '@/domain/leave';
import { getDb } from '@/db/client';
import { call, requireActor } from '@/server/page';

const fmtDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });

/** Cover offers made to you: open ones first, with one-tap answers. */
export default async function StaffOffers() {
  const actor = await requireActor('/m/signin');
  const org = await getOrg(await getDb(), actor.orgId);
  const { myOffers } = await call('getCoverRequests', {}, actor);
  const isOpen = (o: (typeof myOffers)[number]) => o.requestStatus === 'open' && !o.response;
  const open = myOffers.filter(isOpen);
  const past = myOffers.filter((o) => !isOpen(o)).slice(0, 10);
  const outcome = (o: (typeof myOffers)[number]) =>
    o.takenByYou ? 'You took this.' : o.response === 'declined' ? 'You said you can’t.' : o.requestStatus === 'cancelled' ? 'No longer needed.' : 'Filled by someone else.';

  return (
    <Shell title="Cover offers" org={org.name} active="/m/offers" badge={open.length}>
      {open.length === 0 ? (
        <p className="rounded-lg border border-line bg-page p-4 text-sm text-muted">No open offers. When a shift needs cover and you can take it, it shows up here.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted">The first person who says yes gets it. We check you can still take it at that moment.</p>
          {open.map((o) => (
            <OfferCard key={o.offerId} offerId={o.offerId} title={o.roomName} when={`${fmtDay(o.date)}, ${o.start}–${o.end}`} open />
          ))}
        </div>
      )}
      {past.length > 0 && (
        <section aria-labelledby="earlier" className="space-y-2">
          <h2 id="earlier" className="text-base font-semibold text-ink">
            Earlier
          </h2>
          <ul className="space-y-2">
            {past.map((o) => (
              <li key={o.offerId} className="rounded-lg border border-line bg-page p-3 text-sm text-ink">
                {o.roomName}, {fmtDay(o.date)}, {o.start}–{o.end}
                <span className="block text-muted">{outcome(o)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Shell>
  );
}
