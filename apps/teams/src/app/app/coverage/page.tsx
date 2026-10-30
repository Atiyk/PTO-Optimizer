import Link from 'next/link';
import { addDays } from '@daysoff/engine/solver/dateUtils';
import { CoverageControls } from '@/components/CoverageControls';
import { CoverageHeatmap } from '@/components/CoverageHeatmap';
import { Badge, Card, formatRange } from '@/components/ui';
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

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-ink">Coverage · {week.site.name}</h1>
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
          <Card title={`Gaps, ${formatRange(start, addDays(start, 6))}`} actions={
              <span className="shrink-0 whitespace-nowrap">
                <Badge tone={gapCount ? 'bad' : 'neutral'}>{gapCount ? `${gapCount} gap${gapCount === 1 ? '' : 's'}` : 'in ratio'}</Badge>
              </span>
            }>
            <ol className="space-y-1 text-sm">
              {week.days.map((d) => (
                <li key={d.date} className="rounded-md border border-line p-2">
                  <Link href={link(d.date)} className={`font-medium underline-offset-2 hover:underline ${d.date === day ? 'text-accent' : 'text-ink'}`} aria-current={d.date === day ? 'date' : undefined}>
                    {formatRange(d.date, d.date)}
                  </Link>
                  {d.gaps.length === 0 ? (
                    <span className="ml-2 text-muted">{!d.regulated ? 'no rules on this date' : d.open ? 'no gaps' : 'closed'}</span>
                  ) : (
                    <ul className="mt-1 space-y-1">
                      {d.gaps.map((g, i) => (
                        <li key={i} className="flex flex-wrap items-baseline gap-x-2">
                          <span className="font-medium text-ink tabular-nums">{g.start}–{g.end}</span>
                          <span className="text-ink">{g.roomName ?? 'Whole site'}:</span>
                          <span className="text-ink">
                            {g.kind === 'group_size' ? `group too large (${g.present} > ${g.required})` : `${g.present} of ${g.required} staff, ${g.short} short`}
                          </span>
                          <span className="text-muted">
                            {g.label}
                            {g.citation ? (
                              <>
                                {' · '}
                                <a className="underline" href={g.citation.url} target="_blank" rel="noreferrer">{g.citation.regulation} {g.citation.section}</a>
                              </>
                            ) : g.basis === 'org_policy' ? ' · your policy' : ''}
                          </span>
                          {g.needsVerification && <Badge tone="warn">needs verification</Badge>}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          </Card>
          <Card title={`By room, ${formatRange(day, day)}`}>
            {grid ? <CoverageHeatmap rooms={detail.rooms} grid={grid} date={day} /> : <p className="text-sm text-muted">No rules on this date.</p>}
          </Card>
          <p className="text-xs text-muted">
            Rule packs: {week.packs.map((p) => `${p.name} (v${p.version})`).join(', ')}. {week.notice}
          </p>
        </>
      )}
    </div>
  );
}
