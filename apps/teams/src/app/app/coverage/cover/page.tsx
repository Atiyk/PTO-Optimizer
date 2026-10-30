import Link from 'next/link';
import { addDays } from '@daysoff/engine/solver/dateUtils';
import { ActionButton } from '@/components/ActionButton';
import { AskForCover } from '@/components/AskForCover';
import { ExplainCover } from '@/components/ExplainCover';
import { Badge, Card, formatRange } from '@/components/ui';
import { call, requireActor } from '@/server/page';

const isUuid = (v?: string) => !!v && /^[0-9a-f-]{36}$/i.test(v);
const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isTime = (v?: string) => !!v && /^\d{2}:\d{2}$/.test(v);

/**
 * Find cover for one window (who can legally take it, in fair order, and why others can't),
 * ask them, and follow every cover request for the week. All inputs live in the URL.
 */
export default async function CoverPage({ searchParams }: { searchParams: Promise<{ site?: string; room?: string; date?: string; start?: string; end?: string }> }) {
  const actor = await requireActor();
  if (actor.role === 'employee') return <p className="text-sm text-muted">Managers arrange cover. Your offers are in the staff app.</p>;
  const q = await searchParams;
  const setup = await call('getOrgSetup', {}, actor);
  const site = isUuid(q.site) ? q.site! : setup.locations[0]?.id;
  if (!site) return <p className="text-sm text-muted">Add a site first.</p>;
  const date = isDate(q.date) ? q.date! : new Date().toISOString().slice(0, 10);
  const target = isUuid(q.room) && isTime(q.start) && isTime(q.end) ? { locationId: site, roomId: q.room!, date, start: q.start!, end: q.end! } : null;
  let found = null;
  let error: string | null = null;
  if (target) {
    try {
      found = await call('findCover', target, actor);
    } catch (e) {
      error = (e as Error).message;
    }
  }
  const { requests } = await call('getCoverRequests', { locationId: site, from: date, to: addDays(date, 6) }, actor);
  const eligible = found?.candidates.filter((c) => c.eligible) ?? [];
  const excluded = found?.candidates.filter((c) => !c.eligible) ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <Link className="text-accent underline" href={`/app/coverage?${new URLSearchParams({ site, date }).toString()}`}>
          ← Coverage
        </Link>
      </p>
      {error && (
        <Card>
          <p className="text-sm text-ink">{error}</p>
        </Card>
      )}
      {found && target && (
        <>
          <h1 className="text-xl font-semibold text-ink">
            Cover for {found.window.roomName}, {formatRange(date, date)}, {found.window.start}–{found.window.end}
          </h1>
          {found.gap && (
            <p className="text-sm text-ink">
              {found.gap.label}: {found.gap.short} short{found.gap.citation ? ` (${found.gap.citation})` : ''}.
            </p>
          )}
          <ExplainCover target={target} />
          <Card title={`Can take it (${eligible.length})`} actions={<AskForCover target={target} eligible={eligible.length} />}>
            {eligible.length === 0 ? (
              <p className="text-sm text-muted">Nobody passes every rule for this window. See why below.</p>
            ) : (
              <ol className="space-y-2 text-sm">
                {eligible.map((c) => (
                  <li key={c.memberId} className="rounded-md border border-line p-2">
                    <span className="font-medium text-ink">
                      {c.rank}. {c.name?.untrusted_text}
                    </span>{' '}
                    {c.costBand === 'overtime' && <Badge tone="warn">overtime</Badge>}
                    <details className="mt-1">
                      <summary className="cursor-pointer text-muted">Why this order</summary>
                      <p className="mt-1 text-muted">
                        Fairness {c.scoreParts?.fairness ?? 0} · preference {c.scoreParts?.preference ?? 0} · cost {c.scoreParts?.cost ?? 0} · travel {c.scoreParts?.travel ?? 0}. Lower goes
                        first.
                      </p>
                      <ul className="mt-1 list-disc pl-5 text-muted">
                        {c.checks.map((x) => (
                          <li key={x.id}>
                            {x.detail}
                            {x.rule ? ` (${x.rule})` : ''}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </li>
                ))}
              </ol>
            )}
          </Card>
          {excluded.length > 0 && (
            <Card title={`Can’t take it (${excluded.length})`}>
              <ul className="space-y-1 text-sm">
                {excluded.map((c) => {
                  const failed = c.checks.find((x) => !x.passed);
                  return (
                    <li key={c.memberId} className="text-ink">
                      <span className="font-medium">{c.name?.untrusted_text}</span>: <span className="text-muted">{failed ? `${failed.detail}${failed.rule ? ` (${failed.rule})` : ''}` : c.excludedBy}</span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
          <p className="text-xs text-muted">{found.notice}</p>
        </>
      )}
      <Card title={`Cover requests, ${formatRange(date, addDays(date, 6))}`}>
        {requests.length === 0 ? (
          <p className="text-sm text-muted">None yet.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {requests.map((r) => (
              <li key={r.requestId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-ink">
                  {formatRange(r.date, r.date)} {r.start}–{r.end} · {r.roomName}
                  <span className="block text-muted">
                    {r.status === 'filled'
                      ? `Filled by ${r.filledBy?.untrusted_text ?? 'someone'}`
                      : r.status === 'cancelled'
                        ? 'Cancelled'
                        : `Asked ${r.offers.length}; ${r.offers.filter((o) => o.response === 'declined').length} can’t`}
                    {r.source === 'call_off' ? ' · from a call-off' : r.source === 'leave_request' ? ' · from approved leave' : ''}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <Badge tone={r.status === 'filled' ? 'accent' : r.status === 'open' ? 'warn' : 'neutral'}>{r.status}</Badge>
                  {r.status !== 'cancelled' && (
                    <ActionButton capability="requestCover" input={{ op: 'cancel', requestId: r.requestId }} confirm={r.status === 'filled' ? 'Cancel this cover and take the shift off their schedule?' : 'Stop asking for cover?'}>
                      Cancel
                    </ActionButton>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
