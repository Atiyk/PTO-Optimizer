import { ActionButton } from '@/components/ActionButton';
import { DecideButtons } from '@/components/DecideButtons';
import { Badge, Card, fmt, formatRange } from '@/components/ui';
import { call, requireActor } from '@/server/page';

export default async function Approvals() {
  const actor = await requireActor();
  if (actor.role === 'employee') return <p className="text-sm text-muted">Approvals are for managers and admins.</p>;
  const { requests, recentAutoApprovals } = await call('listPendingApprovals', {}, actor);
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
          {r.autoApproval && (
            <p className="mt-2 text-sm">
              {r.autoApproval.eligible ? (
                <><Badge tone="accent">Meets auto-approval rules</Badge> Safe to approve by the org&rsquo;s rules.</>
              ) : (
                <><Badge>Needs a look</Badge> {r.autoApproval.blockers.join(' ')}</>
              )}
            </p>
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
      {recentAutoApprovals.length > 0 && (
        <Card title={`Auto-approved, can still be undone (${recentAutoApprovals.length})`}>
          <ul className="space-y-2 text-sm">
            {recentAutoApprovals.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="font-medium text-ink">{a.member.name.untrusted_text}</span> · {formatRange(a.start, a.end)} · {a.leaveType}
                  <span className="block text-muted">{a.basis}. Undo until {new Date(a.reversibleUntil).toUTCString().slice(0, 22)} UTC.</span>
                </span>
                <ActionButton capability="decideLeaveRequest" input={{ requestId: a.id, decision: 'decline' }} confirm="Undo this approval?">
                  Undo
                </ActionButton>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
