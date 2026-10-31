import type { CapabilityOutput } from '@/capabilities/registry';
import { Badge } from './ui';

type Item = CapabilityOutput<'listPendingApprovals'>['requests'][number];

const REC = {
  approve: { tone: 'ok', text: 'Every check passes' },
  look: { tone: 'warn', text: 'Worth a look' },
  likely_decline: { tone: 'bad', text: 'Usually a no' },
} as const;
const OT = { no_overtime: 'Cover likely without overtime', overtime: 'Cover would mean overtime for someone', no_cover: 'Nobody eligible to cover' } as const;
const MARK = { pass: '✓', warn: '!', fail: '✕' } as const;
const MARK_LABEL = { pass: 'Passes', warn: 'Heads-up', fail: 'Blocks' } as const;

/** The approver's single view of every check: same facts on the web and the phone. The approver decides. */
export function DecisionChecks({ r, compact = false }: { r: Item; compact?: boolean }) {
  const d = r.decision;
  const rec = d.recommendation ? REC[d.recommendation] : null;
  const shown = compact ? d.checklist.filter((c) => c.status !== 'pass') : d.checklist;
  return (
    <div className="mt-2 space-y-2 text-sm">
      <p className="flex flex-wrap items-center gap-2">
        {rec && <Badge tone={rec.tone}>{rec.text}</Badge>}
        {r.autoApproval?.eligible && <span className="text-muted">Meets the auto-approval rules ({d.policy.name}).</span>}
        {r.waiting.urgent && <Badge tone="bad">Starts soon</Badge>}
        {r.waiting.overdue && <Badge tone="warn">Waiting {r.waiting.hours} h</Badge>}
        {r.waiting.escalationLevel > 0 && <Badge>Escalated</Badge>}
        {r.waiting.review && <Badge>Review asked</Badge>}
        {r.requestWindow && <Badge tone="warn">In {r.requestWindow}: decide with the allocation</Badge>}
      </p>
      <ul className="space-y-1" aria-label="Checks">
        {shown.map((c, i) => (
          <li key={`${c.kind}-${i}`} className="flex gap-2">
            <span aria-hidden="true" className={`w-4 shrink-0 text-center font-semibold ${c.status === 'pass' ? 'text-ok-text' : 'text-ink'}`}>{MARK[c.status]}</span>
            <span className={c.status === 'pass' ? 'text-muted' : 'text-ink'}>
              <span className="sr-only">{MARK_LABEL[c.status]}: </span>
              {c.message}
            </span>
          </li>
        ))}
        {d.overtimeBand && (
          <li className="flex gap-2">
            <span aria-hidden="true" className="w-4 shrink-0 text-center font-semibold">{d.overtimeBand === 'no_overtime' ? '✓' : '!'}</span>
            <span>{OT[d.overtimeBand]}</span>
          </li>
        )}
      </ul>
      {r.changedSinceSubmit.length > 0 && (
        <p className="text-ink">
          <Badge tone="warn">Changed since submitted</Badge> {r.changedSinceSubmit.join(' ')}
        </p>
      )}
    </div>
  );
}
