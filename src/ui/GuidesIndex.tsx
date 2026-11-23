import { SiteHeader } from './SiteHeader';
import { Footer } from './Footer';
import { Container } from './Container';
import { Fragment } from 'react';
import { GUIDES } from '../content/guides';
import { PLAN_GUIDE_LINKS } from '../content/planGuides/planGuideLinks';
import { formatGuideDate } from './GuidePage';

const GROUPS = [
  { id: 'plan', title: 'Plan 2027' },
  { id: 'state', title: '2027 by state' },
  { id: 'basics', title: 'PTO basics' },
] as const;

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]';

/** /guides: every guide, newest-first order set in content/guides/index.ts, plus the
 * worked-plan pages (content/planGuides) in their own list after "Plan 2027". Those are
 * listed from plain data so this page never loads the solver. */
export function GuidesIndex() {
  return (
    <div className="min-h-screen bg-page">
      <SiteHeader active="glossary" />
      <main id="main-content" tabIndex={-1}>
        <Container className="px-4 pt-8 pb-4 sm:px-6 lg:pt-12">
          <div className="max-w-[68ch]">
            <h1 className="text-display-sm text-ink type-display">PTO guides</h1>
            <p className="mt-4 text-[19px] leading-8 text-ink">
              The 2027 US holiday dates, the PTO days to book around them, and how accrual, carryover and time-off requests work. Every plan opens in the planner with your own numbers.
            </p>
          </div>
          {GROUPS.map((group) => (
            <Fragment key={group.id}>
              <section className="mt-12" aria-labelledby={`guides-${group.id}`}>
                <h2 id={`guides-${group.id}`} className="text-h2 font-bold text-ink type-condensed">{group.title}</h2>
                <ul className="mt-4 grid max-w-5xl gap-x-10 border-t border-ink md:grid-cols-2">
                  {GUIDES.filter((g) => g.group === group.id).map((g) => (
                    <li key={g.id} className="border-b border-line py-5">
                      <a href={`/guides/${g.id}`} className={`inline-flex min-h-11 items-center text-lg font-bold text-ink ${FOCUS}`}>
                        <span className="link-mark">{g.title}</span>
                      </a>
                      <p className="mt-1 text-ink">{g.description}</p>
                      <p className="mt-2 text-sm text-muted">Updated <time dateTime={g.updated}>{formatGuideDate(g.updated)}</time></p>
                    </li>
                  ))}
                </ul>
              </section>
              {group.id === 'plan' && (
                <section className="mt-12" aria-labelledby="guides-worked-plans">
                  <h2 id="guides-worked-plans" className="text-h2 font-bold text-ink type-condensed">Worked plans from the planner</h2>
                  <p className="mt-2 max-w-[68ch] text-muted">Each page is a plan the planner computed, with the dates to request and a link that opens the same plan.</p>
                  <ul className="mt-4 grid max-w-5xl gap-x-10 border-t border-ink md:grid-cols-2">
                    {PLAN_GUIDE_LINKS.map((g) => (
                      <li key={g.href} className="border-b border-line py-5">
                        <a href={g.href} className={`inline-flex min-h-11 items-center text-lg font-bold text-ink ${FOCUS}`}>
                          <span className="link-mark">{g.title}</span>
                        </a>
                        <p className="mt-1 text-ink">{g.blurb}</p>
                        <p className="mt-2 text-sm text-muted">Updated <time dateTime={g.updated}>{formatGuideDate(g.updated)}</time></p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </Fragment>
          ))}
          <p className="mt-8 text-muted">
            Looking for a definition? The <a href="/glossary" className={`link-mark ${FOCUS}`}>glossary</a> explains every term in a PTO policy.
          </p>
        </Container>
      </main>
      <Footer />
    </div>
  );
}
