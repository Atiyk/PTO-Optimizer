import Link from 'next/link';
import { addDays } from '@daysoff/engine/solver/dateUtils';
import { ForecastControls } from '@/components/ForecastControls';
import { Badge, Card, formatRange, Stat } from '@/components/ui';
import { call, requireActor } from '@/server/page';

const isUuid = (v?: string) => !!v && /^[0-9a-f-]{36}$/i.test(v);
const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

const CAUSES = [
  ['schedule', 'Rota short', 'bg-ink'],
  ['credential', 'Credential expired', 'bg-page border border-ink'],
  ['approved', 'Approved leave', 'bg-accent'],
  ['pending', 'If pending is approved', 'bg-muted/40 border border-dashed border-ink'],
] as const;
// Stripes on the credential segment so it reads in greyscale too.
const stripes = { backgroundImage: 'repeating-linear-gradient(45deg, transparent 0 3px, rgba(15,23,42,.55) 3px 5px)' };
const md = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
const h = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} h`;

export default async function ForecastPage({ searchParams }: { searchParams: Promise<{ site?: string; from?: string; weeks?: string }> }) {
  const actor = await requireActor();
  const q = await searchParams;
  if (actor.role === 'employee') return <p className="text-sm text-muted">The forecast is for managers. <Link className="text-accent underline" href="/app/coverage">See this week&apos;s coverage</Link>.</p>;
  const setup = await call('getOrgSetup', {}, actor);
  const weeks = Math.min(12, Math.max(1, Number(q.weeks) || 8));
  const f = await call('getCoverageForecast', { locationId: isUuid(q.site) ? q.site : undefined, start: isDate(q.from) ? q.from : undefined, weeks }, actor);
  const end = addDays(f.start, weeks * 7 - 1);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Coverage forecast</h1>
        <p className="text-sm text-muted">Where the staffing rules will break in the coming weeks, and why, while there is still time to act.</p>
      </div>
      <Card>
        <ForecastControls sites={setup.locations.map((l) => ({ id: l.id, name: l.name }))} site={isUuid(q.site) ? q.site! : ''} start={f.start} weeks={weeks} />
      </Card>
      {f.sites.length === 0 && (
        <Card>
          <p className="text-sm text-ink">No site has staffing rules yet.</p>
          <p className="mt-1 text-sm"><Link className="text-accent underline" href="/app/admin/coverage">Choose a rule pack in Coverage setup</Link>.</p>
        </Card>
      )}
      {f.sites.map((s) => {
        const total = s.totals.schedule + s.totals.credential + s.totals.approved + s.totals.pending;
        const gapWeeks = s.weeks.filter((w) => w.gapDates.length > 0).length;
        const alerts = [...s.credentialAlerts].sort((a, b) => (a.firstGapDate ?? '9999').localeCompare(b.firstGapDate ?? '9999') || a.expiresOn.localeCompare(b.expiresOn));
        const max = Math.max(1, ...s.weeks.map((w) => w.hoursShort.schedule + w.hoursShort.credential + w.hoursShort.approved + w.hoursShort.pending));
        return (
          <section key={s.site.id} className="space-y-4" aria-labelledby={`site-${s.site.id}`}>
            <Card
              title={<span id={`site-${s.site.id}`}>{s.site.name}, {formatRange(f.start, end)}</span>}
              actions={<span className="shrink-0 whitespace-nowrap"><Badge tone={total ? 'bad' : 'neutral'}>{total ? `${h(total)} short` : 'in ratio'}</Badge></span>}
            >
              <div className="grid grid-cols-2 gap-4 border-b border-line pb-4 sm:grid-cols-4">
                <Stat label="Staff-hours short" value={h(total)} />
                <Stat label="Weeks with a gap" value={`${gapWeeks} of ${s.weeks.length}`} />
                <Stat label="Credentials leaving a gap" value={String(s.credentialAlerts.filter((a) => a.firstGapDate).length)} hint={`${s.credentialAlerts.length} expiring in all`} />
                <Stat label="Requests to move" value={String(s.staggers.length)} />
              </div>
              <p className="mt-3 text-sm text-muted">Staff-hours short of the staffing rules each week, by cause. One person missing for half an hour is 0.5 h.</p>
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink" aria-label="Legend">
                {CAUSES.map(([k, l, cls]) => (
                  <li key={k} className="flex items-center gap-1.5">
                    <span aria-hidden className={`inline-block h-3 w-4 rounded-sm ${cls}`} style={k === 'credential' ? stripes : undefined} />
                    {l}
                  </li>
                ))}
              </ul>
              <ol className="mt-3 space-y-2">
                {s.weeks.map((w) => {
                  const sum = w.hoursShort.schedule + w.hoursShort.credential + w.hoursShort.approved + w.hoursShort.pending;
                  const parts = CAUSES.filter(([k]) => w.hoursShort[k] > 0).map(([k, l]) => `${h(w.hoursShort[k])} ${l.toLowerCase()}`);
                  return (
                    <li key={w.weekStart} className={`grid gap-1 rounded-md p-2 sm:grid-cols-[8.5rem_1fr_minmax(0,18rem)] sm:items-center sm:gap-3 ${sum ? 'bg-gap-bg' : 'grid-cols-[1fr_auto] items-center py-1 sm:py-2'}`}>
                      <Link className="text-sm font-medium text-ink underline-offset-2 hover:underline" href={`/app/coverage?${new URLSearchParams({ site: s.site.id, date: w.weekStart }).toString()}`}>
                        {md(w.weekStart)} – {md(w.weekEnd)}
                      </Link>
                      <div className={`h-5 overflow-hidden rounded bg-surface-alt ${sum ? 'flex' : 'hidden sm:flex'}`} aria-hidden>
                        {CAUSES.map(([k, , cls]) =>
                          w.hoursShort[k] > 0 ? <span key={k} className={`h-full ${cls}`} style={{ width: `${(w.hoursShort[k] / max) * 100}%`, ...(k === 'credential' ? stripes : {}) }} /> : null,
                        )}
                      </div>
                      <span className="text-sm text-ink tabular-nums">
                        {sum === 0 ? (
                          <span className="text-muted">{w.regulatedDays ? 'no gaps' : 'no rules this week'}</span>
                        ) : (
                          <>
                            <span className="font-semibold text-gap-text">{h(sum)} short</span>
                            <span className="text-muted"> · {w.gapDates.length} day{w.gapDates.length === 1 ? '' : 's'}</span>
                            <span className="block text-xs text-muted">{parts.join(', ')}</span>
                          </>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </Card>

            <Card title="Credentials expiring">
              {s.credentialAlerts.length === 0 ? (
                <p className="text-sm text-muted">Nothing expires before {end}.</p>
              ) : (
                <ul className="divide-y divide-line text-sm">
                  {alerts.map((a) => (
                    <li key={`${a.memberId}|${a.credential}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span className="min-w-0">
                        <span className="font-medium text-ink">{a.name.untrusted_text}</span>
                        <span className="text-muted"> · {a.credentialName} · </span>
                        <span className="text-ink tabular-nums">{a.expiresOn < f.start ? `expired ${md(a.expiresOn)}` : `expires ${md(a.expiresOn)}`}</span>
                      </span>
                      {a.firstGapDate ? (
                        <Badge tone="bad">room short from {md(a.firstGapDate)} ({a.gapDays} day{a.gapDays === 1 ? '' : 's'})</Badge>
                      ) : (
                        <Badge tone="ok">no gap: others cover it</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-sm"><Link className="text-accent underline" href="/app/admin/credentials">Update credentials</Link></p>
            </Card>

            <Card title="Pending requests that open a gap">
              {s.staggers.length === 0 ? (
                <p className="text-sm text-muted">No pending request opens a gap at this site.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {s.staggers.map((x) => (
                    <li key={x.requestId} className={`rounded-md border border-line border-l-4 p-3 ${x.suggestion ? 'border-l-accent' : 'border-l-gap-line'}`}>
                      <p className="font-medium text-ink">
                        {x.suggestion ? (
                          <>
                            Move {x.name.untrusted_text}&apos;s {formatRange(x.start, x.end)} {Math.abs(x.suggestion.shiftDays)} day{Math.abs(x.suggestion.shiftDays) === 1 ? '' : 's'} {x.suggestion.shiftDays > 0 ? 'later' : 'earlier'}, to {formatRange(x.suggestion.start, x.suggestion.end)}: no gap.
                          </>
                        ) : (
                          <>Arrange cover before approving {x.name.untrusted_text}&apos;s {formatRange(x.start, x.end)}: no date within two weeks avoids a gap.</>
                        )}
                      </p>
                      <p className="mt-0.5 text-muted">
                        As asked: {x.firstGap.roomName ?? 'whole site'} {x.firstGap.start}–{x.firstGap.end} would be {x.firstGap.short} short ({x.firstGap.label}; {h(x.hoursAdded)} in all).
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-sm"><Link className="text-accent underline" href="/app/approvals">Review in approvals</Link></p>
            </Card>
          </section>
        );
      })}
      <p className="text-xs text-muted">{f.notice} The engine computes every number; suggestions are a starting point to discuss, and any changed request is checked again in full.</p>
    </div>
  );
}
