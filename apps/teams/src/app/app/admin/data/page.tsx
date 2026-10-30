import { CapabilityForm } from '@/components/CapabilityForm';
import { ExportButtons } from '@/components/ExportButtons';
import { PrivacyActions } from '@/components/PrivacyActions';
import { Card } from '@/components/ui';
import { getOrg } from '@/domain/leave';
import { getDb } from '@/db/client';
import { call, requireActor } from '@/server/page';

export default async function DataPage() {
  const actor = await requireActor();
  const [{ members }, setup, { entries }] = await Promise.all([call('listMembers', {}, actor), call('getOrgSetup', {}, actor), call('getAuditLog', { limit: 50 }, actor)]);
  const name = new Map(members.map((m) => [m.id, m.name]));
  const org = await getOrg(await getDb(), actor.orgId);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Adjust a balance">
        <p className="mb-3 text-sm text-muted">Adds a row to the person’s ledger with your reason. History is never edited.</p>
        <CapabilityForm
          capability="adjustBalance"
          fields={[
            { name: 'memberId', label: 'Person', type: 'select', options: members.map((m) => ({ value: m.id, label: m.name })) },
            { name: 'leaveType', label: 'Leave type', type: 'select', options: setup.leaveTypes.filter((t) => t.countsAgainstBalance).map((t) => ({ value: t.key, label: t.name })) },
            { name: 'amount', label: 'Amount (+ adds, − removes)', type: 'number', step: 'any', required: true },
            { name: 'effectiveDate', label: 'Effective date', type: 'date', required: true, defaultValue: new Date().toISOString().slice(0, 10) },
            { name: 'reason', label: 'Reason (required)', type: 'text', required: true },
          ]}
          submitLabel="Add adjustment"
        />
      </Card>
      <Card title="Export">
        <p className="mb-3 text-sm text-muted">Everything: people, leave types, policies, requests, the ledger and the audit log.</p>
        <ExportButtons />
      </Card>
      <div className="lg:col-span-2">
        <Card title="One person’s data">
          <p className="mb-3 text-sm text-muted">
            For access and erasure requests. Erasing keeps their leave dates (your records) under &ldquo;Former member&rdquo; and removes everything that identifies them.
          </p>
          <PrivacyActions
            people={members.map((m) => ({ id: m.id, name: m.name, erasable: m.role !== 'owner' && m.id !== actor.memberId }))}
            orgName={org.name}
            isOwner={actor.role === 'owner'}
          />
        </Card>
      </div>
      <div className="lg:col-span-2">
        <Card title="Audit log (latest 50)">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted"><th className="p-1">When</th><th className="p-1">Who</th><th className="p-1">Via</th><th className="p-1">What</th><th className="p-1">Result</th></tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={i} className="border-t border-line align-top">
                    <td className="p-1 whitespace-nowrap text-muted">{e.at.slice(0, 16).replace('T', ' ')}</td>
                    <td className="p-1">{e.actorMemberId ? name.get(e.actorMemberId) ?? 'former member' : e.onBehalfOfMemberId ? `for ${name.get(e.onBehalfOfMemberId)}` : '—'}</td>
                    <td className="p-1">{e.actorType === 'human' ? 'web' : `${e.actorType}${e.clientId ? ` (${e.clientId})` : ''}`}</td>
                    <td className="p-1">{e.summary.untrusted_text}</td>
                    <td className="p-1">{e.outcome}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
