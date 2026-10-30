import type { Metadata } from 'next';
import { PublicFooter } from '@/components/PublicFooter';
import { PublicHeader } from '@/components/PublicHeader';
import { Badge } from '@/components/ui';
import { PRODUCT_NAME } from '@/lib/brand';
import { CONFIG_LABELS, healthReport } from '@/server/health';

export const metadata: Metadata = { title: `Status · ${PRODUCT_NAME}` };
export const dynamic = 'force-dynamic';

const MODE: Record<string, [title: string, body: string]> = {
  postgres: ['Connected to the database', 'Workspaces are saved, and the schema is updated automatically on deploy.'],
  pglite: ['Local database', 'Running on a local in-process database (development or tests).'],
  'demo-only': ['Demo only: no database connected', 'The demo works, but nothing is kept and real sign-up is off. Add DATABASE_URL to keep workspaces.'],
};

/** Setup status for whoever runs this deployment. Shows which settings exist, never their values. */
export default async function Status() {
  const r = await healthReport();
  const [title, body] = MODE[r.mode]!;
  return (
    <>
      <PublicHeader />
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-12">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Status</h1>
        <section aria-labelledby="db-h" className={`rounded-xl border-l-8 p-5 ${r.ok ? 'border-ok-line bg-ok-bg' : 'border-gap-line bg-gap-bg'}`}>
          <h2 id="db-h" className="text-lg font-semibold text-ink">{title}</h2>
          <p className="mt-1 text-sm text-ink">{body}</p>
          <p className="mt-2 text-sm text-ink">
            Schema: {r.database.reachable ? `${r.database.migrationsApplied} of ${r.database.migrationsTotal} migrations applied${r.database.current ? ', up to date.' : '.'}` : `not reachable (${r.database.error}).`}
          </p>
        </section>
        <section aria-labelledby="cfg-h" className="rounded-xl border border-line bg-page p-5">
          <h2 id="cfg-h" className="text-lg font-semibold text-ink">Integrations</h2>
          <ul className="mt-3 divide-y divide-line">
            {Object.entries(CONFIG_LABELS).map(([key, [label, needed]]) => {
              const on = r.configured[key as keyof typeof r.configured];
              return (
                <li key={key} className="flex flex-wrap items-start justify-between gap-2 py-3 text-sm">
                  <div className="min-w-0 basis-64 grow">
                    <p className="font-medium text-ink">{label}</p>
                    {!on && <p className="text-muted">Needs {needed}</p>}
                  </div>
                  <Badge tone={on ? 'ok' : 'neutral'}>{on ? 'Set up' : 'Not set'}</Badge>
                </li>
              );
            })}
          </ul>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
