import { ActionButton } from './ActionButton';
import { CapabilityForm } from './CapabilityForm';
import { Badge, btnPrimary } from './ui';

type Change = { id: string; member: { name: { untrusted_text: string } }; field: string; oldValue: { untrusted_text: string } | null; newValue: { untrusted_text: string }; effectiveFrom: string | null; status: string };
const FIELD: Record<string, string> = { name: 'Name', email: 'Work email', location: 'Site' };

/** An approver's queue of record changes: one tap to approve or decline. */
export function ProfileChangeQueue({ changes }: { changes: Change[] }) {
  if (!changes.length) return <p className="text-sm text-muted">No record changes waiting.</p>;
  return (
    <ul className="divide-y divide-line">
      {changes.map((c) => (
        <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
          <span>
            <span className="font-medium text-ink">{c.member.name.untrusted_text}</span>: {FIELD[c.field]} {c.oldValue ? <>from &ldquo;{c.oldValue.untrusted_text}&rdquo; </> : null}to &ldquo;{c.newValue.untrusted_text}&rdquo;
            {c.effectiveFrom && <span className="text-muted"> from {c.effectiveFrom}</span>}
          </span>
          <span className="flex gap-2">
            <ActionButton capability="decideProfileChange" input={{ changeId: c.id, decision: 'approve' }} className={btnPrimary}>Approve</ActionButton>
            <ActionButton capability="decideProfileChange" input={{ changeId: c.id, decision: 'decline' }}>Decline</ActionButton>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** "Update my details": propose a change; it applies when your approver approves it. */
export function UpdateMyDetails({ mine, locations }: { mine: Change[]; locations: { id: string; name: string }[] }) {
  const pending = mine.filter((c) => c.status === 'pending');
  return (
    <div className="space-y-4">
      {pending.length > 0 && (
        <ul className="space-y-1 text-sm">
          {pending.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
              <span><Badge tone="warn">Waiting</Badge> {FIELD[c.field]} to &ldquo;{c.newValue.untrusted_text}&rdquo;</span>
              <ActionButton capability="requestProfileChange" input={{ op: 'cancel', changeId: c.id }}>Cancel</ActionButton>
            </li>
          ))}
        </ul>
      )}
      <CapabilityForm capability="requestProfileChange" fixed={{ op: 'create', field: 'name' }} submitLabel="Ask to change name" onDoneMessage="Sent to your approver." fields={[{ name: 'value', label: 'Name', type: 'text', required: true }]} />
      <CapabilityForm capability="requestProfileChange" fixed={{ op: 'create', field: 'email' }} submitLabel="Ask to change email" onDoneMessage="Sent to your approver." fields={[{ name: 'value', label: 'Work email', type: 'text', required: true, placeholder: 'you@company.com' }]} />
      {locations.length > 1 && (
        <CapabilityForm
          capability="requestProfileChange"
          fixed={{ op: 'create', field: 'location' }}
          submitLabel="Ask to move site"
          onDoneMessage="Sent to your approver."
          fields={[
            { name: 'value', label: 'New site', type: 'select', options: locations.map((l) => ({ value: l.id, label: l.name })) },
            { name: 'effectiveFrom', label: 'From', type: 'date', required: true },
          ]}
        />
      )}
    </div>
  );
}
