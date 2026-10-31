import Link from 'next/link';
import { addDays } from '@daysoff/engine/solver/dateUtils';
import { ActionButton } from '@/components/ActionButton';
import { AskForCover } from '@/components/AskForCover';
import { ExplainCover } from '@/components/ExplainCover';
import { Badge, Card, formatRange, StatusBanner } from '@/components/ui';
import type { CapabilityOutput } from '@/capabilities/registry';
import { call, requireActor } from '@/server/page';

const isUuid = (v?: string) => !!v && /^[0-9a-f-]{36}$/i.test(v);
const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isTime = (v?: string) => !!v && /^\d{2}:\d{2}$/.test(v);

type Candidate = CapabilityOutput<'findCover'>['candidates'][number];

/** Plain-words chips from the engine's score parts (no new numbers). */
function reasons(c: Candidate): { text: string; tone: 'ok' | 'warn' | 'neutral' }[] {
  const out: { text: string; tone: 'ok' | 'warn' | 'neutral' }[] = [];
  const p = c.scoreParts;
  out.push(p && p.fairness > 0 ? { text: 'Covered recently', tone: 'neutral' } : { text: 'No recent cover', tone: 'ok' });
  if (p && p.preference < 0) out.push({ text: 'Opted in', tone: 'ok' });
  out.push(
    c.costBand === 'overtime'
      ? { text: `Overtime +${Math.round((c.overtimeHours + c.doubleTimeHours) * 100) / 100} h`, tone: 'warn' }
      : { text: 'No overtime', tone: 'ok' },
  );
  if (p && p.travel > 0) out.push({ text: 'From another site', tone: 'neutral' });
  return out;
}

const EXCLUDED_GROUP: Record<string, string> = {
  active: 'Not active',
  site_allowed: 'Not set up for this site',
  opted_in: 'Opted out of cover',
  not_on_leave: 'On leave',
  available: 'Already working then',
  credential_valid: 'Missing or expired credential',
  min_rest: 'Rest rule',
  max_hours_day: 'Too many hours that day',
  max_hours_week: 'Too many hours that week',
  max_consecutive_days: 'Too many days in a row',
  overtime: 'Would go into overtime',
};

function groupExcluded(list: Candidate[]): [string, Candidate[]][] {
  const m = new Map<string, Candidate[]>();
  for (const c of list) {
    const k = EXCLUDED_GROUP[c.excludedBy ?? ''] ?? c.excludedBy ?? 'Other';
    m.set(k, [...(m.get(k) ?? []), c]);
  }
  return [...m];
}

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
          <div>
            <h1 className="text-2xl font-semibold text-ink">Cover for {found.window.roomName}</h1>
            <p className="text-sm text-muted">
              {formatRange(date, date)} · <span className="tabular-nums">{found.window.start}–{found.window.end}</span>
            </p>
          </div>
          {found.gap && (
            <StatusBanner tone="gap" title={`${found.gap.short} staff short`}>
              {found.gap.label}
              {found.gap.citation ? ` · ${found.gap.citation}` : ''}
            </StatusBanner>
          )}
          <section className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-ink">Can take it ({eligible.length})</h2>
                <p className="text-sm text-muted">
                  In fair order: whoever covered least lately goes first, then whoever opted in.{' '}
                  {found.overtimePolicy === 'avoid'
                    ? 'Anyone this would push into overtime goes last.'
                    : found.overtimePolicy === 'exclude'
                      ? 'Anyone this would push into overtime is left out.'
                      : 'Overtime is shown but does not change the order unless cost-aware ranking is on.'}{' '}
                  <Link className="underline" href="/app/admin/work-rules">Change</Link>
                </p>
              </div>
              <AskForCover target={target} eligible={eligible.length} />
            </div>
            {eligible.length === 0 ? (
              <Card>
                <p className="text-sm text-muted">Nobody passes every rule for this window. See why below.</p>
              </Card>
            ) : (
              <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {eligible.map((c) => (
                  <li key={c.memberId} className={`rounded-lg border bg-page p-3 text-sm ${c.rank! <= 3 ? 'border-2 border-accent' : 'border-line'}`}>
                    <div className="flex items-center gap-2">
                      <span aria-hidden className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${c.rank! <= 3 ? 'bg-accent text-white' : 'bg-surface-alt text-ink'}`}>
                        {c.rank}
                      </span>
                      <span className="min-w-0 truncate font-semibold text-ink">
                        <span className="sr-only">{c.rank}. </span>
                        {c.name?.untrusted_text}
                      </span>
                    </div>
                    <ul className="mt-2 flex flex-wrap gap-1" aria-label="Why here">
                      {reasons(c).map((r) => (
                        <li key={r.text}>
                          <Badge tone={r.tone}>{r.text}</Badge>
                        </li>
                      ))}
                    </ul>
                    {c.costBand === 'overtime' && <p className="mt-2 text-ink">{c.checks.find((x) => x.id === 'overtime')?.detail}</p>}
                    <details className="mt-2">
                      <summary className="cursor-pointer text-muted">Every rule checked</summary>
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
          </section>
          <ExplainCover target={target} />
          {excluded.length > 0 && (
            <Card title={`Can’t take it (${excluded.length})`}>
              <ul className="space-y-2 text-sm">
                {groupExcluded(excluded).map(([why, people]) => (
                  <li key={why}>
                    <details>
                      <summary className="cursor-pointer">
                        <span className="font-medium text-ink">{why}</span> <span className="text-muted">· {people.length}</span>
                      </summary>
                      <ul className="mt-1 space-y-0.5 pl-5">
                        {people.map((c) => {
                          const failed = c.checks.find((x) => !x.passed);
                          return (
                            <li key={c.memberId} className="text-ink">
                              <span className="font-medium">{c.name?.untrusted_text}</span>: <span className="text-muted">{failed ? `${failed.detail}${failed.rule ? ` (${failed.rule})` : ''}` : c.excludedBy}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </details>
                  </li>
                ))}
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
