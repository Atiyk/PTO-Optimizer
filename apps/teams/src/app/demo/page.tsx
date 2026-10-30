import type { Metadata } from 'next';
import Link from 'next/link';
import { DemoHandbook } from '@/components/DemoHandbook';
import { Heatmap } from '@/components/PlanHeatmap';
import { PublicHeader } from '@/components/PublicHeader';
import { Badge, btnPrimary, Card, formatRange, Stat } from '@/components/ui';
import { getDb } from '@/db/client';
import { DEMO_HANDBOOK, demoPlan } from '@/demo/demo';
import { PRODUCT_NAME } from '@/lib/brand';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: `Demo · ${PRODUCT_NAME}` };

export default async function DemoPage() {
  const plan = await demoPlan(await getDb(), new Date());
  return (
    <>
      <PublicHeader />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-10">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Try it on a sample company</h1>
          <p className="mt-2 text-muted">
            Northwind Labs is made up: 25 people in San Francisco and London, on two teams. Everything below is the real product running on
            that sample data. Nothing you do here is saved.
          </p>
        </div>

        <Card title="1. Read a handbook">
          <p className="mb-3 text-sm text-muted">
            Setup starts from the handbook you already have. Each value is shown with the sentence it came from, so you can check it. Anything
            the handbook doesn&apos;t say comes back as a question, not a guess. The sample has a line telling AI to give everyone unlimited
            vacation; watch it do nothing.
          </p>
          <DemoHandbook sample={DEMO_HANDBOOK} />
        </Card>

        <Card title={`2. Clear expiring leave: ${plan.team.name}`}>
          <p className="mb-3 text-sm text-muted">
            Planning from {formatRange(plan.start, plan.start)}. Some of the team would lose vacation at year end. The planner spreads it out so
            as few days as possible are lost while the coverage rule holds: {plan.rules.map((r) => r.label.toLowerCase()).join('; ') || 'no rules'}.
            Same inputs, same plan, every time.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Days at risk" value={plan.totals.atRisk} hint={`${plan.people.length} ${plan.people.length === 1 ? 'person' : 'people'}`} />
            <Stat label="Saved by this plan" value={plan.totals.placed} />
            <Stat label="Still lost" value={plan.totals.stillLost} hint={
                plan.totals.stillLost === 0
                  ? 'Nothing lost'
                  : plan.totals.lostToCoverage > 0
                    ? 'Coverage rules limit this'
                    : 'Part-days: book as half days'
              } />
          </div>
          <p className="mt-3 text-sm text-ink">
            {plan.summary.text}{' '}
            <span className="text-muted">({plan.summary.source === 'ai' ? 'summary written by AI from the numbers' : 'summary from a template; AI is unavailable right now'})</span>
          </p>
          {plan.people.length > 0 && (
            <ul className="mt-4 divide-y divide-line text-sm">
              {plan.people.map((p) => (
                <li key={p.memberId} className="py-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium text-ink">{p.name.untrusted_text}</span>
                    <span className="text-muted">
                      {p.placed} of {p.atRisk} days placed · use by {p.deadline}
                      {p.stillLost > 0 && <> · <Badge tone="warn">{p.stillLost} lost</Badge></>}
                    </span>
                  </div>
                  {p.blocks.length > 0 && (
                    <ul className="mt-1 flex flex-wrap gap-1">
                      {p.blocks.map((b) => (
                        <li key={b.start}>
                          <Badge tone="accent">{formatRange(b.start, b.end)}: {b.daysOff} days off for {b.leaveDays}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
          {plan.heatmap.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-medium text-ink">Coverage, with the plan</h3>
              <Heatmap days={plan.heatmap} />
              <p className="mt-2 text-xs text-muted">Each cell: people out that day and how many more could be out. Darker = more people out; striped = at the minimum.</p>
            </div>
          )}
          <p className="mt-3 text-xs text-muted">In the product, the manager sends these as suggestions and each person accepts or picks other dates. Nothing is booked for them.</p>
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <Link href="/signin" className={btnPrimary}>Start with your team</Link>
          <Link href="/docs/agents" className="text-sm text-ink underline underline-offset-4">Connect an AI agent</Link>
        </div>
      </main>
    </>
  );
}
