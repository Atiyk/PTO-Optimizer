import Link from 'next/link';
import { addDays } from '@daysoff/engine/solver/dateUtils';
import { CallOff } from '@/components/mobile/CallOff';
import { Shell } from '@/components/mobile/Shell';
import { getOrg } from '@/domain/leave';
import { getDb } from '@/db/client';
import { call, requireActor } from '@/server/page';

const dayLabel = (iso: string, today: string) =>
  iso === today
    ? 'Today'
    : iso === addDays(today, 1)
      ? 'Tomorrow'
      : new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'short', day: 'numeric' });

/** Today: the next shifts, open cover offers, and the two-tap call-off. */
export default async function StaffToday() {
  const actor = await requireActor('/m/signin');
  const org = await getOrg(await getDb(), actor.orgId);
  const { today, shifts } = await call('getMySchedule', { days: 7 }, actor);
  const { myOffers } = await call('getCoverRequests', {}, actor);
  const open = myOffers.filter((o) => o.requestStatus === 'open' && !o.response).length;
  const byDay = new Map<string, typeof shifts>();
  for (const s of shifts) byDay.set(s.date, [...(byDay.get(s.date) ?? []), s]);

  return (
    <Shell title="Today" org={org.name} active="/m" badge={open}>
      {open > 0 && (
        <Link href="/m/offers" className="block rounded-lg border-2 border-accent bg-page p-4 text-base font-semibold text-ink">
          {open === 1 ? 'One cover offer is waiting for you' : `${open} cover offers are waiting for you`} →
        </Link>
      )}
      <CallOff today={today} tomorrow={addDays(today, 1)} />
      <section aria-labelledby="next-shifts" className="space-y-2">
        <h2 id="next-shifts" className="text-base font-semibold text-ink">
          Your next 7 days
        </h2>
        {byDay.size === 0 ? (
          <p className="rounded-lg border border-line bg-page p-4 text-sm text-muted">No shifts on your schedule this week.</p>
        ) : (
          <ul className="space-y-2">
            {[...byDay].map(([date, list]) => (
              <li key={date} className="rounded-lg border border-line bg-page p-4">
                <div className="text-sm font-semibold text-ink">{dayLabel(date, today)}</div>
                {list.map((s, i) => (
                  <div key={i} className="mt-1 text-base text-ink">
                    {s.start}–{s.end} · {s.roomName}
                    <span className="block text-sm text-muted">
                      {s.siteName}
                      {s.cover && ' · cover you took'}
                      {s.onLeave && ' · you’re off (leave booked)'}
                    </span>
                  </div>
                ))}
              </li>
            ))}
          </ul>
        )}
      </section>
    </Shell>
  );
}
