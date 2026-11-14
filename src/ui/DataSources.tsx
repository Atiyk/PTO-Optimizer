import { SiteHeader } from './SiteHeader';
import { Footer } from './Footer';
import { Container } from './Container';
import dataSources from '../../public/data-sources.json';
import holidayCoverage from '@daysoff/engine/data/holidayCoverage.json';
import { PRODUCT_NAME } from '../brand';
import { SHARE_LINK_SENTENCE } from './shareLinkCopy';

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
/** "2026 to 2028" from the bundled years, so the text follows the snapshot the build ships. */
export function bundledYearsText(years: readonly number[]): string {
  if (years.length === 0) return 'no years';
  const sorted = [...years].sort((a, b) => a - b);
  return sorted.length === 1 ? `${sorted[0]}` : `${sorted[0]} to ${sorted[sorted.length - 1]}`;
}

export function DataSources() {
  const sources = dataSources.sources as Source[];
  return (
    <div className="min-h-screen bg-page">
      <SiteHeader active="other" />
      <main id="main-content" tabIndex={-1}>
        <Container className="px-4 pt-10 pb-4 sm:px-6 lg:pt-16">
          <h1 className="text-display-sm text-ink type-display">Data sources</h1>
          <p className="mt-4 max-w-[62ch] text-lg leading-7 text-ink">
            Where {PRODUCT_NAME}’s holiday and travel data comes from, how it counts days off, and what stays in your browser.
          </p>

          <div className="mt-10 grid max-w-5xl gap-x-12 gap-y-10 md:grid-cols-2">
            <section aria-labelledby="ds-holidays" className="min-w-0">
              <h2 id="ds-holidays" className="text-h2 font-bold text-ink type-condensed">Public holidays</h2>
              <p className="mt-3 max-w-[62ch] text-base leading-7 text-ink">
                Holiday dates and names come from <a href="https://date.nager.at" target="_blank" rel="noreferrer" className={`link-mark ${FOCUS}`}>Nager.Date</a>, a free public holiday API.
                A copy for {bundledYearsText(holidayCoverage.bundledYears)} ships with the site, covering {holidayCoverage.countriesWithData} countries, last checked {holidayCoverage.asOf}.
                For any other year, your browser asks Nager.Date directly and sends only the country and year.
              </p>
              <p className="mt-3 max-w-[62ch] text-base leading-7 text-ink">
                A public holiday is not a promise that your employer gives the day off. You can uncheck holidays you work and add your employer’s own days in the planner.
              </p>
            </section>

            <section aria-labelledby="ds-travel" className="min-w-0">
              <h2 id="ds-travel" className="text-h2 font-bold text-ink type-condensed">Travel data</h2>
              <p className="mt-3 max-w-[62ch] text-base leading-7 text-ink">
                In the US, the travel estimate uses TSA airport checkpoint counts for 2025. Each day is averaged with the same weekday a week before and after, so it shows busy and quiet seasons, not single days.
              </p>
              <p className="mt-3 max-w-[62ch] text-base leading-7 text-ink">
                Other countries have no travel data, so the planner uses a simple seasonal rule. Neither is a forecast or a fare price.
              </p>
            </section>

            <section aria-labelledby="ds-counting" className="min-w-0">
              <h2 id="ds-counting" className="text-h2 font-bold text-ink type-condensed">How days off are counted</h2>
              <p className="mt-3 max-w-[62ch] text-base leading-7 text-ink">
                A day off is any day you don’t work: a weekend day, a public holiday you have off, or a PTO day. Each date counts once.
                &ldquo;18 days off for 10 PTO days&rdquo; means 10 PTO days plus 8 weekend and holiday days around them.
              </p>
              <p className="mt-3 max-w-[62ch] text-base leading-7 text-ink">
                Your workweek setting decides which days are weekends. Only days inside the dates you plan for are counted.
              </p>
            </section>

            <section aria-labelledby="ds-browser" className="min-w-0">
              <h2 id="ds-browser" className="text-h2 font-bold text-ink type-condensed">What stays in your browser</h2>
              <p className="mt-3 max-w-[62ch] text-base leading-7 text-ink">
                Planning runs on your device and needs no account. Saved policies, employer holidays, tracked requests and saved plans are kept in this browser and are not synced to other devices.
              </p>
              <p className="mt-3 max-w-[62ch] text-base leading-7 text-ink">
                {SHARE_LINK_SENTENCE} Calendar subscriptions and optional email reminders send your plan link to {PRODUCT_NAME}’s server. If you sign in for reminders, the server keeps your email address and the links you choose to save. The <a href="/privacy.html" className={`link-mark ${FOCUS}`}>privacy page</a> has the details.
              </p>
            </section>
          </div>

          <h2 className="mt-16 text-h2 font-bold text-ink type-condensed">Every source</h2>
          <p className="mt-3 max-w-[62ch] text-base leading-7 text-ink">
            Each external source, what it covers and how it’s accessed. The same list is published as{' '}
            <a href="/data-sources.json" className={`link-mark ${FOCUS}`}>
              /data-sources.json
            </a>
            .
          </p>

          <table role="table" className="mt-6 block w-full border-collapse text-left md:table">
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
