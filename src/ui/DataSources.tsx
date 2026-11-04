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

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]';

/** Below md each row stacks and every cell shows its column name (read from data-label), so
 * the one table stays a real table at every width (explicit roles keep the semantics when the
 * cells are display:block). */
const CELL = 'block py-1 align-top md:table-cell md:py-5 md:pr-6 md:last:pr-0 before:block before:text-sm before:font-semibold before:text-muted before:content-[attr(data-label)] md:before:hidden';

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
        <Container className="px-4 pt-10 pb-4 sm:px-6 lg:pt-16">
          <h1 className="text-display-sm text-ink type-display">Data sources</h1>
          <p className="mt-4 max-w-[62ch] text-lg leading-7 text-ink">
            Every external source this site reads from, what it covers, and how it's accessed. The machine-readable version of this
            same information is at{' '}
            <a href="/data-sources.json" className={`link-mark ${FOCUS}`}>
              /data-sources.json
            </a>
            .
          </p>
          <p className="mt-3 text-sm text-muted">
            Holiday coverage last verified {holidayCoverage.asOf}. {holidayCoverage.countriesWithData} countries have real data.
          </p>

          <table role="table" className="mt-10 block w-full border-collapse text-left md:table">
            <caption className="sr-only">External data sources, what each covers, how it is accessed and its license</caption>
            <thead className="hidden md:table-header-group">
              <tr className="border-b border-ink">
                <th scope="col" className="w-[30%] pr-6 pb-3 text-sm font-semibold text-muted">Source</th>
                <th scope="col" className="w-[28%] pr-6 pb-3 text-sm font-semibold text-muted">Coverage</th>
                <th scope="col" className="w-[24%] pr-6 pb-3 text-sm font-semibold text-muted">How it's accessed</th>
                <th scope="col" className="pb-3 text-sm font-semibold text-muted">License</th>
              </tr>
            </thead>
            <tbody role="rowgroup" className="block md:table-row-group">
              {sources.map((s) => (
                <tr role="row" key={s.id} id={s.id} className="block border-t border-ink py-5 md:table-row md:border-t-0 md:border-b md:border-line md:py-0">
                  <th role="rowheader" scope="row" className="block pb-2 align-top font-normal md:table-cell md:py-5 md:pr-6">
                    <a href={s.url} target="_blank" rel="noreferrer" className={`text-lg font-bold ${FOCUS}`}>
                      <span className="link-mark">{s.name}</span>
                    </a>
                    <p className="mt-1 max-w-[52ch] text-ink">{s.description}</p>
                  </th>
                  <td role="cell" data-label="Coverage" className={`${CELL} text-ink`}>{s.coverage}</td>
                  <td role="cell" data-label="How it's accessed" className={`${CELL} text-ink`}>{s.accessPattern}</td>
                  <td role="cell" data-label="License" className={`${CELL} text-ink`}>{s.license}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Container>
      </main>
      <Footer />
    </div>
  );
}
