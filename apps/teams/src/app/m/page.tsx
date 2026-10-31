import Link from 'next/link';
import { addDays } from '@daysoff/engine/solver/dateUtils';
import { CallOff } from '@/components/mobile/CallOff';
import { ClockCard } from '@/components/mobile/ClockCard';
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
  const clock = org.timeClockEnabled ? await call('getMyTimeClock', {}, actor) : null;
  const open = myOffers.filter((o) => o.requestStatus === 'open' && !o.response).length;
  const toApprove = actor.role !== 'employee' ? (await call('listPendingApprovals', {}, actor)).requests.length + (await call('getProfileChanges', {}, actor)).toDecide.length : 0;
  const working = shifts.filter((s) => !s.onLeave);
  const next = working[0] ?? null;
  const later = shifts.filter((s) => s !== next);

  return (
    <Shell title="Today" org={org.name} active="/m" badge={open}>
      {toApprove > 0 && (
        <Link href="/m/approvals" className="block rounded-xl border-2 border-accent bg-page p-4 text-base font-semibold text-accent">
          {toApprove === 1 ? 'One request is waiting for your approval' : `${toApprove} requests are waiting for your approval`} →
        </Link>
      )}
      {open > 0 && (
        <Link href="/m/offers" className="block rounded-xl border-2 border-accent bg-accent p-4 text-base font-semibold text-white">
          {open === 1 ? 'One cover offer is waiting for you' : `${open} cover offers are waiting for you`} →
        </Link>
      )}
      {clock && <ClockCard initial={clock} />}
      <section aria-labelledby="next-shift" className="rounded-xl border border-line bg-page p-4 shadow-sm">
        <h2 id="next-shift" className="text-xs font-semibold tracking-wide text-muted uppercase">
          {next ? (next.date === today ? 'Your shift today' : `Your next shift · ${dayLabel(next.date, today)}`) : 'Your next shift'}
        </h2>
        {next ? (
          <>
            <p className="mt-1 text-3xl font-semibold text-ink tabular-nums">
              {next.start}–{next.end}
            </p>
            <p className="text-base text-ink">
              {next.roomName} · <span className="text-muted">{next.siteName}</span>
            </p>
            {next.cover && <p className="mt-1 text-sm text-muted">Cover you took. Thank you.</p>}
          </>
        ) : (
          <p className="mt-1 text-base text-muted">No shifts on your schedule this week.</p>
        )}
        <div className="mt-4">
          <CallOff today={today} tomorrow={addDays(today, 1)} />
        </div>
      </section>
      {later.length > 0 && (
        <section aria-labelledby="next-shifts" className="space-y-2">
          <h2 id="next-shifts" className="text-base font-semibold text-ink">
            Later this week
          </h2>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-page">
            {later.map((s, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 px-4 py-3">
                <span className="text-sm font-semibold text-ink">{dayLabel(s.date, today)}</span>
                <span className="text-right text-base text-ink tabular-nums">
                  {s.start}–{s.end}
                  <span className="block text-sm text-muted">
                    {s.roomName}
                    {s.cover && ' · cover you took'}
                    {s.onLeave && ' · you’re off'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Shell>
  );
}
