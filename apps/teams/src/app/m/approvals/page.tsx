import Link from 'next/link';
import { DecideButtons } from '@/components/DecideButtons';
import { DecisionChecks } from '@/components/DecisionChecks';
import { ActionButton } from '@/components/ActionButton';
import { ProfileChangeQueue } from '@/components/ProfileChanges';
import { Shell } from '@/components/mobile/Shell';
import { fmt, formatRange } from '@/components/ui';
import { getOrg } from '@/domain/leave';
import { getDb } from '@/db/client';
import { call, requireActor } from '@/server/page';

/** Approvals on the phone: the same queue and impact facts as the web, one tap to decide. */
export default async function StaffApprovals() {
  const actor = await requireActor('/m/signin');
  const org = await getOrg(await getDb(), actor.orgId);
  if (actor.role === 'employee') {
    return (
      <Shell title="Approvals" org={org.name} active="/m">
        <p className="text-sm text-muted">Approvals are for managers and admins. <Link href="/m" className="underline">Back to today</Link></p>
      </Shell>
    );
  }
  const { requests } = await call('listPendingApprovals', {}, actor);
  const { toDecide } = await call('getProfileChanges', {}, actor);
  return (
    <Shell title={`Approvals (${requests.length + toDecide.length})`} org={org.name} active="/m">
      {requests.length === 0 && <p className="text-sm text-muted">No leave requests waiting.</p>}
      {requests.some((r) => r.decision.wouldAutoApprove && r.decision.route === 'needs_person') && (
        <ActionButton
          capability="approveAllClean"
          input={{ requestIds: requests.filter((r) => r.decision.wouldAutoApprove && r.decision.route === 'needs_person').map((r) => r.id) }}
          confirm="Approve every request that passes all checks?"
        >
          Approve all clean
        </ActionButton>
      )}
      {requests.map((r) => (
        <section key={r.id} aria-label={`${r.member.name.untrusted_text}, ${formatRange(r.start, r.end)}`} className="space-y-2 rounded-lg border border-line bg-page p-4">
          <div className="font-semibold text-ink">{r.member.name.untrusted_text}</div>
          <div className="text-sm text-ink">{formatRange(r.start, r.end)} · {r.leaveType} · {fmt(r.deducts, r.impact.unit)}</div>
          <div className="text-sm text-muted">
            Balance after {fmt(r.impact.balanceAfter, r.impact.unit)} · {r.impact.coverage.length ? `${r.impact.coverage.length} short day${r.impact.coverage.length > 1 ? 's' : ''}` : 'coverage OK'}
            {r.impact.overlapping.length ? ` · also out: ${r.impact.overlapping.map((o) => o.member.untrusted_text).join(', ')}` : ''}
          </div>
          <DecisionChecks r={r} compact />
          {r.note && <p className="text-sm text-ink"><span className="text-muted">Note: </span>{r.note.untrusted_text}</p>}
          <DecideButtons requestId={r.id} />
        </section>
      ))}
      <section aria-labelledby="changes" className="space-y-2 rounded-lg border border-line bg-page p-4">
        <h2 id="changes" className="text-base font-semibold text-ink">Record changes</h2>
        <ProfileChangeQueue changes={toDecide} />
      </section>
    </Shell>
  );
}
