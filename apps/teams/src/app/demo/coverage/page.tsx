import type { Metadata } from 'next';
import Link from 'next/link';
import { CoverageHeatmap } from '@/components/CoverageHeatmap';
import { DemoCallOffRun, DemoRules } from '@/components/DemoCoverage';
import { PublicHeader } from '@/components/PublicHeader';
import { Badge, Card, formatRange } from '@/components/ui';
import { getDb } from '@/db/client';
import { invokeCapability } from '@/capabilities/registry';
import { demoCentre, DEMO_CENTRE, DEMO_REGULATION } from '@/demo/coverageDemo';
import { PRODUCT_NAME } from '@/lib/brand';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: `Coverage demo · ${PRODUCT_NAME}`, description: 'Staffing ratios, gaps and legal cover on a sample childcare centre.' };

export default async function CoverageDemo() {
  const db = await getDb();
  const now = new Date();
  const c = await demoCentre(db, now);
  const ctx = { db, actor: c.manager, now };
  const day = await invokeCapability('getCoverage', ctx, { date: c.monday, days: 1, detail: 'blocks' });
  const d = day.days[0]!;
  return (
    <>
      <PublicHeader />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-10">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Staffing rules you can see, and cover that follows them</h1>
          <p className="mt-2 text-muted">
            {DEMO_CENTRE.replace(' (sample)', '')} is made up: a California childcare centre with three rooms and 18 staff. Children appear only
            as counts per room. Everything below is the real product running on that sample. Nothing you do here is saved.
          </p>
        </div>

        <Card title="1. Paste a regulation, get rules with their sources">
          <p className="mb-3 text-sm text-muted">
            Each rule keeps the sentence it came from. A sentence that reads like an instruction, or a number the text doesn&apos;t say,
            is left out and becomes a question. The sample has an injected line telling AI to change the infant ratio; watch it do nothing.
          </p>
          <DemoRules sample={DEMO_REGULATION} />
        </Card>

        <Card title={`2. Coverage on ${formatRange(c.monday, c.monday)}`} actions={<Badge tone={d.gaps.length ? 'bad' : 'neutral'}>{d.gaps.length ? `${d.gaps.length} gap${d.gaps.length === 1 ? '' : 's'}` : 'in ratio'}</Badge>}>
          <p className="mb-3 text-sm text-muted">
            One toddler teacher is on approved leave. Twelve toddlers stay until 16:30 and the early shift leaves at 15:30, so for one hour the
            room is a teacher short. The engine computes every number; the rule and its source come from the California pack.
          </p>
          <ul className="mb-3 space-y-1 text-sm">
            {d.gaps.map((g, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium tabular-nums text-ink">{g.start}–{g.end}</span>
                <span className="text-ink">{g.roomName ?? 'Whole site'}: {g.present} of {g.required} staff, {g.short} short</span>
                <span className="text-muted">
                  {g.label}
                  {g.citation && <> · <a className="underline" href={g.citation.url} target="_blank" rel="noreferrer">{g.citation.regulation} {g.citation.section}</a> (read {g.citation.retrievedOn})</>}
                </span>
              </li>
            ))}
          </ul>
          {d.grid && <CoverageHeatmap rooms={day.rooms} grid={d.grid} date={c.monday} />}
        </Card>

        <Card title="3. A call-off, ranked cover, accepted cover">
          <p className="mb-3 text-sm text-muted">
            The other late toddler teacher calls in sick from the staff app. Cover is ranked by who may legally take it (on shift elsewhere,
            on leave, credentials, rest between shifts) and then by fairness, and offered in waves.
          </p>
          <DemoCallOffRun caller="Ava" />
        </Card>

        <p className="text-xs text-muted">{day.notice}</p>
        <p className="text-sm"><Link className="text-accent underline" href="/">Back to the overview</Link></p>
      </main>
    </>
  );
}
