import { ActionButton } from '@/components/ActionButton';
import { CapabilityForm } from '@/components/CapabilityForm';
import { Badge, Card, formatRange } from '@/components/ui';
import { call, requireActor } from '@/server/page';

const BAND_LABEL = { expired: 'Expired', '7': 'Within 7 days', '14': 'Within 14 days', '30': 'Within 30 days' } as const;

/** Credential expiry dashboard: what lapses soon, who holds what, and the forms to record it. */
export default async function CredentialsPage() {
  const actor = await requireActor();
  const c = await call('getCredentials', {}, actor);
  const members = await call('listMembers', {}, actor);
  const alerts = c.records.filter((r) => r.band);
  const bands = (['expired', '7', '14', '30'] as const).map((b) => ({ band: b, rows: alerts.filter((r) => r.band === b) }));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Expiring soon" actions={<Badge tone={alerts.length ? 'bad' : 'neutral'}>{alerts.length}</Badge>}>
        {alerts.length === 0 ? (
          <p className="text-sm text-muted">Nothing expires in the next 30 days.</p>
        ) : (
          <div className="space-y-3">
            {bands
              .filter((b) => b.rows.length)
              .map((b) => (
                <section key={b.band}>
                  <h3 className="text-sm font-semibold text-ink">
                    {BAND_LABEL[b.band]} <span className="font-normal text-muted">({b.rows.length})</span>
                  </h3>
                  <ul className="mt-1 space-y-1 text-sm">
                    {b.rows.map((r) => (
                      <li key={r.id} className={`rounded-md p-2 ${b.band === 'expired' ? 'border-2 border-ink font-medium' : b.band === '7' ? 'border border-dashed border-ink' : 'border border-line'}`}>
                        {r.memberName}: {r.name}, {b.band === 'expired' ? 'expired' : 'expires'} {formatRange(r.expiresOn!, r.expiresOn!)}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            <p className="text-xs text-muted">An expired credential stops counting toward ratios from its expiry date.</p>
          </div>
        )}
      </Card>

      <Card title="Record a credential">
        <CapabilityForm
          capability="manageCredentials"
          fixed={{ op: 'grant' }}
          fields={[
            { name: 'memberId', label: 'Person', type: 'select', options: members.members.map((m) => ({ value: m.id, label: m.name })) },
            { name: 'credentialKey', label: 'Credential', type: 'select', options: c.types.map((t) => ({ value: t.key, label: t.name })) },
            { name: 'issuedOn', label: 'Issued', type: 'date' },
            { name: 'expiresOn', label: 'Expires', type: 'date' },
            { name: 'evidenceRef', label: 'Where the certificate is kept', type: 'text', placeholder: 'Staff file, drawer 2' },
            { name: 'verified', label: 'I have seen the certificate', type: 'checkbox' },
          ]}
          submitLabel="Save credential"
        />
        <h3 className="mt-5 text-sm font-semibold text-ink">Credential types</h3>
        <p className="text-sm text-muted">{c.types.map((t) => t.name).join(', ') || 'None yet.'}</p>
        <div className="mt-2">
          <CapabilityForm
            capability="manageCredentials"
            fixed={{ op: 'define' }}
            fields={[
              { name: 'key', label: 'Key (lowercase)', type: 'text', required: true, placeholder: 'pediatric_cpr' },
              { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Pediatric CPR' },
              { name: 'needsExpiry', label: 'Has an expiry date', type: 'checkbox', defaultValue: true },
            ]}
            submitLabel="Add credential type"
          />
        </div>
      </Card>

      <Card title="Everyone’s credentials">
        {c.records.length === 0 ? (
          <p className="text-sm text-muted">None recorded yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className="py-1 font-medium">Person</th>
                <th className="py-1 font-medium">Credential</th>
                <th className="py-1 font-medium">Expires</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {c.records.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="py-1 text-ink">{r.memberName}</td>
                  <td className="py-1 text-ink">
                    {r.name} {!r.verified && <Badge tone="warn">not verified</Badge>}
                  </td>
                  <td className="py-1 tabular-nums text-ink">{r.expiresOn ?? 'no expiry'}</td>
                  <td className="py-1 text-right">
                    <ActionButton capability="manageCredentials" input={{ op: 'remove', memberCredentialId: r.id }} confirm={`Remove ${r.name} for ${r.memberName}?`}>
                      Remove
                    </ActionButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
