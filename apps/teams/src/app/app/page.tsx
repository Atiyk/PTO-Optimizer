import { ActionButton } from '@/components/ActionButton';
import { RequestForm } from '@/components/RequestForm';
import { Badge, Card, fmt, formatRange, Stat } from '@/components/ui';
import { call, requireActor } from '@/server/page';

export default async function MyLeave() {
  const actor = await requireActor();
  const today = new Date().toISOString().slice(0, 10);
  const setup = await call('getOrgSetup', {}, actor);
  const types = setup.leaveTypes.filter((t) => !t.key.startsWith('archived'));
  const balances = await Promise.all(
    types.filter((t) => t.countsAgainstBalance).map(async (t) => ({ type: t, b: await call('getMyBalance', { leaveType: t.key }, actor) })),
  );
  const { requests } = await call('listMyRequests', { limit: 30 }, actor);
  const typeName = new Map(types.map((t) => [t.key, t.name]));

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-2">
        {balances.map(({ type, b }) => (
          <Card key={type.key} title={type.name}>
            {b.unlimited ? (
              <Stat label="Taken this year" value={fmt(b.usedThisPlanYear, b.unit)} hint="Unlimited policy" />
            ) : (
              <div className="space-y-3">
                <Stat label="Available now" value={fmt(b.usable ?? b.balance, b.unit)} />
                {b.carried > 0 && b.carriedExpiresOn && (
                  <p className="text-sm text-muted">
                    Includes {fmt(b.carried, b.unit)} carried over; use by {b.carriedExpiresOn}.
                  </p>
                )}
                {b.yearEnd && (
                  <p className="text-sm text-ink">
                    You&rsquo;ll have <strong>{fmt(b.yearEnd.balance, b.unit)}</strong> on {b.yearEnd.date}
                    {b.yearEnd.wouldForfeit > 0 ? (
                      <>
                        ; <strong>{fmt(b.yearEnd.wouldForfeit, b.unit)}</strong> above what carries over, so they would be lost.
                      </>
                    ) : (
                      '.'
                    )}
                  </p>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>
      <div className="space-y-4 lg:col-span-3">
        <Card title="Request time off">
          <RequestForm leaveTypes={types.map((t) => ({ key: t.key, name: t.name }))} today={today} />
        </Card>
        <Card title="My requests">
          {requests.length === 0 ? (
            <p className="text-sm text-muted">Nothing yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {requests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div>
                    <div className="text-ink">
                      {formatRange(r.start, r.end)} <span className="text-muted">· {typeName.get(r.leaveType) ?? r.leaveType}{r.part !== 'full' ? ` · ${r.part === 'hours' ? `${r.hours} h` : r.part}` : ''}</span>
                    </div>
                    <div className="text-muted">{r.deducts > 0 ? `Uses ${fmt(r.deducts, r.unit)}` : 'No balance used'}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={r.status === 'approved' ? 'accent' : r.status === 'pending' ? 'warn' : 'neutral'}>{r.status}</Badge>
                    {(r.status === 'pending' || (r.status === 'approved' && r.start >= today)) && (
                      <ActionButton capability="cancelLeaveRequest" input={{ requestId: r.id }} confirm="Cancel this request?">
                        Cancel
                      </ActionButton>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
