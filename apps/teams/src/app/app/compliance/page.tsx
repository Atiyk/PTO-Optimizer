import Link from 'next/link';
import { addDays } from '@daysoff/engine/solver/dateUtils';
import { Badge, btnSecondary, Card, input, label, StatusBanner } from '@/components/ui';
import { call, requireActor } from '@/server/page';

const GROUPS: { severity: 'action' | 'warning' | 'info'; title: string; blurb: string }[] = [
  { severity: 'action', title: 'Needs you', blurb: 'Fix these first: they block payroll or approvals.' },
  { severity: 'warning', title: 'Check', blurb: 'Possible rule issues the clock and the schedule picked up.' },
  { severity: 'info', title: 'Heads-up', blurb: 'Coming up this week.' },
];

/**
 * The compliance inbox: admin work the engine has already found (missed clock-outs, break
 * issues, overtime, approvals, expiring credentials). Each item links to where it is fixed.
 */
export default async function CompliancePage() {
  const actor = await requireActor();
  if (actor.role === 'employee') return <p className="text-sm text-muted">The compliance inbox is for managers and admins.</p>;
  const out = await call('getComplianceTasks', {}, actor);
  const total = out.items.length;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Compliance inbox</h1>
        <p className="text-sm text-muted">What the time clock, schedule and leave rules found this week and last. Nothing to file by hand: each item links to the fix.</p>
      </div>
      {out.counts.action > 0 ? (
        <StatusBanner tone="gap" title={`${out.counts.action} ${out.counts.action === 1 ? 'item needs' : 'items need'} you`}>
          {out.counts.warning} to check, {out.counts.info} heads-up.
        </StatusBanner>
      ) : (
        <StatusBanner tone="ok" title={total ? 'Nothing blocking' : 'All clear'}>{total ? `${out.counts.warning} to check, ${out.counts.info} heads-up.` : 'No missed punches, break issues, overtime or approvals waiting.'}</StatusBanner>
      )}
      {GROUPS.map((g) => {
        const items = out.items.filter((i) => i.severity === g.severity);
        if (!items.length) return null;
        return (
          <Card key={g.severity} title={`${g.title} (${items.length})`}>
            <p className="-mt-2 mb-3 text-sm text-muted">{g.blurb}</p>
            <ul className="divide-y divide-line">
              {items.map((i) => (
                <li key={i.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">
                      {i.title}
                      {i.who && <span className="font-normal text-ink"> · {i.who.untrusted_text}</span>}
                    </p>
                    <p className="text-sm text-ink">{i.detail}</p>
                    {i.rule && <p className="mt-0.5 text-xs text-muted">Rule: {i.rule}</p>}
                  </div>
                  <span className="flex shrink-0 items-center gap-2">
                    <Badge tone={g.severity === 'action' ? 'bad' : g.severity === 'warning' ? 'warn' : 'neutral'}>{g.severity === 'action' ? 'Action' : g.severity === 'warning' ? 'Check' : 'FYI'}</Badge>
                    <Link href={i.href} prefetch={false} className="text-sm font-medium text-accent underline">
                      Open<span className="sr-only">: {i.title}</span>
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
      {(actor.role === 'owner' || actor.role === 'admin') && <InspectorExport />}
      <p className="text-xs text-muted">{out.notice}</p>
    </div>
  );
}

/**
 * The inspector export (getInspectorReport): ratio checks per room and day with their citations,
 * gap windows and the audit entries, as CSV. A plain GET form; the download is audited.
 */
async function InspectorExport() {
  const setup = await call('getOrgSetup', {}, await requireActor());
  if (!setup.locations.length) return null;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Card title="Inspector export">
      <p className="-mt-2 mb-3 text-sm text-muted">
        For a licensing visit: each room&rsquo;s ratio checks per day, the rule behind each one with its source, every gap, and the audit log for those days. Up to 31 days. Not legal advice.
      </p>
      <form method="get" action="/api/reports/inspector" className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <div>
          <label htmlFor="ie-site" className={label}>Site</label>
          <select id="ie-site" name="location" className={`${input} mt-1`} defaultValue={setup.locations[0]!.id}>
            {setup.locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ie-from" className={label}>From</label>
          <input id="ie-from" name="from" type="date" required defaultValue={addDays(today, -6)} className={`${input} mt-1`} />
        </div>
        <div>
          <label htmlFor="ie-to" className={label}>To</label>
          <input id="ie-to" name="to" type="date" required defaultValue={today} className={`${input} mt-1`} />
        </div>
        <div className="flex flex-wrap gap-2 sm:col-span-3">
          <button type="submit" name="file" value="ratio-checks" className={btnSecondary}>Ratio checks (CSV)</button>
          <button type="submit" name="file" value="gaps" className={btnSecondary}>Gaps (CSV)</button>
          <button type="submit" name="file" value="audit" className={btnSecondary}>Audit entries (CSV)</button>
        </div>
      </form>
    </Card>
  );
}
