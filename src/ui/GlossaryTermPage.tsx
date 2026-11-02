import { SiteHeader } from './SiteHeader';
import { Footer } from './Footer';
import { Container } from './Container';
import { findTerm } from '../content/glossary/terms';
import { findPracticalGuide } from '../content/glossary/guides';
import { track } from './analytics';

/** Stage 3C's "interactive mini-example where it helps" - a tiny, static illustration for
 * the handful of terms a picture genuinely clarifies, not all 30 (most are better served by
 * the plain-English long definition alone). */
function MiniExample({ id }: { id: string }) {
  if (id === 'accrual-cap') {
    return (
      <div className="mt-6 max-w-sm rounded-md border border-slate-200 p-4">
        <p className="mb-2 text-xs font-medium text-slate-500">Example: a 22.5-day cap</p>
        <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full bg-slate-700" style={{ width: '100%' }} />
        </div>
        <p className="mt-2 text-xs text-slate-500">Balance at the cap. Accrual pauses here until a day is taken.</p>
      </div>
    );
  }
  if (id === 'carryover') {
    return (
      <div className="mt-6 max-w-sm rounded-md border border-slate-200 p-4 text-xs text-slate-600">
        <p className="font-medium text-slate-500">Example: carryover capped at 5</p>
        <p className="mt-2">Balance before reset: 12 days. Carried forward: 5. Forfeited: 7.</p>
      </div>
    );
  }
  if (id === 'bridge-day') {
    return (
      <div className="mt-6 flex max-w-sm items-center gap-1 text-xs">
        {['Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => (
          <div key={d} className={`flex-1 rounded py-2 text-center ${i === 0 || i >= 2 ? 'bg-slate-700 text-white' : 'border-2 border-dashed border-slate-400 text-slate-500'}`}>
            {d}
          </div>
        ))}
      </div>
    );
  }
  return null;
}

export function GlossaryTermPage({ termId }: { termId: string }) {
  const term = findTerm(termId);

  if (!term) {
    return (
      <div className="min-h-screen bg-page">
        <SiteHeader active="glossary" />
        <main>
          <Container className="px-4 py-10">
            <h1 className="text-2xl font-bold text-slate-900">Term not found</h1>
            <p className="mt-2 text-sm text-slate-600">
              <a href="/glossary" className="underline">
                Back to the glossary →
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

  return (
    <div className="min-h-screen bg-page">
      <SiteHeader active="glossary" />
      <main>
        <Container className="max-w-2xl px-4 py-10">
          <a href="/glossary" className="text-sm text-slate-500 hover:underline">
            ← Glossary
          </a>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">{term.term}</h1>
          {term.aliases.length > 0 && <p className="mt-1 text-sm text-slate-400">Also called: {term.aliases.join(', ')}</p>}
          <p className="mt-4 text-base text-slate-700">{term.long}</p>
          {!guide && <MiniExample id={term.id} />}

          {guide && (
            <article className="mt-8 space-y-6 border-t border-line pt-7" aria-labelledby="practical-guide-heading">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-accent-ink">Practical guide</p>
                <h2 id="practical-guide-heading" className="mt-2 text-2xl font-semibold tracking-tight text-ink">{guide.title}</h2>
                <p className="mt-3 text-base leading-relaxed text-ink">{guide.answer}</p>
              </div>

              <section aria-labelledby="guide-steps-heading">
                <h3 id="guide-steps-heading" className="text-lg font-semibold text-ink">What to check</h3>
                <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted">
                  {guide.steps.map((step) => <li key={step} className="pl-1">{step}</li>)}
                </ol>
              </section>

              <section className="rounded-xl border border-line bg-surface-alt p-5" aria-labelledby="guide-example-heading">
                <h3 id="guide-example-heading" className="text-lg font-semibold text-ink">A worked example</h3>
                <p className="mt-3 text-sm leading-relaxed text-ink">{guide.example.setup}</p>
                <p className="mt-3 rounded-lg bg-surface px-4 py-3 text-sm font-semibold leading-relaxed tabular-nums text-ink">{guide.example.calculation}</p>
                <p className="mt-3 text-sm leading-relaxed text-muted">{guide.example.result}</p>
              </section>

              <section aria-labelledby="guide-mistakes-heading">
                <h3 id="guide-mistakes-heading" className="text-lg font-semibold text-ink">Common mistakes</h3>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted">
                  {guide.mistakes.map((mistake) => <li key={mistake} className="pl-1">{mistake}</li>)}
                </ul>
              </section>

              <section className="rounded-xl border border-line bg-surface p-5" aria-labelledby="guide-hr-heading">
                <h3 id="guide-hr-heading" className="text-lg font-semibold text-ink">Three questions for HR</h3>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted">
                  {guide.hrQuestions.map((question) => <li key={question} className="pl-1">{question}</li>)}
                </ul>
              </section>

              <p className="text-sm leading-relaxed text-muted">{guide.caveat}</p>
              <a href={guide.action.href} className="inline-flex min-h-11 items-center rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                {guide.action.label} <span aria-hidden="true" className="ml-2">→</span>
              </a>
            </article>
          )}

          {(term.variesBy === 'location' || term.variesBy === 'both') && (
            <p className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
              This varies by where you work. Check your state or country's labor department for the specific rule
              where you are — we don't guess at it here.
            </p>
          )}

          {!guide && term.askHR && (
            <div className="mt-6 rounded-md border border-slate-200 p-4">
              <p className="text-xs font-medium text-slate-500">Ask HR</p>
              <p className="mt-1 text-sm text-slate-800">{term.askHR}</p>
            </div>
          )}

          <p className="mt-6 text-sm">
            <a
              href={`/policy?highlight=${term.id}`}
              className="font-medium text-slate-900 underline"
              onClick={() => track('policy_tool_used')}
            >
              See this in your own policy →
            </a>
          </p>

          {relatedTerms.length > 0 && (
            <div className="mt-8 border-t border-slate-100 pt-4">
              <p className="text-xs font-medium text-slate-500">Related terms</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {relatedTerms.map((t) => (
                  <li key={t.id}>
                    <a href={`/glossary/${t.id}`} className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50">
                      {t.term}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Container>
      </main>
      <Footer />
    </div>
  );
}
