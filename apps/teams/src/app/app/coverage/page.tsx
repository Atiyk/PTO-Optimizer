import Link from 'next/link';
import { addDays } from '@daysoff/engine/solver/dateUtils';
import { CoverageControls } from '@/components/CoverageControls';
import { CoverageHeatmap } from '@/components/CoverageHeatmap';
import { Badge, btnPrimary, btnSecondary, Card, formatRange, StatusBanner } from '@/components/ui';
import { call, requireActor } from '@/server/page';

const isUuid = (v?: string) => !!v && /^[0-9a-f-]{36}$/i.test(v);
const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

export default async function CoveragePage({ searchParams }: { searchParams: Promise<{ site?: string; date?: string; day?: string; likely?: string }> }) {
  const actor = await requireActor();
  const q = await searchParams;
  const staff = actor.role === 'employee';
  const setup = await call('getOrgSetup', {}, actor);
  const sites = staff ? [] : setup.locations.map((l) => ({ id: l.id, name: l.name }));
  const today = new Date().toISOString().slice(0, 10);
  const start = isDate(q.date) ? q.date! : today;
  const likely = q.likely === '1';
  let week;
  try {
    week = await call('getCoverage', { locationId: !staff && isUuid(q.site) ? q.site : undefined, date: start, days: 7, includePending: likely }, actor);
  } catch (e) {
    return <p className="text-sm text-muted">{(e as Error).message}</p>;
  }
  const day = isDate(q.day) && q.day! >= start && q.day! <= addDays(start, 6) ? q.day! : start;
  const detail = await call('getCoverage', { locationId: week.site.id, date: day, days: 1, includePending: likely, detail: 'blocks' }, actor);
  const grid = detail.days[0]?.grid ?? null;
  const link = (d: string) => `?${new URLSearchParams({ ...(q.site ? { site: q.site } : {}), date: start, day: d, ...(likely ? { likely: '1' } : {}) }).toString()}`;
  const gapCount = week.days.reduce((n, d) => n + d.gaps.filter((g) => g.kind !== 'group_size').length, 0);

  const findCover = (date: string, g: { roomId: string | null; start: string; end: string }) =>
    `/app/coverage/cover?${new URLSearchParams({ site: week.site.id, room: g.roomId!, date, start: g.start, end: g.end }).toString()}`;
  const gapDays = week.days.filter((d) => d.gaps.length > 0);
  const first = gapDays[0] ? { date: gapDays[0].date, gap: gapDays[0].gaps.find((g) => g.kind !== 'group_size') ?? gapDays[0].gaps[0]! } : null;
  const short = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short' });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Coverage</h1>
        <p className="text-sm text-muted">{week.site.name} · staff against the staffing rules, per room and half hour</p>
      </div>
      <Card>
        <CoverageControls sites={sites} site={week.site.id} date={start} likely={likely} />
      </Card>

      {!week.regulated ? (
        <Card>
          <p className="text-sm text-ink">This site has no staffing rules yet, so only the simpler team minimums apply.</p>
          {!staff && <p className="mt-1 text-sm"><Link className="text-accent underline" href="/app/admin/coverage">Choose its rule pack in Coverage setup</Link>.</p>}
        </Card>
      ) : (
        <>
          {gapCount > 0 && first ? (
            <StatusBanner
              tone="gap"
              title={`${gapCount} gap${gapCount === 1 ? '' : 's'} this week`}
              action={
                !staff && first.gap.roomId && first.gap.kind !== 'group_size' ? (
                  <Link className={btnPrimary} href={findCover(first.date, first.gap)}>
                    Find cover for the first gap
                  </Link>
                ) : undefined
              }
            >
              Next: <span className="font-semibold">{formatRange(first.date, first.date)}, {first.gap.start}–{first.gap.end}</span>, {first.gap.roomName ?? 'whole site'}
              {first.gap.kind === 'group_size' ? ', group too large' : `, ${first.gap.short} staff short`}.
            </StatusBanner>
          ) : (
            <StatusBanner tone="ok" title="Every room is in ratio this week">
              {likely ? 'Counting pending leave as out, too.' : 'Approved leave is counted. Tick “Count pending leave as out” to see what pending requests would do.'}
            </StatusBanner>
          )}

          <nav aria-label="Days this week">
            <ol className="grid grid-cols-7 gap-1 sm:gap-2">
              {week.days.map((d) => {
                const n = d.gaps.length;
                const sel = d.date === day;
                return (
                  <li key={d.date}>
                    <Link
                      href={link(d.date)}
                      aria-current={sel ? 'date' : undefined}
                      className={`block rounded-lg border px-1 py-2 text-center sm:px-2 ${sel ? 'border-2 border-accent bg-page' : 'border-line bg-page hover:bg-surface-alt'} ${n ? 'border-b-4 border-b-gap-line' : ''}`}
                    >
                      <span className="block text-xs font-medium text-muted">{short(d.date)}</span>
                      <span className="block text-sm font-semibold text-ink tabular-nums">{Number(d.date.slice(8))}</span>
                      <span className={`mt-0.5 block truncate text-[11px] ${n ? 'font-semibold text-gap-text' : 'text-muted'}`}>
                        {n ? (
                          `${n} gap${n === 1 ? '' : 's'}`
                        ) : !d.regulated ? (
                          'no rules'
                        ) : d.open ? (
                          <>
                            <span className="hidden sm:inline">no gaps</span>
                            <span className="sm:hidden" aria-hidden>
                              ✓
                            </span>
                            <span className="sr-only sm:hidden">in ratio</span>
                          </>
                        ) : (
                          'closed'
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </nav>

          {gapDays.length > 0 && (
            <Card title={`Gaps, ${formatRange(start, addDays(start, 6))}`}>
              <ul className="space-y-2 text-sm">
                {gapDays.flatMap((d) =>
                  d.gaps.map((g, i) => (
                    <li key={`${d.date}-${i}`} className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-line border-l-4 border-l-gap-line bg-page p-3 sm:flex-nowrap">
                      <div className="min-w-0 flex-1 basis-56 space-y-0.5">
                        <p className="font-semibold text-ink">
                          {formatRange(d.date, d.date)} · <span className="tabular-nums">{g.start}–{g.end}</span> · {g.roomName ?? 'Whole site'}
                        </p>
                        <p className="text-gap-text">
                          {g.kind === 'group_size' ? `Group too large: ${g.present} children, limit ${g.required}` : `${g.present} of ${g.required} staff · ${g.short} short`}
                        </p>
                        <p className="text-muted">
                          {g.label}
                          {g.citation ? (
                            <>
                              {' · '}
                              <a className="underline" href={g.citation.url} target="_blank" rel="noreferrer">{g.citation.regulation} {g.citation.section}</a>
                            </>
                          ) : g.basis === 'org_policy' ? ' · your policy' : ''}{' '}
                          {g.needsVerification && <Badge tone="warn">needs verification</Badge>}
                        </p>
                      </div>
                      {!staff && g.roomId && g.kind !== 'group_size' && (
                        <Link className={`${btnSecondary} shrink-0`} href={findCover(d.date, g)}>
                          Find cover
                        </Link>
                      )}
                    </li>
                  )),
                )}
              </ul>
            </Card>
          )}

          <Card title={`By room, ${formatRange(day, day)}`}>
            {grid ? <CoverageHeatmap rooms={detail.rooms} grid={grid} date={day} /> : <p className="text-sm text-muted">No rules on this date.</p>}
          </Card>
          {!staff && (
            <div className="flex flex-wrap gap-2">
              <Link className={btnSecondary} href={`/app/coverage/cover?${new URLSearchParams({ site: week.site.id, date: start }).toString()}`}>
                Cover requests this week
              </Link>
              <Link className={btnSecondary} href={`/app/coverage/forecast?${new URLSearchParams({ site: week.site.id }).toString()}`}>
                Forecast, next 8 weeks
              </Link>
            </div>
          )}
          <p className="text-xs text-muted">
            Rule packs: {week.packs.map((p) => `${p.name} (v${p.version})`).join(', ')}. {week.notice}
          </p>
        </>
      )}
    </div>
  );
}
