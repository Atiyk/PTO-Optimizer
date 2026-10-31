import { ReportSummary } from '@/components/ReportSummary';
import { btnPrimary, btnSecondary, Card, input, label, Stat } from '@/components/ui';
import { call, requireActor } from '@/server/page';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;
const max = (rows: { days: number }[]) => Math.max(1, ...rows.map((x) => x.days));
function Bars({ title, rows }: { title: string; rows: { key: string; label: string; days: number; requests: number }[] }) {
  return (
  <Card title={title}>
    {rows.length === 0 ? (
      <p className="text-sm text-muted">No approved leave.</p>
    ) : (
      <table className="w-full text-sm">
        <thead className="sr-only">
          <tr><th>Name</th><th>Days</th><th>Requests</th></tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.key} className="border-t border-line first:border-0">
              <td className="py-1.5 pr-2 text-ink">{b.label}</td>
              <td className="w-1/2 py-1.5">
                <div className="flex items-center gap-2">
                  <span aria-hidden className="block h-2 rounded bg-accent" style={{ width: `${Math.max(4, (b.days / max(rows)) * 100)}%` }} />
                  <span className="whitespace-nowrap tabular-nums text-ink">{days(b.days)}</span>
                </div>
              </td>
              <td className="whitespace-nowrap py-1.5 text-right tabular-nums text-muted">{b.requests} {b.requests === 1 ? 'request' : 'requests'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </Card>
  );
}

/** Absence report: engine numbers by leave type, team, group and month, with a written summary and CSV. */
export default async function Reports({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; team?: string; group?: string }> }) {
  const actor = await requireActor();
  if (actor.role === 'employee') return <p className="text-sm text-muted">Reports are for managers and admins.</p>;
  const sp = await searchParams;
  const year = new Date().getUTCFullYear();
  const from = sp.from && ISO.test(sp.from) ? sp.from : `${year}-01-01`;
  const to = sp.to && ISO.test(sp.to) ? sp.to : `${year}-12-31`;
  const setup = await call('getOrgSetup', {}, actor);
  const teamId = setup.teams.some((t) => t.id === sp.team) ? sp.team : undefined;
  const groupId = setup.groups.some((g) => g.id === sp.group) ? sp.group : undefined;
  const input_ = { from, to, teamId, groupId };
  let r: Awaited<ReturnType<typeof call<'getAbsenceReport'>>> | null = null;
  let error: string | null = null;
  try {
    r = await call('getAbsenceReport', input_, actor);
  } catch (e) {
    error = e instanceof Error ? e.message : 'Could not build the report.';
  }
  const qs = new URLSearchParams({ from, to, ...(teamId ? { team: teamId } : {}), ...(groupId ? { group: groupId } : {}) }).toString();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-ink">Absence report</h1>
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-page p-4">
        <div>
          <label className={label} htmlFor="r-from">From</label>
          <input id="r-from" name="from" type="date" defaultValue={from} className={`${input} mt-1`} />
        </div>
        <div>
          <label className={label} htmlFor="r-to">To</label>
          <input id="r-to" name="to" type="date" defaultValue={to} className={`${input} mt-1`} />
        </div>
        <div>
          <label className={label} htmlFor="r-team">Team</label>
          <select id="r-team" name="team" defaultValue={teamId ?? ''} className={`${input} mt-1`}>
            <option value="">All teams</option>
            {setup.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="r-group">Group</label>
          <select id="r-group" name="group" defaultValue={groupId ?? ''} className={`${input} mt-1`}>
            <option value="">All groups</option>
            {setup.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <button className={btnPrimary}>Show</button>
        <a className={btnSecondary} href={`/api/reports/export?${qs}`}>Download CSV</a>
      </form>
      {error && <p role="alert" className="text-sm text-ink">{error}</p>}
      {r && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-line bg-page p-4"><Stat label="Approved leave" value={days(r.totals.approvedDays)} hint={`${r.totals.peopleWithLeave} of ${r.headcount} people`} /></div>
            <div className="rounded-lg border border-line bg-page p-4"><Stat label="Per person" value={days(r.totals.daysPerPerson)} /></div>
            <div className="rounded-lg border border-line bg-page p-4"><Stat label="Waiting for a decision" value={days(r.totals.pendingDays)} /></div>
            <div className="rounded-lg border border-line bg-page p-4">
              <Stat label="Approved" value={r.approval.approvalRatePct == null ? 'No decisions' : `${r.approval.approvalRatePct}%`} hint={r.approval.medianDaysToDecide == null ? undefined : `Median ${days(r.approval.medianDaysToDecide)} to decide`} />
            </div>
          </div>
          <Card title="Summary">
            <ReportSummary input={input_} />
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Bars title="By leave type" rows={r.byType} />
            <Bars title="By month" rows={r.byMonth} />
            <Bars title="By team" rows={r.byTeam} />
            <Bars title="By group" rows={r.byGroup} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Busiest days">
              {r.peakDays.length === 0 ? <p className="text-sm text-muted">Nobody was away.</p> : (
                <ul className="space-y-1 text-sm text-ink">
                  {r.peakDays.map((d) => <li key={d.date}><span className="tabular-nums">{d.date}</span>: {d.away} {d.away === 1 ? 'person' : 'people'} away</li>)}
                </ul>
              )}
              <p className="mt-2 text-sm text-muted">{r.medianLeadDays == null ? '' : `People ask a median of ${days(r.medianLeadDays)} ahead.`}{r.hoursWorked ? ` ${r.hoursWorked.total} hours worked on record for ${r.hoursWorked.people} people.` : ''}</p>
            </Card>
            <Card title="On track to lose leave at year end">
              {r.forfeitRisk.length === 0 ? <p className="text-sm text-muted">Nobody.</p> : (
                <ul className="space-y-1 text-sm text-ink">
                  {r.forfeitRisk.map((f) => <li key={f.memberId}>{f.name.untrusted_text}: {f.amount} {f.unit}</li>)}
                </ul>
              )}
            </Card>
          </div>
          <p className="text-xs text-muted">Sick and other health-related leave is shown as one bucket and never per person.</p>
        </>
      )}
    </div>
  );
}
