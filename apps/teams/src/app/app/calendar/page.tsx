import Link from 'next/link';
import { addDays, mondayIndexedDow, rangeISO } from '@daysoff/engine/solver/dateUtils';
import { Badge, Card, formatRange } from '@/components/ui';
import { call, requireActor } from '@/server/page';

const RANGES = { week: 7, month: 35 } as const;

function mondayOf(iso: string): string {
  return addDays(iso, -mondayIndexedDow(iso));
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ team?: string; range?: string; from?: string }> }) {
  const actor = await requireActor();
  const sp = await searchParams;
  const range = sp.range === 'week' ? 'week' : 'month';
  const today = new Date().toISOString().slice(0, 10);
  const from = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? mondayOf(sp.from) : mondayOf(today);
  const to = addDays(from, RANGES[range] - 1);
  const setup = await call('getOrgSetup', {}, actor);
  const teamId = setup.teams.some((t) => t.id === sp.team) ? sp.team : undefined;
  const [{ teams }, { locations }] = await Promise.all([
    call('whoIsOut', { from, to, teamId, includePending: true }, actor),
    call('listHolidays', { from, to }, actor),
  ]);
  const days = rangeISO(from, to);
  const qs = (o: Record<string, string | undefined>) =>
    '?' + new URLSearchParams(Object.entries({ team: teamId, range, from, ...o }).filter((e): e is [string, string] => !!e[1])).toString();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link className="rounded border border-line bg-page px-2 py-1" href={qs({ from: addDays(from, -RANGES[range]) })} aria-label="Earlier">←</Link>
        <span className="font-medium text-ink">{formatRange(from, to)}</span>
        <Link className="rounded border border-line bg-page px-2 py-1" href={qs({ from: addDays(from, RANGES[range]) })} aria-label="Later">→</Link>
        <span aria-hidden="true" className="mx-2 hidden text-muted sm:inline">|</span>
        {(['week', 'month'] as const).map((r) => (
          <Link key={r} href={qs({ range: r })} aria-current={r === range ? 'page' : undefined} className={`rounded px-2 py-1 ${r === range ? 'bg-accent text-white' : 'border border-line bg-page'}`}>
            {r === 'week' ? 'Week' : '5 weeks'}
          </Link>
        ))}
        <span aria-hidden="true" className="mx-2 hidden text-muted sm:inline">|</span>
        <Link href={qs({ team: undefined })} className={`rounded px-2 py-1 ${!teamId ? 'bg-accent text-white' : 'border border-line bg-page'}`}>All teams</Link>
        {setup.teams.map((t) => (
          <Link key={t.id} href={qs({ team: t.id })} className={`rounded px-2 py-1 ${teamId === t.id ? 'bg-accent text-white' : 'border border-line bg-page'}`}>{t.name}</Link>
        ))}
      </div>

      <Card title="Who’s out">
        {teams.length === 0 ? (
          <p className="text-sm text-muted">Nobody is out in this period.</p>
        ) : (
          <div className="space-y-4">
            {teams.map((g) => (
              <div key={g.teamId ?? 'none'}>
                <h3 className="text-sm font-semibold text-ink">{g.teamName.untrusted_text}</h3>
                <ul className="mt-1 divide-y divide-line">
                  {g.out.map((o, i) => (
                    <li key={`${o.memberId}-${i}`} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm">
                      <span className="text-ink">{o.name.untrusted_text}</span>
                      <span className="flex items-center gap-2 text-muted">
                        {formatRange(o.start, o.end)}
                        {o.part !== 'full' && <span>· {o.part === 'hours' ? 'hours' : 'half day'}</span>}
                        {o.leaveType && <span>· {o.leaveType}</span>}
                        {o.status === 'pending' && <Badge tone="warn">pending</Badge>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Days">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed border-collapse text-xs">
            <caption className="sr-only">People out per day</caption>
            <thead>
              <tr className="text-muted">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                  <th key={d} scope="col" className="p-1 text-left font-medium">
                    <span aria-hidden="true" className="sm:hidden">{d[0]}</span>
                    <span className="max-sm:sr-only">{d}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: days.length / 7 }, (_, w) => (
                <tr key={w}>
                  {days.slice(w * 7, w * 7 + 7).map((d) => {
                    const out = teams.flatMap((g) => g.out.filter((o) => o.start <= d && o.end >= d));
                    const hols = locations.flatMap((l) => l.holidays.filter((h) => h.date === d).map((h) => `${h.name} (${l.countryCode})`));
                    const weekend = mondayIndexedDow(d) >= 5;
                    return (
                      <td key={d} className={`h-16 border border-line p-1 align-top ${weekend ? 'bg-surface-alt' : 'bg-page'} ${d === today ? 'outline-2 outline-accent' : ''}`}>
                        <div className="text-muted">{Number(d.slice(8))}</div>
                        {hols.map((h) => (
                          <div key={h} className="truncate italic text-ink" title={h}>
                            ◆<span className="max-sm:sr-only"> {h}</span>
                          </div>
                        ))}
                        {out.length > 0 && (
                          <div className="font-semibold text-ink">
                            {out.length}
                            <span className="max-sm:sr-only"> out</span>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">◆ public holiday or closure. Reasons are never shown.</p>
      </Card>
    </div>
  );
}
