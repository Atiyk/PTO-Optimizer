import { ActionButton } from '@/components/ActionButton';
import { Heatmap } from '@/components/PlanHeatmap';
import { PlannerControls } from '@/components/PlannerControls';
import { Badge, btnPrimary, Card, formatRange, Stat } from '@/components/ui';
import { call, requireActor } from '@/server/page';


export default async function PlannerPage({ searchParams }: { searchParams: Promise<{ team?: string; type?: string; from?: string }> }) {
  const actor = await requireActor();
  if (actor.role === 'employee') return <p className="text-sm text-muted">The planner is for managers and admins.</p>;
  const q = await searchParams;
  const isUuid = (v?: string) => !!v && /^[0-9a-f-]{36}$/i.test(v);
  const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const setup = await call('getOrgSetup', {}, actor);
  const balanceTypes = setup.leaveTypes.filter((t) => t.countsAgainstBalance);
  const leaveType = balanceTypes.some((t) => t.key === q.type) ? q.type! : (balanceTypes[0]?.key ?? 'vacation');
  const plan = await call('runTeamPlan', { teamId: isUuid(q.team) ? q.team : undefined, leaveType, start: isDate(q.from) ? q.from : undefined }, actor);
  const proposals = plan.people
    .filter((p) => p.requests.length > 0)
    .map((p) => ({ memberId: p.memberId, blocks: p.requests, deadline: p.deadline }));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-ink">Clear expiring leave</h1>
      <Card>
        <PlannerControls
          teams={plan.teams}
          leaveTypes={balanceTypes.map((t) => ({ key: t.key, name: t.name }))}
          team={plan.team.id}
          leaveType={plan.leaveType}
          start={plan.start}
        />
      </Card>

      <Card
        title="The plan"
        actions={
          proposals.length > 0 ? (
            <ActionButton
              capability="sendPlanProposals"
              input={{ teamId: plan.team.id, leaveType: plan.leaveType, proposals }}
              className={btnPrimary}
              confirm={`Send suggestions to ${proposals.length} ${proposals.length === 1 ? 'person' : 'people'}?`}
              doneMessage="Sent. Each person can accept or change their dates." 
            >
              Send to the team
            </ActionButton>
          ) : null
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Days at risk" value={plan.totals.atRisk} hint={`${plan.people.length} ${plan.people.length === 1 ? 'person' : 'people'}`} />
          <Stat label="Saved by this plan" value={plan.totals.placed} />
          <Stat
            label="Still lost"
            value={plan.totals.stillLost}
            hint={
              plan.totals.lostToCoverage > 0
                ? plan.exact
                  ? 'The minimum the coverage rules allow'
                  : 'Coverage rules limit this'
                : plan.totals.partDays > 0
                  ? 'Part-days: book as half days'
                  : 'Nothing lost'
            }
          />
        </div>
        <p className="mt-3 text-sm text-ink">
          {plan.summary.text}
          {plan.summary.source !== 'ai' && <span className="text-muted"> {plan.summary.source === 'demo' ? '(demo mode)' : ''}</span>}
        </p>
        <p className="mt-1 text-xs text-muted">
          Nothing is booked until each person accepts. Computed in {plan.stats.ms} ms{plan.stats.stoppedEarly ? ' (stopped early; still valid)' : ''}.
        </p>
      </Card>

      {plan.people.length > 0 && (
        <Card title="Per person">
          <ul className="divide-y divide-line text-sm">
            {plan.people.map((p) => (
              <li key={p.memberId} className="py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-ink">{p.name.untrusted_text}</span>
                  <span className="text-muted">
                    {p.placed} of {p.atRisk} days placed · use by {p.deadline}
                    {p.stillLost > 0 && <> · <Badge tone="warn">{p.stillLost} lost</Badge></>}
                  </span>
                </div>
                {p.blocks.length > 0 && (
                  <ul className="mt-1 flex flex-wrap gap-1">
                    {p.blocks.map((b) => (
                      <li key={b.start}>
                        <Badge tone="accent">
                          {formatRange(b.start, b.end)}: {b.daysOff} days off for {b.leaveDays}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
                {p.shortfallReason && <p className="mt-1 text-muted">{p.shortfallReason}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {plan.heatmap.length > 0 && (
        <Card title="Coverage, with the plan">
          <Heatmap days={plan.heatmap} />
          <p className="mt-2 text-xs text-muted">
            Each cell: people out that day, and how many more could be out before a rule is broken. Darker = more people out; striped = at the
            minimum. Rules: {plan.rules.map((r) => r.label).join('; ') || 'none'}.
          </p>
        </Card>
      )}
    </div>
  );
}
