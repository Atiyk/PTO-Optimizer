import { SiteHeader } from './SiteHeader';
import { Footer } from './Footer';
import { Container } from './Container';
import { findTerm } from '../content/glossary/terms';
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
          <MiniExample id={term.id} />

          {(term.variesBy === 'location' || term.variesBy === 'both') && (
            <p className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
              This varies by where you work. Check your state or country's labor department for the specific rule
              where you are — we don't guess at it here.
            </p>
          )}

          {term.askHR && (
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
