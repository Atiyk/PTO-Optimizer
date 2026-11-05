import type { ReactNode } from 'react';
import { SiteHeader } from './SiteHeader';
import { Footer } from './Footer';
import { Container } from './Container';
import { Button } from './Button';
import { Callout } from './Callout';
import { findTerm } from '../content/glossary/terms';
import { findPracticalGuide } from '../content/glossary/guides';
import { track } from './analytics';

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]';

/** Stage 3C's "interactive mini-example where it helps" - a tiny, static illustration for
 * the handful of terms a picture genuinely clarifies, not all 30 (most are better served by
 * the plain-English long definition alone). Drawn in the calendar's own language: PTO is a
 * solid indigo block, days off are the tinted run, and every cell also carries a word. */
function MiniExample({ id }: { id: string }) {
  if (id === 'accrual-cap') {
    return (
      <ExampleBlock title="Example: a 22.5-day cap">
        <div className="h-3 w-full max-w-sm bg-surface-alt" aria-hidden="true">
          <div className="h-full bg-accent" style={{ width: '100%' }} />
        </div>
        <p className="mt-2 text-muted">Balance at the cap. Accrual pauses here until a day is taken.</p>
      </ExampleBlock>
    );
  }
  if (id === 'carryover') {
    return (
      <ExampleBlock title="Example: carryover capped at 5">
        <p className="text-ink">Balance before reset: 12 days. Carried forward: 5. Forfeited: 7.</p>
      </ExampleBlock>
    );
  }
  if (id === 'bridge-day') {
    const days = [
      { d: 'Thu', note: 'Holiday', pto: false },
      { d: 'Fri', note: 'PTO', pto: true },
      { d: 'Sat', note: 'Weekend', pto: false },
      { d: 'Sun', note: 'Weekend', pto: false },
    ];
    return (
      <ExampleBlock title="Example: one PTO day, four days off">
        <ol className="flex max-w-sm">
          {days.map((day) => (
            <li key={day.d} className={`flex flex-1 flex-col items-center py-2 text-center ${day.pto ? 'bg-accent text-white' : 'bg-mark text-ink shadow-[inset_0_-3px_0_var(--accent)]'}`}>
              <span className="font-bold">{day.d}</span>
              <span className="text-sm">{day.note}</span>
            </li>
          ))}
        </ol>
      </ExampleBlock>
    );
  }
  return null;
}

function ExampleBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10" aria-label={title}>
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function SubHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h3 id={id} className="text-h2 font-bold text-ink type-condensed">
      {children}
    </h3>
  );
}

/**
 * /glossary/<id>: a reference entry. Term set large, then the plain definition at reading
 * size, then (where one exists) the practical guide with its worked example, then caveats.
 * Beside it on wide screens, and after it on phones: the one action that puts the term to
 * use, the policy link, and related terms. Reading column held to about 68 characters.
 */
