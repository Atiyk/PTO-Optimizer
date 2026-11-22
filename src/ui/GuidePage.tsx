import type { MouseEvent } from 'react';
import { SiteHeader } from './SiteHeader';
import { Footer } from './Footer';
import { Container } from './Container';
import { Button } from './Button';
import { findGuide, type Guide } from '../content/guides';
import { h2Headings, headingId, renderGuideMarkdown } from '../content/guides/markdown';
import { track } from './analytics';

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]';

let longDate: Intl.DateTimeFormat | undefined;
export function formatGuideDate(iso: string): string {
  longDate ??= new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  return longDate.format(new Date(`${iso}T00:00:00Z`));
}

/** One event for any guide link into a tool (planner or policy). Delegated, so body links
 * written in Markdown are counted without each needing a handler. */
function trackToolLink(event: MouseEvent<HTMLElement>) {
  const link = (event.target as HTMLElement).closest?.('a');
  const href = link?.getAttribute('href') ?? '';
  if (/^\/(pto|policy|family)(\?|$|\/)/.test(href)) track('guide_plan_opened');
}

function NotFound() {
  return (
    <div className="min-h-screen bg-page">
      <SiteHeader active="glossary" />
      <main id="main-content" tabIndex={-1}>
        <Container className="px-4 py-12 sm:px-6">
          <h1 className="text-h1 text-ink type-display">Guide not found</h1>
          <p className="mt-3">
            <a href="/guides" className={`link-mark ${FOCUS}`}>All guides</a>
          </p>
        </Container>
      </main>
      <Footer />
    </div>
  );
}

/**
 * /guides/<id>: a long-form article. Answer first (the summary under the H1), then the body,
 * questions, and sources. Beside it on wide screens, after it on phones: the one action,
 * the section list and related guides. Reading column held to about 68 characters.
 */
export function GuidePage({ guideId }: { guideId: string }) {
  const guide = findGuide(guideId);
  if (!guide) return <NotFound />;
  const sections = h2Headings(guide.body);
  const related = guide.related.map((id) => findGuide(id)).filter((g): g is Guide => !!g);

  return (
    <div className="min-h-screen bg-page">
      <SiteHeader active="glossary" />
      <main id="main-content" tabIndex={-1} onClick={trackToolLink}>
        <Container className="px-4 pt-6 pb-4 sm:px-6 lg:pt-10">
          <nav aria-label="Breadcrumb">
            <a href="/guides" className={`inline-flex min-h-11 items-center text-muted hover:text-ink ${FOCUS}`}>
              <span aria-hidden="true" className="mr-1.5">←</span>
              <span className="underline decoration-1 underline-offset-[0.22em]">Guides</span>
            </a>
          </nav>

          <div className="mt-2 grid gap-12 lg:grid-cols-[minmax(0,68ch)_minmax(16rem,20rem)] lg:justify-between lg:gap-16">
            <article className="min-w-0 max-w-[68ch]" aria-labelledby="guide-heading">
              <h1 id="guide-heading" className="text-display-sm text-ink type-display">{guide.title}</h1>
              <p className="mt-3 text-sm text-muted">
                Updated <time dateTime={guide.updated}>{formatGuideDate(guide.updated)}</time> · US dates
              </p>
              <p className="mt-6 border-t border-ink pt-5 text-[19px] leading-8 text-ink">{guide.summary}</p>

              <div>{renderGuideMarkdown(guide.body)}</div>

              {guide.faq.length > 0 && (
                <section className="mt-14" aria-labelledby="guide-faq-heading">
                  <h2 id="guide-faq-heading" className="text-h2 font-bold text-ink type-condensed">Common questions</h2>
                  <dl className="mt-4 border-t border-line">
                    {guide.faq.map((item) => (
                      <div key={item.question} id={`faq-${headingId(item.question)}`} className="border-b border-line py-4">
                        <dt className="font-semibold text-ink">{item.question}</dt>
                        <dd className="mt-1.5 text-ink">{item.answer}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}

              <section className="mt-12" aria-labelledby="guide-sources-heading">
                <h2 id="guide-sources-heading" className="text-lg font-bold text-ink">Sources</h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-ink marker:text-muted">
                  {guide.sources.map((s) => (
                    <li key={s.url} className="pl-1">
                      <a href={s.url} rel="noopener noreferrer" className={`link-mark ${FOCUS}`}>{s.label}</a>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-sm text-muted">
                  Holiday dates come from the planner’s bundled public-holiday data and the federal calendar. Your employer sets its own holidays. This is general information, not legal or HR advice.
                </p>
              </section>
            </article>

            <aside className="flex min-w-0 max-w-xl flex-col gap-8 lg:sticky lg:top-6 lg:self-start lg:pt-3" aria-label="Use this guide">
              <div className="border-t border-ink pt-4">
                <h2 className="text-lg font-bold text-ink">Use it</h2>
                <p className="mt-1 text-muted">Open the plan with your own PTO and company holidays.</p>
                <Button href={guide.action.href} variant="secondary" className="mt-4 w-full whitespace-normal text-center">
                  {guide.action.label} <span aria-hidden="true">→</span>
                </Button>
              </div>

              {sections.length > 1 && (
                <nav className="border-t border-ink pt-4" aria-label="In this guide">
                  <h2 className="text-lg font-bold text-ink">In this guide</h2>
                  <ul className="mt-1">
                    {sections.map((s) => (
                      <li key={s.id}>
                        <a href={`#${s.id}`} className={`inline-flex min-h-11 items-center ${FOCUS}`}><span className="link-mark">{s.text}</span></a>
                      </li>
                    ))}
                  </ul>
                </nav>
              )}

              {related.length > 0 && (
                <div className="border-t border-ink pt-4">
                  <h2 className="text-lg font-bold text-ink">Related guides</h2>
                  <ul className="mt-1">
                    {related.map((g) => (
                      <li key={g.id} className="border-b border-line pb-2.5 last:border-b-0">
                        <a href={`/guides/${g.id}`} className={`inline-flex min-h-11 items-center py-1 font-semibold ${FOCUS}`}>
                          <span className="link-mark">{g.title}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </aside>
          </div>
        </Container>
      </main>
      <Footer />
    </div>
  );
}
