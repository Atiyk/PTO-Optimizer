import Link from 'next/link';
import { addDays } from '@daysoff/engine/solver/dateUtils';
import { ActionButton } from '@/components/ActionButton';
import { PunchFix } from '@/components/PunchFix';
import { Badge, btnPrimary, btnSecondary, Card, formatRange, input, Stat, StatusBanner } from '@/components/ui';
import { getOrg } from '@/domain/leave';
import { getDb } from '@/db/client';
import { call, requireActor } from '@/server/page';

const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isUuid = (s?: string) => !!s && /^[0-9a-f-]{36}$/i.test(s);
const dow = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short' });
const h = (n: number) => (n ? String(n) : '–');

/**
 * Timesheets: one workweek, everyone's clocked hours by day with overtime bands and issues
 * from the engine. Week and person live in the URL. Approve and correct here.
 */
export default async function TimesheetsPage({ searchParams }: { searchParams: Promise<{ week?: string; member?: string }> }) {
  const actor = await requireActor();
  const org = await getOrg(await getDb(), actor.orgId);
  const q = await searchParams;
  if (!org.timeClockEnabled) {
    return (
      <Card title="Timesheets">
        <p className="text-sm text-muted">
          The time clock is off. {actor.role === 'owner' || actor.role === 'admin' ? <Link className="text-accent underline" href="/app/admin/work-rules">Turn it on in Work rules</Link> : 'Ask an admin to turn it on.'}
        </p>
      </Card>
    );
  }
  const manager = actor.role !== 'employee';
  const member = isUuid(q.member) ? q.member : undefined;
  const ts = await call('getTimesheets', { ...(isDate(q.week) ? { week: q.week } : {}), ...(member ? { memberId: member } : {}) }, actor);
  const link = (o: { week?: string; member?: string | null }) => {
    const p = new URLSearchParams({ week: o.week ?? ts.weekStart });
    const m = o.member === undefined ? member : o.member;
    if (m) p.set('member', m);
    return `/app/time?${p.toString()}`;
  };
  const days = Array.from({ length: 7 }, (_, i) => addDays(ts.weekStart, i));
  const issues = ts.people.reduce((n, p) => n + p.issues.length, 0);
  const toApprove = ts.people.filter((p) => p.bands.total > 0 && !p.openNow && (!p.approval || p.approval.stale) && p.memberId !== actor.memberId);
  const one = member ? ts.people[0] : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{one ? `Timesheet: ${one.name?.untrusted_text}` : 'Timesheets'}</h1>
          <p className="text-sm text-muted">{formatRange(ts.weekStart, ts.weekEnd)} · hours from the time clock, split by your sites’ overtime rules</p>
        </div>
        <form className="flex flex-wrap items-end gap-2" action="/app/time">
          <Link className={btnSecondary} href={link({ week: addDays(ts.weekStart, -7) })}>← Previous</Link>
          <label className="text-sm text-ink">
            <span className="sr-only">Any date in the week</span>
            <input type="date" name="week" defaultValue={ts.weekStart} className={input} />
          </label>
          {member && <input type="hidden" name="member" value={member} />}
          <button className={btnSecondary}>Go</button>
          <Link className={btnSecondary} href={link({ week: addDays(ts.weekStart, 7) })}>Next →</Link>
        </form>
      </div>

      {issues > 0 ? (
        <StatusBanner tone="gap" title={`${issues} ${issues === 1 ? 'thing' : 'things'} to check this week`}>Missed clock-outs and break issues are listed under each person. Fix a punch from their timesheet.</StatusBanner>
      ) : (
        <StatusBanner tone="ok" title="No clock or break issues this week" />
      )}

      <div className="grid grid-cols-2 gap-4 rounded-lg border border-line bg-page p-4 sm:grid-cols-4">
        <Stat label="Hours" value={ts.totals.total} />
        <Stat label="Regular" value={ts.totals.regular} />
        <Stat label="Overtime" value={ts.totals.overtime} hint="1.5× band" />
        <Stat label="Double time" value={ts.totals.doubleTime} hint="2× band" />
      </div>

      {manager && !member && toApprove.length > 0 && (
        <Card title={`Ready to approve (${toApprove.length})`} actions={<ActionButton capability="manageTimesheets" input={{ op: 'approve', week: ts.weekStart, memberIds: toApprove.map((p) => p.memberId) }} className={btnPrimary} doneMessage="Approved.">Approve all {toApprove.length}</ActionButton>}>
          <p className="text-sm text-muted">Approving saves a snapshot of these totals. A later correction marks the approval out of date.</p>
        </Card>
      )}

      <div className="overflow-x-auto rounded-lg border border-line bg-page">
        <table className="w-full min-w-[760px] text-sm">
          <caption className="sr-only">Hours per person per day, week of {ts.weekStart}</caption>
          <thead className="bg-surface-alt text-left text-xs text-muted uppercase">
            <tr>
              <th scope="col" className="px-3 py-2">Person</th>
              {days.map((d) => (
                <th key={d} scope="col" className="px-2 py-2 text-right tabular-nums">{dow(d)} {d.slice(8)}</th>
              ))}
              <th scope="col" className="px-2 py-2 text-right">Total</th>
              <th scope="col" className="px-2 py-2 text-right">OT</th>
              <th scope="col" className="px-2 py-2 text-right">DT</th>
              <th scope="col" className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {ts.people.length === 0 && (
              <tr>
                <td colSpan={12} className="px-3 py-4 text-muted">Nobody has clocked hours this week.</td>
              </tr>
            )}
            {ts.people.map((p) => (
              <tr key={p.memberId} className="align-top">
                <th scope="row" className="px-3 py-2 text-left font-medium text-ink">
                  <Link prefetch={false} className="underline-offset-2 hover:underline" href={link({ member: p.memberId })}>{p.name?.untrusted_text}</Link>
                  {p.issues.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-xs font-normal text-ink">
                      {p.issues.map((i, n) => (
                        <li key={n}>
                          <span className="font-semibold">{dow(i.date)}:</span> {i.detail}
                          {i.rule ? <span className="text-muted"> ({i.rule})</span> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </th>
                {p.days.map((d) => (
                  <td key={d.date} className={`px-2 py-2 text-right tabular-nums ${d.overtime + d.doubleTime > 0 ? 'font-semibold text-ink underline decoration-dotted' : 'text-ink'}`} title={d.reasons.join('; ') || undefined}>
                    {h(d.hours)}
                  </td>
                ))}
                <td className="px-2 py-2 text-right font-semibold tabular-nums text-ink">{p.bands.total}</td>
                <td className="px-2 py-2 text-right tabular-nums text-ink">{h(p.bands.overtime)}</td>
                <td className="px-2 py-2 text-right tabular-nums text-ink">{h(p.bands.doubleTime)}</td>
                <td className="px-3 py-2">
                  {p.openNow ? <Badge tone="accent">On the clock</Badge> : p.approval && !p.approval.stale ? <Badge tone="ok">Approved</Badge> : p.approval?.stale ? <Badge tone="warn">Changed since approval</Badge> : p.bands.total ? <Badge>Not approved</Badge> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">Underlined days carry overtime (hover for why). Hours only: pay is calculated by your payroll provider. {ts.notice}</p>

      {one && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Shifts">
            {one.sessions.length === 0 ? (
              <p className="text-sm text-muted">No shifts this week.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {one.sessions.map((s, i) => (
                  <li key={i} className="py-2">
                    <span className="font-medium text-ink tabular-nums">{dow(s.date)} {s.date.slice(5)} · {s.start}–{s.end ?? 'now'} · {s.workedHours} h</span>
                    <span className="block text-muted">
                      {s.meals.length ? `Meal ${s.meals.map((m) => `${m.start}–${m.end ?? '…'}`).join(', ')}` : 'No meal break'}
                      {s.restBreaksOwed ? ` · ${s.restBreaksOwed} rest break${s.restBreaksOwed > 1 ? 's' : ''} owed${s.restBreaksTaken === false ? ', said not taken' : s.restBreaksTaken ? ', said taken' : ''}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-muted">Rules: {one.rules}</p>
          </Card>
          {manager && one.memberId !== actor.memberId && (
            <Card title="Fix a punch">
              <PunchFix memberId={one.memberId} punches={one.punches ?? []} defaultDate={ts.weekStart} />
            </Card>
          )}
        </div>
      )}
      {member && (
        <p className="text-sm">
          <Link className="text-accent underline" href={link({ member: null })}>← Everyone</Link>
          {' · '}
          <a className="text-accent underline" href={`/api/timesheets/export?week=${ts.weekStart}`}>Download CSV for payroll</a>
        </p>
      )}
      {!member && manager && (
        <p className="text-sm">
          <a className="text-accent underline" href={`/api/timesheets/export?week=${ts.weekStart}`}>Download CSV for payroll</a> <span className="text-muted">(hours by band per person, no pay rates)</span>
        </p>
      )}
    </div>
  );
}
