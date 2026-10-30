import { RequestForm } from '@/components/RequestForm';
import { Shell } from '@/components/mobile/Shell';
import { Badge, fmt, formatRange } from '@/components/ui';
import { getOrg } from '@/domain/leave';
import { getDb } from '@/db/client';
import { call, requireActor } from '@/server/page';

/** Balances, sick hours, a leave request (warned, not blocked, when it opens a staffing gap) and recent requests. */
export default async function StaffLeave() {
  const actor = await requireActor('/m/signin');
  const org = await getOrg(await getDb(), actor.orgId);
  const { today } = await call('getMySchedule', { days: 1 }, actor);
  const setup = await call('getOrgSetup', {}, actor);
  const types = setup.leaveTypes.filter((t) => !t.key.startsWith('archived'));
  const balances = await Promise.all(types.filter((t) => t.countsAgainstBalance).map(async (t) => ({ type: t, b: await call('getMyBalance', { leaveType: t.key }, actor) })));
  const sick = await call('getSickLeave', {}, actor).catch(() => null);
  const { requests } = await call('listMyRequests', { limit: 5 }, actor);
  const typeName = new Map(types.map((t) => [t.key, t.name]));

  return (
    <Shell title="Leave" org={org.name} active="/m/leave">
      <ul className="grid grid-cols-2 gap-2">
        {balances.map(({ type, b }) => (
          <li key={type.key} className="rounded-lg border border-line bg-page p-3">
            <div className="text-sm text-muted">{type.name}</div>
            <div className="text-xl font-semibold text-ink tabular-nums">{b.unlimited ? 'Unlimited' : fmt(b.usable ?? b.balance, b.unit)}</div>
          </li>
        ))}
        {sick?.hasPolicy && (
          <li className="rounded-lg border border-line bg-page p-3">
            <div className="text-sm text-muted">Sick leave usable</div>
            <div className="text-xl font-semibold text-ink tabular-nums">{fmt(sick.usable, sick.unit)}</div>
            {sick.lockedUntil && <div className="text-xs text-muted">From {sick.lockedUntil}</div>}
          </li>
        )}
      </ul>
      <section aria-labelledby="ask" className="rounded-lg border border-line bg-page p-4">
        <h2 id="ask" className="mb-2 text-base font-semibold text-ink">
          Ask for time off
        </h2>
        <RequestForm leaveTypes={types.map((t) => ({ key: t.key, name: t.name }))} today={today} />
      </section>
      {requests.length > 0 && (
        <section aria-labelledby="recent" className="space-y-2">
          <h2 id="recent" className="text-base font-semibold text-ink">
            Recent requests
          </h2>
          <ul className="space-y-2">
            {requests.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-page p-3 text-sm">
                <span className="text-ink">
                  {formatRange(r.start, r.end)}
                  <span className="block text-muted">{typeName.get(r.leaveType) ?? r.leaveType}</span>
                </span>
                <Badge tone={r.status === 'approved' ? 'accent' : r.status === 'pending' ? 'warn' : 'neutral'}>{r.status}</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Shell>
  );
}
