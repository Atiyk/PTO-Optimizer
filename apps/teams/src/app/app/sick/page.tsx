import { Badge, Card, fmt, Stat } from '@/components/ui';
import { call, requireActor } from '@/server/page';
import { MemberPicker } from '@/components/MemberPicker';

/** Hourly sick leave: balance, what is usable, the annual use cap and every ledger line explained. */
export default async function SickLeavePage({ searchParams }: { searchParams: Promise<{ member?: string }> }) {
  const actor = await requireActor();
  const q = await searchParams;
  const manager = actor.role !== 'employee';
  const memberId = manager && q.member && /^[0-9a-f-]{36}$/i.test(q.member) ? q.member : undefined;
  let s;
  try {
    s = await call('getSickLeave', { memberId }, actor);
  } catch (e) {
    return <p className="text-sm text-muted">{(e as Error).message}</p>;
  }
  const people = manager ? (await call('listMembers', {}, actor)).members.map((m) => ({ id: m.id, name: m.name })) : [];
  const u = s.unit;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-ink">Sick leave</h1>
      {manager && (
        <Card>
          <MemberPicker people={people} value={s.memberId} />
        </Card>
      )}
      {!s.hasPolicy ? (
        <Card>
          <p className="text-sm text-ink">No sick-leave policy applies here yet.</p>
        </Card>
      ) : (
        <>
          <Card title={s.policyName ?? 'Sick leave'}>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Balance" value={fmt(s.balance, u)} />
              <Stat label="Usable now" value={fmt(s.usable, u)} hint={s.lockedUntil ? `Usable from ${s.lockedUntil}` : undefined} />
              <Stat label="Used this year" value={fmt(s.useCap.usedThisYear, u)} hint={s.useCap.cap != null ? `Yearly use limit ${fmt(s.useCap.cap, u)}` : 'No yearly use limit'} />
              <Stat label="Left to use this year" value={s.useCap.remaining == null ? '—' : fmt(s.useCap.remaining, u)} />
            </div>
            {s.source && <p className="mt-3 text-xs text-muted">Source: {s.source}. {s.notice}</p>}
          </Card>
          <Card title="How it adds up">
            {s.entries.length === 0 ? (
              <p className="text-sm text-muted">No entries yet. Hours worked are imported by an admin.</p>
            ) : (
              <table className="w-full text-left text-sm tabular-nums">
                <thead className="text-muted">
                  <tr>
                    <th className="py-1 font-medium">Date</th>
                    <th className="py-1 font-medium">What</th>
                    <th className="py-1 text-right font-medium">Change</th>
                    <th className="py-1 text-right font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {s.entries.map((e, i) => (
                    <tr key={i} className="border-t border-line">
                      <td className="py-1 text-ink">{e.date}</td>
                      <td className="py-1 text-ink">
                        {e.note} {e.kind === 'forfeiture' && <Badge tone="warn">capped</Badge>}
                      </td>
                      <td className="py-1 text-right text-ink">{e.amount > 0 ? `+${fmt(e.amount)}` : fmt(e.amount)}</td>
                      <td className="py-1 text-right text-ink">{fmt(e.balanceAfter)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
