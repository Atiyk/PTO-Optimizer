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
  const { tasks: hrTasks } = await call('listHrTasks', { includeDone: false }, actor);
  const replays = new Map(
    await Promise.all(setup.approvalPolicies.map(async (p) => [p.id, await call('getShadowReplay', { policyId: p.id, days: 90 }, actor)] as const)),
  );
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

  const policyText = (p: (typeof setup.approvalPolicies)[number]) =>
    [
      `${scopeText(p)}:`,
      MODE_TEXT[p.mode],
      p.mode === 'auto' || p.mode === 'suggest' || p.mode === 'shadow'
        ? [
            p.maxDays != null ? `up to ${p.maxDays} days` : 'any length',
            p.minNoticeDays != null ? `with at least ${p.minNoticeDays} days' notice` : null,
            p.toleratedWarnings.length ? `even with warnings about ${p.toleratedWarnings.map((w) => WARNING_TEXT[w] ?? w).join(', ')}` : 'only when there are no warnings',
          ]
            .filter(Boolean)
            .join(', ') + '.'
        : null,
      `Reminder after ${p.slaHours} hours, escalate every ${p.escalateAfterHours} hours.`,
    ]
      .filter(Boolean)
      .join(' ');

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

      <Card title={`HR tasks (${hrTasks.length})`}>
        <p className="mb-3 text-sm text-muted">Protected leave is recorded and lands here instead of with a manager. Facts for HR, never a decision: no reason or diagnosis is stored.</p>
        {hrTasks.length === 0 ? (
          <p className="text-sm text-muted">Nothing to do.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {hrTasks.map((t) => (
              <li key={t.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                <span>
                  {t.overdue ? <Badge tone="bad">Overdue</Badge> : <Badge tone="warn">{t.businessDaysLeft == null ? 'Open' : `${t.businessDaysLeft} business days left`}</Badge>}{' '}
                  <span className="font-medium text-ink">{t.what}</span>
                  <span className="block text-muted">
                    {t.member ? t.member.name.untrusted_text : 'Unknown person'}
                    {t.request ? ` · ${t.request.leaveType}, ${formatRange(t.request.start, t.request.end)}` : ''}
                    {t.dueAt ? ` · due ${t.dueAt}` : ''}
                  </span>
                  {t.facts && (
                    <span className="block text-muted">
                      Started {t.facts.startDate ?? 'unknown'}
                      {t.facts.monthsEmployed != null ? ` (${t.facts.monthsEmployed} months)` : ''}
                      {t.facts.hoursLast12Months != null ? ` · ${t.facts.hoursLast12Months} hours on record in the last 12 months` : ' · no hours on record'}
                    </span>
                  )}
                  {t.citation && (
                    <a className="block text-accent underline" href={t.citation.url} rel="noreferrer" target="_blank">
                      {t.citation.regulation} {t.citation.section}
                    </a>
                  )}
                </span>
                <ActionButton capability="completeHrTask" input={{ taskId: t.id }}>Mark done</ActionButton>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Approval policies">
        <p className="mb-3 text-sm text-muted">
          Decide which requests go through without a manager. Start a team on <strong>Shadow</strong> (records what would happen), check the replay below, then move it to <strong>Suggest</strong> (approvers get &ldquo;Approve all clean&rdquo;) and finally <strong>Auto</strong>. Nothing is ever declined by rules, and protected or health-related leave never waits on coverage or notice rules. The most specific policy wins.
        </p>
        {setup.approvalPolicies.length === 0 && <p className="mb-3 text-sm text-muted">No policies yet: the org-wide auto-approval setting applies, as before.</p>}
        <ul className="mb-4 space-y-3 text-sm">
          {setup.approvalPolicies.map((p) => {
            const r = replays.get(p.id);
            return (
              <li key={p.id} className="rounded-md border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <Badge tone={p.mode === 'auto' ? 'accent' : p.mode === 'off' ? 'neutral' : 'warn'}>{MODE_LABEL[p.mode]}</Badge> <span className="font-medium text-ink">{p.name}</span>
                  </span>
                  <ActionButton capability="manageOrgSetup" input={{ op: 'removeApprovalPolicy', policyId: p.id }} confirm={`Remove the policy "${p.name}"?`}>Remove</ActionButton>
                </div>
                <p className="mt-1 text-ink">{policyText(p)}</p>
                {r && (
                  <div className="mt-2 rounded-md bg-surface-alt p-2">
                    <p className="text-ink">
                      <span className="font-medium">Replay, last 90 days:</span> of {r.decided} requests a person decided, {r.wouldAutoApprove} would have gone through by themselves; people approved {r.approvedOfThose} of those
                      {r.declinedOfThose.length ? ` and declined ${r.declinedOfThose.length}` : ''}.
                    </p>
                    {r.declinedOfThose.length > 0 && (
                      <ul className="mt-1 list-disc pl-5 text-ink">
                        {r.declinedOfThose.slice(0, 5).map((d) => (
                          <li key={d.requestId}>{d.member.untrusted_text}, {d.leaveType} {formatRange(d.start, d.end)}{d.reason ? `: declined for ${d.reason.replace(/_/g, ' ')}` : ''}</li>
                        ))}
                      </ul>
                    )}
                    {r.blockedReasons.length > 0 && <p className="mt-1 text-muted">Still to a person, mostly because: {r.blockedReasons.slice(0, 3).map((b) => `${b.reason} (${b.count})`).join('; ')}</p>}
                  </div>
                )}
                <details className="mt-2">
                  <summary className="cursor-pointer text-accent">Edit</summary>
                  <div className="mt-2"><PolicyFields fixed={{ op: 'setApprovalPolicy', policyId: p.id }} p={p} typeOpts={typeOpts} siteOpts={siteOpts} teamOpts={teamOpts} groupOpts={groupOpts} submitLabel="Save policy" /></div>
                </details>
              </li>
            );
          })}
        </ul>
        <h3 className="mb-2 text-sm font-semibold text-ink">Add a policy</h3>
        <PolicyFields fixed={{ op: 'setApprovalPolicy' }} typeOpts={typeOpts} siteOpts={siteOpts} teamOpts={teamOpts} groupOpts={groupOpts} submitLabel="Add policy" />
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
                <Badge tone={r.hard ? 'bad' : 'warn'}>{r.kind === 'request_window' ? 'Collects' : r.hard ? 'Blocks' : 'Warns'}</Badge>{' '}
                <span className="font-medium text-ink">{r.description} ({r.name})</span>
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
            <h3 className="mb-2 text-sm font-semibold text-ink">Add a rule</h3>
            <p className="mb-2 text-sm text-muted">Fill in the boxes for the rule you pick; the others are ignored. A request window collects requests for a busy period and shares the days out fairly after the closing date (it never blocks).</p>
            <CapabilityForm
              capability="manageOrgSetup"
              fixed={{ op: 'addPolicyRule' }}
              submitLabel="Add rule"
              fields={[
                {
                  name: 'kind',
                  label: 'Rule',
                  type: 'select',
                  options: [
                    { value: 'max_out', label: 'At most N people away at once' },
                    { value: 'probation', label: 'Probation (days after start)' },
                    { value: 'min_notice', label: 'Minimum notice' },
                    { value: 'max_consecutive', label: 'Longest single request' },
                    { value: 'request_window', label: 'Request window (busy period)' },
                  ],
                },
                { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Front desk cover' },
                { name: 'maxOut', label: 'Most people away (max away)', type: 'number', step: '1' },
                { name: 'minDays', label: 'Days after start (probation)', type: 'number', step: '1' },
                { name: 'noticeDays', label: 'Days of notice (minimum notice)', type: 'number', step: '1' },
                { name: 'longRequestDays', label: 'Long request from N days (minimum notice)', type: 'number', step: '1' },
                { name: 'longNoticeDays', label: 'Notice for long requests', type: 'number', step: '1' },
                { name: 'maxDays', label: 'Most working days (longest request)', type: 'number', step: '1' },
                { name: 'start', label: 'Window from (request window)', type: 'date' },
                { name: 'end', label: 'Window to', type: 'date' },
                { name: 'collectUntil', label: 'Collect requests until', type: 'date' },
                { name: 'slots', label: 'People away per day', type: 'number', step: '1' },
                {
                  name: 'tieBreak',
                  label: 'If too many ask',
                  type: 'select',
                  options: [
                    { value: 'rotation', label: 'Rotate (who missed out last time goes first)' },
                    { value: 'seniority', label: 'Seniority' },
                    { value: 'lottery', label: 'Lottery (seeded, reproducible)' },
                  ],
                },
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

const MODE_LABEL = { off: 'Off', shadow: 'Shadow', suggest: 'Suggest', auto: 'Auto' } as const;
const MODE_TEXT = {
  off: 'a person decides every request.',
  shadow: 'a person decides; the app records what it would have done,',
  suggest: 'a person decides, with "Approve all clean" for requests that would pass,',
  auto: 'approved by itself',
} as const;
const WARNING_TEXT: Record<string, string> = {
  event: 'team events',
  coverage: 'coverage',
  blackout: 'soft blackouts',
  probation: 'probation',
  max_out: 'people away',
  notice: 'notice',
  max_consecutive: 'length',
  overtime: 'overtime for cover',
};
const TOLERABLE = ['event', 'coverage', 'blackout', 'probation', 'max_out', 'notice', 'max_consecutive', 'overtime'] as const;

type Opt = { value: string; label: string }[];
function PolicyFields({
  fixed,
  p,
  typeOpts,
  siteOpts,
  teamOpts,
  groupOpts,
  submitLabel,
}: {
  fixed: Record<string, unknown>;
  p?: { name: string; mode: string; maxDays: number | null; minNoticeDays: number | null; toleratedWarnings: string[]; leaveTypeKeys: string[]; locationIds: string[]; teamIds: string[]; groupIds: string[]; slaHours: number; escalateAfterHours: number };
  typeOpts: Opt;
  siteOpts: Opt;
  teamOpts: Opt;
  groupOpts: Opt;
  submitLabel: string;
}) {
  return (
    <CapabilityForm
      capability="manageOrgSetup"
      fixed={fixed}
      submitLabel={submitLabel}
      fields={[
        { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Front desk short breaks', defaultValue: p?.name },
        {
          name: 'mode',
          label: 'Mode',
          type: 'select',
          defaultValue: p?.mode ?? 'shadow',
          options: [
            { value: 'shadow', label: 'Shadow: record what would happen' },
            { value: 'suggest', label: 'Suggest: offer "Approve all clean"' },
            { value: 'auto', label: 'Auto: approve clean requests' },
            { value: 'off', label: 'Off: a person decides everything' },
          ],
        },
        { name: 'maxDays', label: 'Auto-approve up to (days)', type: 'number', step: '0.5', placeholder: '3', defaultValue: p?.maxDays ?? undefined },
        { name: 'minNoticeDays', label: 'Needs at least (days of notice)', type: 'number', step: '1', placeholder: '7', defaultValue: p?.minNoticeDays ?? undefined },
        { name: 'toleratedWarnings', label: 'Still auto-approve with a warning about', type: 'multiselect', options: TOLERABLE.map((w) => ({ value: w, label: WARNING_TEXT[w]! })), defaultValues: p?.toleratedWarnings },
        { name: 'slaHours', label: 'Remind the approver after (hours)', type: 'number', step: '1', defaultValue: p?.slaHours ?? 24 },
        { name: 'escalateAfterHours', label: 'Escalate every (hours)', type: 'number', step: '1', defaultValue: p?.escalateAfterHours ?? 48 },
        { name: 'leaveTypeKeys', label: 'Leave types', type: 'multiselect', options: typeOpts, defaultValues: p?.leaveTypeKeys },
        { name: 'locationIds', label: 'Sites', type: 'multiselect', options: siteOpts, defaultValues: p?.locationIds },
        { name: 'teamIds', label: 'Teams', type: 'multiselect', options: teamOpts, defaultValues: p?.teamIds },
        { name: 'groupIds', label: 'Groups', type: 'multiselect', options: groupOpts, defaultValues: p?.groupIds },
      ]}
    />
  );
}
