import { DecideButtons } from '@/components/DecideButtons';
import { Badge, Card, fmt, formatRange } from '@/components/ui';
import { call, requireActor } from '@/server/page';

export default async function Approvals() {
  const actor = await requireActor();
  if (actor.role === 'employee') return <p className="text-sm text-muted">Approvals are for managers and admins.</p>;
  const { requests } = await call('listPendingApprovals', {}, actor);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-ink">Waiting for you ({requests.length})</h1>
      {requests.length === 0 && <p className="text-sm text-muted">Nothing to decide right now.</p>}
      {requests.map((r) => (
        <Card
          key={r.id}
          title={
            <>
              {r.member.name.untrusted_text} <span className="font-normal text-muted">· {formatRange(r.start, r.end)}</span>
            </>
          }
          actions={<Badge>{r.leaveType}</Badge>}
        >
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted">Uses</dt>
              <dd className="font-medium text-ink">{fmt(r.deducts, r.impact.unit)}</dd>
            </div>
            <div>
              <dt className="text-muted">Balance after</dt>
              <dd className="font-medium text-ink">{fmt(r.impact.balanceAfter, r.impact.unit)}</dd>
            </div>
            <div>
              <dt className="text-muted">Coverage</dt>
              <dd className="font-medium text-ink">{r.impact.coverage.length === 0 ? 'OK on every day' : `${r.impact.coverage.length} short day${r.impact.coverage.length > 1 ? 's' : ''}`}</dd>
            </div>
            <div>
              <dt className="text-muted">Also out</dt>
              <dd className="font-medium text-ink">{r.impact.overlapping.length === 0 ? 'Nobody' : r.impact.overlapping.map((o) => o.member.untrusted_text).join(', ')}</dd>
            </div>
          </dl>
          {r.impact.coverage.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {r.impact.coverage.map((c) => (
                <li key={c.date}>
                  <Badge tone="bad">Short</Badge> {formatRange(c.date, c.date)}: {c.present} of {c.required} {c.tag ? `${c.tag}s` : 'people'} in
                </li>
              ))}
            </ul>
          )}
          {r.retroactive && <p className="mt-2 text-sm"><Badge tone="warn">Past dates</Badge> Starts before today.</p>}
          {r.note && (
            <p className="mt-2 text-sm text-ink">
              <span className="text-muted">Note: </span>
              {r.note.untrusted_text}
            </p>
          )}
          <div className="mt-3">
            <DecideButtons requestId={r.id} />
          </div>
        </Card>
      ))}
    </div>
  );
}
