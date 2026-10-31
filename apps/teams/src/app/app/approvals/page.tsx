import { ActionButton } from '@/components/ActionButton';
import { DecideButtons } from '@/components/DecideButtons';
import { DecisionChecks } from '@/components/DecisionChecks';
import { ProfileChangeQueue } from '@/components/ProfileChanges';
import { Badge, Card, fmt, formatRange } from '@/components/ui';
import { call, requireActor } from '@/server/page';

export default async function Approvals() {
  const actor = await requireActor();
  if (actor.role === 'employee') return <p className="text-sm text-muted">Approvals are for managers and admins.</p>;
  const { requests, recentAutoApprovals } = await call('listPendingApprovals', {}, actor);
  const { toDecide } = await call('getProfileChanges', {}, actor);
  const { windows } = await call('getRequestWindows', {}, actor);
  const clean = requests.filter((r) => r.decision.wouldAutoApprove && r.decision.route === 'needs_person' && !r.requestWindow);
  const ready = windows.filter((w) => w.status === 'ready' && w.allocation.length);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-ink">Waiting for you ({requests.length})</h1>
        {clean.length > 0 && (
          <ActionButton capability="approveAllClean" input={{ requestIds: clean.map((r) => r.id) }} confirm={`Approve ${clean.length} request${clean.length === 1 ? '' : 's'} that pass every check?`}>
            Approve all clean ({clean.length})
          </ActionButton>
        )}
      </div>
      {ready.map((w) => (
        <Card key={w.ruleId} title={`${w.name}: places to confirm`}>
          <p className="text-sm text-muted">
            {w.requests} asked for {formatRange(w.start, w.end)}; {w.slots} place{w.slots === 1 ? '' : 's'} a day, shared by {w.tieBreak}. Confirming approves the ones marked in and declines the rest with &ldquo;busy period&rdquo; and other dates.
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {w.allocation.map((a) => (
              <li key={a.requestId}>
                <Badge tone={a.in ? 'ok' : 'neutral'}>{a.in ? 'In' : 'Not this time'}</Badge> {a.member.name.untrusted_text} · {formatRange(a.start, a.end)} <span className="text-muted">({a.reason})</span>
              </li>
            ))}
          </ul>
          <div className="mt-3">
            <ActionButton capability="confirmRequestWindow" input={{ ruleId: w.ruleId }} confirm="Confirm this allocation?">
              Confirm allocation
            </ActionButton>
          </div>
        </Card>
      ))}
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
          <DecisionChecks r={r} />
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
      <Card title={`Record changes (${toDecide.length})`}>
        <ProfileChangeQueue changes={toDecide} />
      </Card>
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
