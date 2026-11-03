import { useId, useMemo, useRef, useState } from 'react';
import { SiteHeader } from './SiteHeader';
import { Footer } from './Footer';
import { Container } from './Container';
import { GLOSSARY_TERMS, type GlossaryTerm } from '../content/glossary/terms';
import { PRACTICAL_GUIDES } from '../content/glossary/guides';

const LEARNING_PATHS = [
  { title: 'Your PTO basics', detail: 'Understand your balance, how vacation differs from other leave, and the days you actually have.', terms: ['pto', 'vacation', 'sick-leave', 'floating-holiday'] },
  { title: 'How days are earned', detail: 'Decode pay periods, accrual rates, front-loaded grants and the limits on your balance.', terms: ['accrual', 'accrual-rate', 'front-loaded', 'accrual-cap'] },
  { title: 'What expires—and when', detail: 'Learn what happens at year end, when days carry over, and what you might lose.', terms: ['carryover', 'use-it-or-lose-it', 'forfeiture', 'plan-year'] },
  { title: 'Getting time off approved', detail: 'Understand notice requirements, restricted dates and the steps between planning and approval.', terms: ['notice-period', 'blackout-period', 'pto-request', 'company-holiday'] },
] as const;

function matches(term: GlossaryTerm, query: string): boolean {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  return (
    term.term.toLowerCase().includes(q) ||
    term.short.toLowerCase().includes(q) ||
    term.aliases.some((a) => a.toLowerCase().includes(q))
  );
}

function groupAlphabetically(terms: GlossaryTerm[]): Map<string, GlossaryTerm[]> {
  const sorted = [...terms].sort((a, b) => a.term.localeCompare(b.term));
  const groups = new Map<string, GlossaryTerm[]>();
  for (const t of sorted) {
    const letter = t.term[0].toUpperCase();
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter)!.push(t);
  }
  return groups;
}

/**
 * Stage 3C: /glossary - grouped (alphabetically; the ~30 terms here don't cluster neatly
 * into topic categories the way a larger glossary might), searching live as you type
 * (filters the SAME list already in the DOM, no submit, per the site-wide "live, not a
 * form" rule).
 */
export function Glossary() {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const statusId = useId();
  const searching = query.trim().length > 0;
  const clearSearch = () => {
    setQuery('');
    inputRef.current?.focus();
  };
  const filtered = useMemo(() => GLOSSARY_TERMS.filter((t) => matches(t, query)), [query]);
  const groups = useMemo(() => groupAlphabetically(filtered), [filtered]);

  return (
    <div className="min-h-screen bg-page">
      <SiteHeader active="glossary" />
      <main>
        <Container className="px-4 py-10">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-accent-ink">Understand your time off</p>
          <h1 className="text-3xl font-bold text-ink sm:text-4xl">Your PTO, explained simply.</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Practical guides to the benefits you have earned. Start with a topic, explore a short explanation, or look up a term from your handbook.
          </p>
          <section className="mt-8" aria-labelledby="glossary-search-heading">
            <h2 id="glossary-search-heading" className="text-xl font-semibold text-ink">Look up a term</h2>
            <p className="mt-1 text-sm text-muted">Search definitions and common names used in employee handbooks.</p>
            <div className="mt-4 flex max-w-lg items-center gap-2">
              <label className="min-w-0 flex-1">
                <span className="sr-only">Search the glossary</span>
                <input
                  ref={inputRef}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-describedby={statusId}
                  placeholder="Try “carryover” or “accrual”…"
                  className="h-11 w-full min-w-0 rounded-lg border border-line-strong bg-surface px-3 text-base text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                />
              </label>
              {query.length > 0 && (
                <button type="button" onClick={clearSearch} className="min-h-11 shrink-0 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-accent-ink hover:bg-surface-alt focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                  Clear search
                </button>
              )}
            </div>
            <p id={statusId} role="status" className="mt-2 text-sm text-muted">
              {searching
                ? `${filtered.length} ${filtered.length === 1 ? 'term' : 'terms'} found`
                : `${GLOSSARY_TERMS.length} terms available`}
            </p>
          </section>
          {!searching && (
            <>
          <div className="mt-7 grid gap-3 md:grid-cols-2">
            {LEARNING_PATHS.map((path) => (
              <section key={path.title} className="rounded-xl border border-line bg-surface p-5">
                <h2 className="text-lg font-semibold text-ink">{path.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">{path.detail}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {path.terms.map((id) => {
                    const term = GLOSSARY_TERMS.find((item) => item.id === id);
                    return term ? <a key={id} href={`/glossary/${id}`} className="inline-flex min-h-11 items-center rounded-full border border-line px-3 py-2 text-sm font-medium text-accent-ink hover:bg-surface-alt">{term.term}</a> : null;
                  })}
                </div>
              </section>
            ))}
          </div>
          <section className="mt-10" aria-labelledby="practical-guides-heading">
            <h2 id="practical-guides-heading" className="text-xl font-semibold text-ink">Practical guides</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">Real questions, simple examples, and the details to confirm with HR before you make plans.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {PRACTICAL_GUIDES.filter((guide) => ['pto', 'accrual', 'carryover', 'company-holiday', 'notice-period', 'payout'].includes(guide.termId)).map((guide) => (
                <a key={guide.termId} href={`/glossary/${guide.termId}`} className="group flex min-h-36 flex-col rounded-xl border border-line bg-surface p-5 transition-colors hover:border-line-strong hover:bg-surface-alt focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                  <h3 className="text-base font-semibold text-ink group-hover:text-accent-ink">{guide.title}</h3>
                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted">{guide.answer}</p>
                  <span className="mt-auto pt-4 text-sm font-medium text-accent-ink">Read the guide <span aria-hidden="true">→</span></span>
                </a>
              ))}
            </div>
          </section>
          <section className="mt-7 rounded-xl bg-surface-alt p-5 sm:p-6" aria-label="Put your PTO knowledge to work">
            <h2 className="text-lg font-semibold text-ink">Make the policy work for you</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">Already know how your time off works? Forecast your PTO balance and expiration dates, then find the best days to use it.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <a href="/policy" className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 py-2.5 font-semibold text-white hover:opacity-90">Understand my policy</a>
              <a href="/pto" className="inline-flex min-h-11 items-center rounded-lg border border-line-strong bg-surface px-4 py-2.5 font-semibold text-ink hover:bg-page">Plan my time off</a>
            </div>
          </section>
            </>
          )}

          {searching && filtered.length === 0 && <p className="mt-8 text-sm text-slate-500">No terms match "{query}".</p>}

          <div className="mt-8 flex flex-col gap-8">
            {Array.from(groups.entries()).map(([letter, terms]) => (
              <section key={letter}>
                <h2 className="mb-2 text-sm font-semibold text-slate-400">{letter}</h2>
                <ul className="flex flex-col divide-y divide-slate-100 border-t border-slate-100">
                  {terms.map((t) => (
                    <li key={t.id} className="py-3">
                      <a href={`/glossary/${t.id}`} className="font-medium text-slate-900 hover:underline">
                        {t.term}
                      </a>
                      <p className="mt-0.5 text-sm text-slate-600">{t.short}</p>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </Container>
      </main>
      <Footer />
    </div>
  );
}
