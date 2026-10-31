import { ActionButton } from '@/components/ActionButton';
import { RequestForm } from '@/components/RequestForm';
import { ExplainBalance } from '@/components/ExplainBalance';
import { AskPolicy } from '@/components/AskPolicy';
import { UpdateMyDetails } from '@/components/ProfileChanges';
import { Badge, btnPrimary, btnSecondary, Card, fmt, formatRange, Stat } from '@/components/ui';
import { call, requireActor } from '@/server/page';

export default async function MyLeave({ searchParams }: { searchParams: Promise<{ type?: string; start?: string; end?: string }> }) {
  const prefill = await searchParams;
  const actor = await requireActor();
  const today = new Date().toISOString().slice(0, 10);
  const setup = await call('getOrgSetup', {}, actor);
  const types = setup.leaveTypes.filter((t) => !t.key.startsWith('archived'));
  const balances = await Promise.all(
    types.filter((t) => t.countsAgainstBalance).map(async (t) => ({ type: t, b: await call('getMyBalance', { leaveType: t.key }, actor) })),
  );
  const { requests } = await call('listMyRequests', { limit: 30 }, actor);
  const { proposals } = await call('listMyProposals', {}, actor);
  const { drafts: agentDrafts } = await call('listAgentDrafts', {}, actor);
  const typeName = new Map(types.map((t) => [t.key, t.name]));
  const { mine: myChanges } = await call('getProfileChanges', {}, actor);

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
                <ExplainBalance leaveType={type.key} />
              </div>
            )}
          </Card>
        ))}
      </div>
      <div className="space-y-4 lg:col-span-3">
        {agentDrafts.length > 0 && (
          <div id="agent-requests">
            <Card title="Requests from your agents">
              <ul className="space-y-3 text-sm">
                {agentDrafts.map((d) => (
                  <li key={d.id} className="space-y-2">
                    <p className="text-ink">
                      {d.summary}
                      <span className="text-muted"> · {d.createdByActorType === 'service-agent' ? 'from a workspace agent' : 'from your agent'}, until {d.expiresAt.slice(0, 10)}</span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <ActionButton capability="decideAgentDraft" input={{ draftId: d.id, decision: 'confirm' }} className={btnPrimary} doneMessage="Done.">
                        Confirm
                      </ActionButton>
                      <ActionButton capability="decideAgentDraft" input={{ draftId: d.id, decision: 'reject' }}>
                        Reject
                      </ActionButton>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        )}
        {proposals.length > 0 && (
          <Card title="Suggested by your manager">
            <ul className="space-y-3 text-sm">
              {proposals.map((p) => (
                <li key={p.id} className="space-y-2">
                  <p className="text-ink">
                    {p.blocks.map((b) => formatRange(b.start, b.end)).join(' and ')}{' '}
                    <span className="text-muted">· {typeName.get(p.leaveType) ?? p.leaveType} you would otherwise lose after {p.deadline}</span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <ActionButton capability="respondToProposal" input={{ proposalId: p.id, response: 'accept' }} className={btnPrimary}>
                      Accept
                    </ActionButton>
                    <a className={btnSecondary} href={`/app?type=${encodeURIComponent(p.leaveType)}&start=${p.blocks[0]!.start}&end=${p.blocks[0]!.end}`}>
                      Change dates
                    </a>
                    <ActionButton capability="respondToProposal" input={{ proposalId: p.id, response: 'dismiss' }}>
                      Not now
                    </ActionButton>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <Card title="Request time off">
          <RequestForm
            key={`${prefill.type ?? ''}${prefill.start ?? ''}${prefill.end ?? ''}`}
            leaveTypes={types.map((t) => ({ key: t.key, name: t.name }))}
            today={today}
            initial={{ leaveType: prefill.type, start: prefill.start, end: prefill.end }}
          />
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
        <Card title="Ask about my policy">
          <AskPolicy />
        </Card>
        <Card title="Update my details">
          <UpdateMyDetails mine={myChanges} locations={setup.locations} />
        </Card>
      </div>
    </div>
  );
}
