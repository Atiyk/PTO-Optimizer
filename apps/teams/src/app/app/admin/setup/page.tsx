import { ActionButton } from '@/components/ActionButton';
import { CapabilityForm } from '@/components/CapabilityForm';
import { PolicyForm } from '@/components/PolicyForm';
import { Badge, Card } from '@/components/ui';
import { AUTONOMY_LABELS, type AutonomyLevel } from '@/domain/autonomy';
import { describePolicy } from '@/domain/describePolicy';
import { call, requireActor } from '@/server/page';

const PROTECTED_OPTIONS = [
  { value: 'none', label: 'Not protected' },
  { value: 'fmla_possible', label: 'Possible FMLA (US)' },
  { value: 'parental', label: 'Parental' },
  { value: 'jury', label: 'Jury duty' },
  { value: 'military', label: 'Military' },
  { value: 'bereavement', label: 'Bereavement' },
  { value: 'voting', label: 'Voting' },
  { value: 'other_statutory', label: 'Other statutory leave' },
];

export default async function Setup() {
  const actor = await requireActor();
  const s = await call('getOrgSetup', {}, actor);
  const today = new Date().toISOString().slice(0, 10);
  const teamName = new Map(s.teams.map((t) => [t.id, t.name]));
  const teamOpts = s.teams.map((t) => ({ value: t.id, label: t.name }));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Policies">
        <ul className="mb-4 space-y-2 text-sm">
          {s.policies.map((p) => (
            <li key={p.id} className="rounded-md border border-line p-2">
              <div className="font-medium text-ink">
                {p.leaveType} · {p.name} <span className="font-normal text-muted">from {p.effectiveFrom}</span>
              </div>
              <div className="text-muted">{describePolicy(p.policy as never)}</div>
            </li>
          ))}
        </ul>
        <PolicyForm leaveTypes={s.leaveTypes.map((t) => ({ key: t.key, name: t.name }))} today={today} />
      </Card>
      <div className="space-y-4">
        <Card title="Leave types">
          <ul className="mb-3 space-y-1 text-sm">
            {s.leaveTypes.map((t) => (
              <li key={t.id} className="flex flex-wrap gap-1">
                <span className="mr-1 font-medium text-ink">{t.name}</span>
                <Badge>{t.paid ? 'paid' : 'unpaid'}</Badge>
                <Badge>{t.countsAgainstBalance ? 'uses balance' : 'no balance'}</Badge>
                <Badge>{t.requiresApproval ? 'needs approval' : 'no approval'}</Badge>
                {t.isHealthRelated && <Badge tone="warn">health: no notes</Badge>}
                {t.protectedCategory !== 'none' && <Badge tone="warn">protected: recorded and sent to HR</Badge>}
                {t.autoApprove && <Badge tone="accent">auto-approve{t.maxAutoApproveDays != null ? ` ≤ ${t.maxAutoApproveDays}` : ''}</Badge>}
              </li>
            ))}
          </ul>
          <CapabilityForm
            capability="manageOrgSetup"
            fixed={{ op: 'upsertLeaveType' }}
            fields={[
              { name: 'key', label: 'Key (lowercase)', type: 'text', placeholder: 'parental', required: true },
              { name: 'name', label: 'Name', type: 'text', placeholder: 'Parental leave', required: true },
              { name: 'paid', label: 'Paid', type: 'checkbox', defaultValue: true },
              { name: 'countsAgainstBalance', label: 'Uses a balance', type: 'checkbox', defaultValue: false },
              { name: 'requiresApproval', label: 'Needs approval', type: 'checkbox', defaultValue: true },
              { name: 'isHealthRelated', label: 'Health-related (no notes stored)', type: 'checkbox' },
              { name: 'autoApprove', label: 'Can be auto-approved (see Auto-approval)', type: 'checkbox' },
              { name: 'maxAutoApproveDays', label: 'Auto-approve up to (days or hours)', type: 'number', step: '0.5', placeholder: '2' },
              {
                name: 'protectedCategory',
                label: 'Protected by law (recorded, never approved or declined by rules)',
                type: 'select',
                options: PROTECTED_OPTIONS,
              },
            ]}
            submitLabel="Add or update leave type"
          />
        </Card>
        <Card title="Teams and locations">
          <p className="text-sm text-ink">Teams: {s.teams.map((t) => t.name).join(', ') || 'none'}</p>
          <p className="mt-1 text-sm text-ink">Locations: {s.locations.map((l) => `${l.name} (${l.countryCode}${l.subdivisionCode ? ` ${l.subdivisionCode}` : ''})`).join(', ')}</p>
          <div className="mt-3 space-y-4">
            <CapabilityForm capability="manageOrgSetup" fixed={{ op: 'addTeam' }} fields={[{ name: 'name', label: 'New team', type: 'text', required: true }]} submitLabel="Add team" />
            <CapabilityForm
              capability="manageOrgSetup"
              fixed={{ op: 'addLocation' }}
              fields={[
                { name: 'name', label: 'Location name', type: 'text', required: true, placeholder: 'London' },
                { name: 'countryCode', label: 'Country code', type: 'text', required: true, placeholder: 'GB' },
                { name: 'subdivisionCode', label: 'Region code (optional)', type: 'text', placeholder: 'GB-ENG' },
              ]}
              submitLabel="Add location"
            />
          </div>
        </Card>
        <Card title="Coverage rules">
          <ul className="mb-3 space-y-1 text-sm">
            {s.coverageRules.map((r) => (
              <li key={r.id} className="flex items-center justify-between">
                <span>
                  {teamName.get(r.teamId)}: at least {r.minPresent} {r.tag ? `${r.tag}s` : 'people'} in, weekdays {r.weekdays}
                </span>
                <ActionButton capability="manageOrgSetup" input={{ op: 'removeCoverageRule', ruleId: r.id }}>Remove</ActionButton>
              </li>
            ))}
          </ul>
          <CapabilityForm
            capability="manageOrgSetup"
            fixed={{ op: 'addCoverageRule' }}
            fields={[
              { name: 'teamId', label: 'Team', type: 'select', options: teamOpts },
              { name: 'minPresent', label: 'At least this many in', type: 'number', step: '1', defaultValue: 2 },
              { name: 'tag', label: 'Only count people tagged (optional)', type: 'text', placeholder: 'engineer' },
            ]}
            submitLabel="Add coverage rule"
          />
        </Card>
        <Card title="Blackouts">
          <ul className="mb-3 space-y-1 text-sm">
            {s.blackouts.map((b) => (
              <li key={b.id} className="flex items-center justify-between">
                <span>
                  {b.start} to {b.end}: {b.reason} {b.hard ? <Badge tone="bad">blocks</Badge> : <Badge tone="warn">warns</Badge>}
                </span>
                <ActionButton capability="manageOrgSetup" input={{ op: 'removeBlackout', blackoutId: b.id }}>Remove</ActionButton>
              </li>
            ))}
          </ul>
          <CapabilityForm
            capability="manageOrgSetup"
            fixed={{ op: 'addBlackout' }}
            fields={[
              { name: 'start', label: 'From', type: 'date', required: true },
              { name: 'end', label: 'To', type: 'date', required: true },
              { name: 'reason', label: 'Reason', type: 'text', required: true, placeholder: 'Year-end close' },
              { name: 'teamId', label: 'Team', type: 'select', options: teamOpts, emptyLabel: 'Everyone' },
              { name: 'hard', label: 'Block requests (not just warn)', type: 'checkbox' },
            ]}
            submitLabel="Add blackout"
          />
        </Card>
        <Card title="Auto-approval">
          <p className="mb-3 text-sm text-muted">
            Clean requests only: the leave type allows it, within its limit, enough balance, no coverage gap, no blackout, not in the past.
            The rules decide, never AI. Currently: <strong className="text-ink">{AUTONOMY_LABELS[s.autoApproval.level as AutonomyLevel]}</strong>.
          </p>
          <CapabilityForm
            capability="manageOrgSetup"
            fixed={{ op: 'setAutonomy', capability: 'decideLeaveRequest', actorClass: 'assistant' }}
            fields={[
              {
                name: 'level', label: 'Level', type: 'select', defaultValue: String(s.autoApproval.level),
                options: [
                  { value: '0', label: 'Off: managers decide everything' },
                  { value: '1', label: 'Suggest: show managers what qualifies' },
                  { value: '2', label: 'Draft: mark it ready, manager confirms' },
                  { value: '3', label: 'Approve; manager can undo for a while' },
                ],
              },
              { name: 'reversibleMinutes', label: 'Undo window (minutes)', type: 'number', step: '5', defaultValue: s.autoApproval.reversibleMinutes },
            ]}
            submitLabel="Save auto-approval"
          />
        </Card>
        <Card title="Privacy and visibility">
          <CapabilityForm
            capability="manageOrgSetup"
            fixed={{ op: 'updateSettings' }}
            fields={[
              { name: 'visibility', label: 'Who sees who is out', type: 'select', defaultValue: s.org.visibility, options: [{ value: 'org', label: 'Everyone in the org' }, { value: 'team', label: 'Own team only' }] },
              { name: 'showLeaveType', label: 'Show leave type to colleagues (never for health leave)', type: 'checkbox', defaultValue: s.org.showLeaveType },
              { name: 'sickNotesEnabled', label: 'Allow notes on sick leave (approver and admins only)', type: 'checkbox', defaultValue: s.org.sickNotesEnabled },
            ]}
            submitLabel="Save settings"
          />
        </Card>
        <Card title="AI features">
          <p className="mb-3 text-sm text-muted">
            Handbook import, requests in plain words, explanations, rule drafting and report summaries. When off, none of them call an AI model and
            every form still works. Numbers never come from AI either way. Changes are recorded in the audit log.
          </p>
          <CapabilityForm
            capability="manageOrgSetup"
            fixed={{ op: 'updateSettings' }}
            fields={[{ name: 'aiFeaturesEnabled', label: 'Use AI features in this workspace', type: 'checkbox', defaultValue: s.org.aiFeaturesEnabled }]}
            submitLabel="Save AI setting"
          />
        </Card>
      </div>
    </div>
  );
}
