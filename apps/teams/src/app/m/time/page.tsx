import Link from 'next/link';
import { addDays } from '@daysoff/engine/solver/dateUtils';
import { Shell } from '@/components/mobile/Shell';
import { getOrg } from '@/domain/leave';
import { getDb } from '@/db/client';
import { call, requireActor } from '@/server/page';

const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const dayName = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });

/** My hours this week: per day, overtime bands from the site's rules, and anything to check. */
export default async function StaffHours({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const actor = await requireActor('/m/signin');
  const org = await getOrg(await getDb(), actor.orgId);
  const q = await searchParams;
  if (!org.timeClockEnabled) {
    return (
      <Shell title="Hours" org={org.name} active="/m/time">
        <p className="rounded-xl border border-line bg-page p-4 text-base text-muted">Your workplace doesn’t use the time clock yet.</p>
      </Shell>
    );
  }
  const c = await call('getMyTimeClock', isDate(q.week) ? { week: q.week } : {}, actor);
  const w = c.week;
  const worked = w.days.filter((d) => d.hours > 0);
  return (
    <Shell title="Hours" org={org.name} active="/m/time">
      <nav aria-label="Week" className="flex items-center justify-between text-sm">
        <Link className="min-h-12 inline-flex items-center px-2 text-accent underline" href={`/m/time?week=${addDays(w.weekStart, -7)}`}>← Previous week</Link>
        {w.weekStart < c.today && addDays(w.weekStart, 6) >= c.today ? null : <Link className="min-h-12 inline-flex items-center px-2 text-accent underline" href="/m/time">This week</Link>}
      </nav>
      <section aria-labelledby="wk" className="rounded-xl border border-line bg-page p-4 shadow-sm">
        <h2 id="wk" className="text-xs font-semibold tracking-wide text-muted uppercase">Week of {dayName(w.weekStart)}</h2>
        <p className="mt-1 text-3xl font-semibold text-ink tabular-nums">{w.bands.total} h</p>
        <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
          <div><dt className="text-muted">Regular</dt><dd className="font-semibold text-ink tabular-nums">{w.bands.regular} h</dd></div>
          <div><dt className="text-muted">Overtime {w.bands.multiplier}×</dt><dd className="font-semibold text-ink tabular-nums">{w.bands.overtime} h</dd></div>
          <div><dt className="text-muted">Double {w.bands.doubleTimeMultiplier}×</dt><dd className="font-semibold text-ink tabular-nums">{w.bands.doubleTime} h</dd></div>
        </dl>
      </section>
      {w.issues.length > 0 && (
        <section aria-labelledby="chk" className="rounded-xl border-l-4 border-ink bg-band p-4">
          <h2 id="chk" className="text-base font-semibold text-ink">Worth a look</h2>
          <ul className="mt-1 space-y-1 text-sm text-ink">
            {w.issues.map((i, n) => <li key={n}>{dayName(i.date)}: {i.detail}</li>)}
          </ul>
          <p className="mt-2 text-sm text-muted">Your manager can fix a wrong punch.</p>
        </section>
      )}
      <section aria-labelledby="days" className="space-y-2">
        <h2 id="days" className="text-base font-semibold text-ink">Shifts</h2>
        {worked.length === 0 ? (
          <p className="text-base text-muted">No hours this week yet.</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-page">
            {w.sessions.map((s, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 px-4 py-3">
                <span className="text-sm font-semibold text-ink">{dayName(s.date)}</span>
                <span className="text-right text-base text-ink tabular-nums">
                  {s.start}–{s.end ?? 'now'} · {s.workedHours} h
                  <span className="block text-sm text-muted">
                    {s.meals.length ? `Meal ${s.meals.map((m) => `${m.start}–${m.end ?? '…'}`).join(', ')}` : 'No meal break'}
                    {s.restBreaksTaken === false ? ' · rest breaks missed' : ''}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-xs text-muted">Rules: {c.rules.label}. {c.notice}</p>
    </Shell>
  );
}
