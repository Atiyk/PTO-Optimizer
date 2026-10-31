import { AccrualScheduleForm } from '@/components/AccrualScheduleForm';
import { ActionButton } from '@/components/ActionButton';
import { CapabilityForm } from '@/components/CapabilityForm';
import { Badge, Card, formatRange } from '@/components/ui';
import { call, requireActor } from '@/server/page';

/** Approval routing, groups, policy automations, accrual schedules (plan-gated) and Microsoft Teams. */
export default async function Policies() {
  const actor = await requireActor();
  const setup = await call('getOrgSetup', {}, actor);
  const { members } = await call('listMembers', {}, actor);
  const teamsConn = await call('getMsTeamsConnection', {}, actor);
  const today = new Date().toISOString().slice(0, 10);
  const deciders = members.filter((m) => m.role !== 'employee').map((m) => ({ value: m.id, label: m.name }));
  const name = new Map(members.map((m) => [m.id, m.name]));
  const typeOpts = setup.leaveTypes.filter((t) => !t.key.startsWith('archived')).map((t) => ({ value: t.key, label: t.name }));
  const typeName = new Map(setup.leaveTypes.map((t) => [t.key, t.name]));
  const siteOpts = setup.locations.map((l) => ({ value: l.id, label: l.name }));
  const teamOpts = setup.teams.map((t) => ({ value: t.id, label: t.name }));
  const groupOpts = setup.groups.map((g) => ({ value: g.id, label: g.name }));
  const label = (m: Map<string, string>, ids: string[]) => ids.map((i) => m.get(i) ?? '?').join(', ');
  const siteName = new Map(setup.locations.map((l) => [l.id, l.name]));
  const teamName = new Map(setup.teams.map((t) => [t.id, t.name]));
  const groupName = new Map(setup.groups.map((g) => [g.id, g.name]));
  const scopeText = (s: { leaveTypeKeys: string[]; locationIds: string[]; teamIds?: string[]; groupIds: string[] }) =>
    [
      s.leaveTypeKeys.length ? s.leaveTypeKeys.map((k) => typeName.get(k) ?? k).join(', ') : 'All leave types',
      s.locationIds.length ? label(siteName, s.locationIds) : null,
      s.teamIds?.length ? label(teamName, s.teamIds) : null,
      s.groupIds.length ? label(groupName, s.groupIds) : null,
    ]
      .filter(Boolean)
      .join(' · ');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold text-ink">Approvals and policies</h1>
        <Badge tone={setup.org.plan === 'complete' ? 'accent' : 'neutral'}>{setup.org.plan === 'complete' ? 'Complete plan' : 'Starter plan'}</Badge>
      </div>

      <Card title="Who approves each team">
        <p className="mb-3 text-sm text-muted">Requests go to the team&rsquo;s approver, then the backup, then the person&rsquo;s manager, then admins. Approvers get each request in the web app, on their phone, and in Slack or Teams with Approve and Decline.</p>
        <div className="space-y-4">
          {setup.teams.map((t) => (
            <div key={t.id} className="rounded-md border border-line p-3">
              <div className="mb-2 text-sm font-medium text-ink">
                {t.name}
                <span className="font-normal text-muted"> · now: {t.approverMemberId ? name.get(t.approverMemberId) : 'manager, then admins'}{t.backupApproverMemberId ? `, backup ${name.get(t.backupApproverMemberId)}` : ''}</span>
              </div>
              <CapabilityForm
                capability="manageOrgSetup"
                fixed={{ op: 'setTeamApprovers', teamId: t.id }}
                submitLabel="Save approvers"
                fields={[
                  { name: 'approverMemberId', label: 'Approver', type: 'select', emptyLabel: 'Nobody (use managers)', options: deciders, defaultValue: t.approverMemberId ?? '' },
                  { name: 'backupApproverMemberId', label: 'Backup', type: 'select', emptyLabel: 'Nobody', options: deciders, defaultValue: t.backupApproverMemberId ?? '' },
                ]}
              />
            </div>
          ))}
        </div>
      </Card>

      <Card title={`Groups (${setup.groups.length})`}>
        <p className="mb-3 text-sm text-muted">Group people any way you like (no limit): use groups in reports, events and the rules below. A person can be in many groups.</p>
        <div className="space-y-4">
          {setup.groups.map((g) => (
            <div key={g.id} className="rounded-md border border-line p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-ink">{g.name} <span className="font-normal text-muted">· {g.memberIds.length} people</span></span>
                <ActionButton capability="manageOrgSetup" input={{ op: 'removeGroup', groupId: g.id }} confirm={`Delete the group "${g.name}"?`}>Delete group</ActionButton>
              </div>
              <CapabilityForm
                capability="manageOrgSetup"
                fixed={{ op: 'setGroupMembers', groupId: g.id }}
                submitLabel="Save members"
                fields={[{ name: 'memberIds', label: 'Members', type: 'multiselect', options: members.map((m) => ({ value: m.id, label: m.name })), defaultValues: g.memberIds }]}
              />
            </div>
          ))}
          <CapabilityForm capability="manageOrgSetup" fixed={{ op: 'addGroup' }} submitLabel="Add group" fields={[{ name: 'name', label: 'New group name', type: 'text', required: true, placeholder: 'Front desk' }]} />
        </div>
      </Card>

      <Card title="Policy automations">
        <p className="mb-3 text-sm text-muted">Rules the engine checks on every request. A hard rule blocks the request; a soft rule warns the approver. Leave every box unticked to apply a rule to everyone.</p>
        <ul className="mb-4 divide-y divide-line text-sm">
          {setup.blackouts.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <Badge tone={b.hard ? 'bad' : 'warn'}>{b.hard ? 'Blocks' : 'Warns'}</Badge> <span className="font-medium text-ink">Blackout: {b.reason}</span>
                <span className="block text-muted">{formatRange(b.start, b.end)} · {scopeText({ ...b, teamIds: b.teamId ? [b.teamId] : [] })}</span>
              </span>
              <ActionButton capability="manageOrgSetup" input={{ op: 'removeBlackout', blackoutId: b.id }} confirm="Remove this blackout?">Remove</ActionButton>
            </li>
          ))}
          {setup.policyRules.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <Badge tone={r.hard ? 'bad' : 'warn'}>{r.hard ? 'Blocks' : 'Warns'}</Badge>{' '}
                <span className="font-medium text-ink">{r.kind === 'probation' ? `Probation: ${r.minDays} days` : `At most ${r.maxOut} away at once`} ({r.name})</span>
                <span className="block text-muted">{scopeText(r)}</span>
              </span>
              <ActionButton capability="manageOrgSetup" input={{ op: 'removePolicyRule', ruleId: r.id }} confirm="Remove this rule?">Remove</ActionButton>
            </li>
          ))}
          {setup.blackouts.length + setup.policyRules.length === 0 && <li className="py-2 text-muted">No rules yet.</li>}
        </ul>
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink">Add a blackout</h3>
            <CapabilityForm
              capability="manageOrgSetup"
              fixed={{ op: 'addBlackout' }}
              submitLabel="Add blackout"
              fields={[
                { name: 'reason', label: 'Name', type: 'text', required: true, placeholder: 'Holiday rush' },
                { name: 'hard', label: 'Block requests (otherwise warn)', type: 'checkbox', defaultValue: true },
                { name: 'start', label: 'From', type: 'date', required: true },
                { name: 'end', label: 'To', type: 'date', required: true },
                { name: 'leaveTypeKeys', label: 'Leave types', type: 'multiselect', options: typeOpts },
                { name: 'locationIds', label: 'Sites', type: 'multiselect', options: siteOpts },
                { name: 'groupIds', label: 'Groups', type: 'multiselect', options: groupOpts },
              ]}
            />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink">Add a probation or &ldquo;max away&rdquo; rule</h3>
            <CapabilityForm
              capability="manageOrgSetup"
              fixed={{ op: 'addPolicyRule' }}
              submitLabel="Add rule"
              fields={[
                { name: 'kind', label: 'Rule', type: 'select', options: [{ value: 'max_out', label: 'At most N people away at once' }, { value: 'probation', label: 'Probation (days after start)' }] },
                { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Front desk cover' },
                { name: 'maxOut', label: 'Most people away (max away)', type: 'number', step: '1' },
                { name: 'minDays', label: 'Days after start (probation)', type: 'number', step: '1' },
                { name: 'hard', label: 'Block requests (otherwise warn)', type: 'checkbox', defaultValue: true },
                { name: 'leaveTypeKeys', label: 'Leave types', type: 'multiselect', options: typeOpts },
                { name: 'locationIds', label: 'Sites', type: 'multiselect', options: siteOpts },
                { name: 'teamIds', label: 'Teams', type: 'multiselect', options: teamOpts },
                { name: 'groupIds', label: 'Groups', type: 'multiselect', options: groupOpts },
              ]}
            />
          </div>
        </div>
      </Card>

      <Card title="Accrual schedules" actions={<Badge tone={setup.org.plan === 'complete' ? 'accent' : 'neutral'}>{setup.org.plan === 'complete' ? 'All schedules' : 'Monthly on Starter'}</Badge>}>
        <AccrualScheduleForm
          leaveTypes={setup.leaveTypes.filter((t) => t.countsAgainstBalance && !t.key.startsWith('archived')).map((t) => ({ key: t.key, name: t.name, isHealthRelated: t.isHealthRelated }))}
          teams={setup.teams}
          locations={setup.locations}
          complete={setup.org.plan === 'complete'}
          today={today}
        />
      </Card>

      <Card title="Microsoft Teams">
        {!teamsConn.botConfigured && <p className="mb-2 text-sm text-ink"><Badge tone="warn">Not set up</Badge> The Teams bot needs its Azure app ID and secret on the server first (see the setup steps).</p>}
        {teamsConn.tenantId ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-ink">Linked to Microsoft 365 tenant <code className="font-mono">{teamsConn.tenantId}</code>.</span>
            <ActionButton capability="manageMsTeams" input={{ op: 'unlink' }} confirm="Unlink Microsoft Teams? Approval cards stop until you link again.">Unlink</ActionButton>
          </div>
        ) : (
          <CapabilityForm
            capability="manageMsTeams"
            fixed={{ op: 'link' }}
            submitLabel="Link tenant"
            onDoneMessage="Linked. People in that tenant can now use the Days Off app in Teams."
            fields={[{ name: 'tenantId', label: 'Microsoft 365 tenant ID (Entra admin center, Overview)', type: 'text', required: true, placeholder: '00000000-0000-0000-0000-000000000000' }]}
          />
        )}
      </Card>
    </div>
  );
}
