import { SiteHeader } from './SiteHeader';
import { Footer } from './Footer';
import { Container } from './Container';
import dataSources from '../../public/data-sources.json';
import holidayCoverage from '@daysoff/engine/data/holidayCoverage.json';

interface Source {
  id: string;
  name: string;
  url: string;
  description: string;
  coverage: string;
  accessPattern: string;
  license: string;
}

/**
 * Phase 6B: a readable page built from the same data-sources.json this site already
 * publishes machine-readably (linked from /docs and llms.txt) - never a second, separately
 * maintained description of where the data comes from. The country count and "as of" date
 * are the real, build-time-verified figures from packages/engine/src/data/holidayCoverage.json (the same
 * file the landing page's "<N> countries" chip reads), not a hand-typed guess.
 */
export function DataSources() {
  const sources = dataSources.sources as Source[];
  return (
    <div className="min-h-screen bg-page">
      <SiteHeader active="other" />
      <main id="main-content" tabIndex={-1}>
        <Container className="flex flex-col gap-8 px-4 py-10">
          <section>
            <h1 className="m-0 text-3xl font-bold text-slate-900">Data sources</h1>
            <p className="mt-2 max-w-prose text-sm text-slate-600">
              Every external source this site reads from, what it covers, and how it's accessed. The machine-readable version of this
              same information is at{' '}
              <a href="/data-sources.json" className="underline hover:text-slate-800">
                /data-sources.json
              </a>
              .
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Holiday coverage last verified {holidayCoverage.asOf} — {holidayCoverage.countriesWithData} countries have real data.
            </p>
          </section>

          {sources.map((s) => (
            <section key={s.id} className="border-t border-slate-200 pt-6">
              <h2 className="text-lg font-semibold text-slate-900">
                <a href={s.url} target="_blank" rel="noreferrer" className="underline hover:text-slate-700">
                  {s.name}
                </a>
              </h2>
              <p className="mt-1 max-w-prose text-sm text-slate-600">{s.description}</p>
              <dl className="mt-3 flex flex-col gap-2 text-sm">
                <div>
                  <dt className="font-medium text-slate-700">Coverage</dt>
                  <dd className="text-slate-500">{s.coverage}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-700">How it's accessed</dt>
                  <dd className="text-slate-500">{s.accessPattern}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-700">License</dt>
                  <dd className="text-slate-500">{s.license}</dd>
                </div>
              </dl>
            </section>
          ))}
        </Container>
      </main>
      <Footer />
    </div>
  );
}
