import { CapabilityForm } from '@/components/CapabilityForm';
import { ActionButton } from '@/components/ActionButton';
import { Badge, Card } from '@/components/ui';
import { appUrl } from '@/lib/appUrl';
import { call, requireActor } from '@/server/page';

export default async function People({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const actor = await requireActor();
  const { welcome } = await searchParams;
  const [{ members, invites }, setup] = await Promise.all([call('listMembers', {}, actor), call('getOrgSetup', {}, actor)]);
  const teamName = new Map(setup.teams.map((t) => [t.id, t.name]));
  const locName = new Map(setup.locations.map((l) => [l.id, l.name]));
  const memberName = new Map(members.map((m) => [m.id, m.name]));
  const teamOpts = setup.teams.map((t) => ({ value: t.id, label: t.name }));
  return (
    <div className="space-y-4">
      {welcome && (
        <Card title="You’re set up">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-ink">
            <li>Invite your team with a link below (or import a CSV from Timetastic, Vacation Tracker or a spreadsheet).</li>
            <li>Check the default policies in Setup. Vacation is 20 days a year with up to 5 carrying over.</li>
            <li>Add a coverage rule so requests that leave the team short are flagged.</li>
          </ol>
        </Card>
      )}
      <Card title="Invite people">
        <p className="mb-3 text-sm text-muted">No emails are sent: share the link in Slack or chat. Anyone with the link can join until it expires or is used up.</p>
        <CapabilityForm
          capability="manageMembers"
          fixed={{ op: 'createInvite' }}
          fields={[
            { name: 'role', label: 'Joins as', type: 'select', options: [{ value: 'employee', label: 'Employee' }, { value: 'manager', label: 'Manager' }, { value: 'admin', label: 'Admin' }], defaultValue: 'employee' },
            { name: 'teamId', label: 'Team', type: 'select', options: teamOpts, emptyLabel: 'No team' },
            { name: 'maxUses', label: 'How many people can use it', type: 'number', defaultValue: 25, step: '1' },
          ]}
          submitLabel="Create invite link"
          onDoneMessage="Invite link created."
          showResultField={{ key: 'inviteToken', prefix: `${appUrl()}/join/`, label: 'Copy this link (shown once)' }}
        />
        {invites.filter((i) => !i.revoked).length > 0 && (
          <ul className="mt-3 divide-y divide-line text-sm">
            {invites.filter((i) => !i.revoked).map((i) => (
              <li key={i.id} className="flex items-center justify-between py-1.5">
                <span>{i.role} · {i.teamId ? teamName.get(i.teamId) : 'no team'} · used {i.uses}/{i.maxUses} · expires {i.expiresAt.slice(0, 10)}</span>
                <ActionButton capability="manageMembers" input={{ op: 'revokeInvite', inviteId: i.id }}>Revoke</ActionButton>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title={`People (${members.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="p-1">Name</th><th className="p-1">Role</th><th className="p-1">Team</th><th className="p-1">Location</th><th className="p-1">Manager</th><th className="p-1">Works</th><th className="p-1"></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-t border-line">
                  <td className="p-1 text-ink">{m.name} {m.slackLinked && <Badge>Slack</Badge>}</td>
                  <td className="p-1">{m.role}</td>
                  <td className="p-1">{m.teamId ? teamName.get(m.teamId) : '—'}</td>
                  <td className="p-1">{m.locationId ? locName.get(m.locationId) : '—'}</td>
                  <td className="p-1">{m.managerId ? memberName.get(m.managerId) : '—'}</td>
                  <td className="p-1 font-mono text-xs" title="Mon–Sun">{m.workWeek.split('').map((d, i) => (d === '1' ? 'MTWTFSS'[i] : '·')).join('')} {m.hoursPerDay}h</td>
                  <td className="p-1">
                    {m.role !== 'owner' && m.id !== actor.memberId && (
                      <ActionButton capability="manageMembers" input={{ op: 'remove', memberId: m.id }} confirm={`Remove ${m.name}?`}>Remove</ActionButton>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Edit a person">
        <CapabilityForm
          capability="manageMembers"
          fixed={{ op: 'update' }}
          fields={[
            { name: 'memberId', label: 'Person', type: 'select', options: members.map((m) => ({ value: m.id, label: m.name })) },
            { name: 'teamId', label: 'Team', type: 'select', options: teamOpts, nullable: true },
            { name: 'locationId', label: 'Location', type: 'select', options: setup.locations.map((l) => ({ value: l.id, label: l.name })), nullable: true },
            { name: 'managerId', label: 'Manager', type: 'select', options: members.map((m) => ({ value: m.id, label: m.name })), nullable: true },
            { name: 'workWeek', label: 'Work week (Mon→Sun, 1 = works)', type: 'text', placeholder: '1111100' },
            { name: 'hoursPerDay', label: 'Hours per day', type: 'number', step: '0.25' },
            { name: 'startDate', label: 'Start date', type: 'date' },
            { name: 'tags', label: 'Tags (comma-separated, e.g. engineer)', type: 'tags' },
          ]}
          submitLabel="Save person"
        />
        <div className="mt-4 border-t border-line pt-4">
          <CapabilityForm
            capability="manageMembers"
            fixed={{ op: 'setRole' }}
            fields={[
              { name: 'memberId', label: 'Person', type: 'select', options: members.map((m) => ({ value: m.id, label: m.name })) },
              { name: 'role', label: 'Role', type: 'select', options: ['employee', 'manager', 'admin', 'owner'].map((r) => ({ value: r, label: r })) },
            ]}
            submitLabel="Change role"
          />
        </div>
      </Card>
    </div>
  );
}