export function GlossaryTermPage({ termId }: { termId: string }) {
  const term = findTerm(termId);

  if (!term) {
    return (
      <div className="min-h-screen bg-page">
        <SiteHeader active="glossary" />
        <main id="main-content" tabIndex={-1}>
          <Container className="px-4 py-12 sm:px-6">
            <h1 className="text-h1 text-ink type-display">Term not found</h1>
            <p className="mt-3">
              <a href="/glossary" className={`link-mark ${FOCUS}`}>
                Back to the glossary
              </a>
            </p>
          </Container>
        </main>
        <Footer />
      </div>
    );
  }

  const guide = findPracticalGuide(term.id);
  const relatedTerms = term.related.map((id) => findTerm(id)).filter((t): t is NonNullable<typeof t> => !!t);
  const policyLink = (
    <a href={`/policy?highlight=${term.id}`} className={`inline-flex min-h-11 items-center ${FOCUS}`} onClick={() => track('policy_tool_used')}>
      <span className="link-mark">See this in your own policy</span>
    </a>
  );

  return (
    <div className="min-h-screen bg-page">
      <SiteHeader active="glossary" />
      <main id="main-content" tabIndex={-1}>
        <Container className="px-4 pt-6 pb-4 sm:px-6 lg:pt-10">
          <nav aria-label="Breadcrumb">
            <a href="/glossary" className={`inline-flex min-h-11 items-center text-muted hover:text-ink ${FOCUS}`}>
              <span aria-hidden="true" className="mr-1.5">←</span>
              <span className="underline decoration-1 underline-offset-[0.22em]">Glossary</span>
            </a>
          </nav>

          <div className="mt-2 grid gap-12 lg:grid-cols-[minmax(0,68ch)_minmax(16rem,20rem)] lg:justify-between lg:gap-16">
            <article className="min-w-0 max-w-[68ch]" aria-labelledby="term-heading">
              <h1 id="term-heading" className="text-display-sm text-ink type-display">{term.term}</h1>
              {term.aliases.length > 0 && <p className="mt-2 text-muted">Also called {term.aliases.join(', ')}</p>}
              <p className="mt-6 border-t border-ink pt-5 text-[19px] leading-8 text-ink">{term.long}</p>
              {!guide && <MiniExample id={term.id} />}

              {guide && (
                <article className="mt-12 space-y-10" aria-labelledby="practical-guide-heading">
                  <div>
                    <h2 id="practical-guide-heading" className="text-h1 text-ink type-display">{guide.title}</h2>
                    <p className="mt-3 text-[17px] leading-7 text-ink">{guide.answer}</p>
                  </div>

                  <section aria-labelledby="guide-steps-heading">
                    <SubHeading id="guide-steps-heading">What to check</SubHeading>
                    <ol className="mt-4 border-t border-line">
                      {guide.steps.map((step, i) => (
                        <li key={step} className="grid grid-cols-[2rem_1fr] border-b border-line py-3 text-ink">
                          <span aria-hidden="true" className="font-bold">{i + 1}</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  </section>

                  <section className="rounded-[10px] border border-line bg-surface p-5 sm:p-6" aria-labelledby="guide-example-heading">
                    <SubHeading id="guide-example-heading">A worked example</SubHeading>
                    <p className="mt-3 text-ink">{guide.example.setup}</p>
                    <p className="mt-4 text-lg font-bold leading-7 text-ink tabular-nums">
                      <span className="mark">{guide.example.calculation}</span>
                    </p>
                    <p className="mt-4 text-muted">{guide.example.result}</p>
                  </section>

                  <section aria-labelledby="guide-mistakes-heading">
                    <SubHeading id="guide-mistakes-heading">Common mistakes</SubHeading>
                    <ul className="mt-3 list-disc space-y-2 pl-5 text-ink marker:text-muted">
                      {guide.mistakes.map((mistake) => <li key={mistake} className="pl-1">{mistake}</li>)}
                    </ul>
                  </section>

                  <section className="rounded-[10px] bg-surface-alt p-5 sm:p-6" aria-labelledby="guide-hr-heading">
                    <SubHeading id="guide-hr-heading">Three questions for HR</SubHeading>
                    <ol className="mt-3 list-decimal space-y-2 pl-5 text-ink">
                      {guide.hrQuestions.map((question) => <li key={question} className="pl-1">{question}</li>)}
                    </ol>
                  </section>

                  <p className="text-sm text-muted">{guide.caveat}</p>
                </article>
              )}

              {(term.variesBy === 'location' || term.variesBy === 'both') && (
                <Callout tone="neutral" title="This varies by where you work" className="mt-8">
                  Check your state or country's labor department for the specific rule where you are. We don't guess at it here.
                </Callout>
              )}

              {!guide && term.askHR && (
                <Callout tone="neutral" title="Ask HR" className="mt-6">
                  {term.askHR}
                </Callout>
              )}
            </article>

            <aside className="flex min-w-0 max-w-xl flex-col gap-8 lg:sticky lg:top-6 lg:self-start lg:pt-3" aria-label="Use this term">
              <div className="border-t border-ink pt-4">
                <h2 className="text-lg font-bold text-ink">Use it</h2>
                {guide ? (
                  <>
                    <p className="mt-1 text-muted">Put this into practice with your own numbers.</p>
                    <Button href={guide.action.href} variant="secondary" className="mt-4 w-full whitespace-normal text-center">
                      {guide.action.label} <span aria-hidden="true">→</span>
                    </Button>
                    {guide.action.href !== '/pto' && (
                      <p className="mt-2">
                        <a href="/pto" className={`inline-flex min-h-11 items-center ${FOCUS}`}><span className="link-mark">Open the PTO planner</span></a>
                      </p>
                    )}
                    <p>{policyLink}</p>
                  </>
                ) : (
                  <>
                    <p className="mt-1 text-muted">See how this term applies to your balance, then plan around it.</p>
                    <Button href={`/policy?highlight=${term.id}`} variant="secondary" className="mt-4 w-full whitespace-normal text-center" onClick={() => track('policy_tool_used')}>
                      See this in your own policy <span aria-hidden="true">→</span>
                    </Button>
                    <p className="mt-3">
                      <a href="/pto" className={`inline-flex min-h-11 items-center ${FOCUS}`}><span className="link-mark">Open the PTO planner</span></a>
                    </p>
                  </>
                )}
              </div>

              {relatedTerms.length > 0 && (
                <div className="border-t border-ink pt-4">
                  <h2 className="text-lg font-bold text-ink">Related terms</h2>
                  <ul className="mt-1">
                    {relatedTerms.map((t) => (
                      <li key={t.id} className="border-b border-line pb-2.5 last:border-b-0">
                        <a href={`/glossary/${t.id}`} className={`inline-flex min-h-11 items-center font-semibold ${FOCUS}`}>
                          <span className="link-mark">{t.term}</span>
                        </a>
                        <p className="text-sm text-muted">{t.short}</p>
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
