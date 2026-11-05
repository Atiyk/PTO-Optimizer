import { useId, useMemo, useRef, useState } from 'react';
import { SiteHeader } from './SiteHeader';
import { Footer } from './Footer';
import { Container } from './Container';
import { Button } from './Button';
import { GLOSSARY_TERMS, type GlossaryTerm } from '../content/glossary/terms';
import { PRACTICAL_GUIDES } from '../content/glossary/guides';

const LEARNING_PATHS = [
  { title: 'Your PTO basics', detail: 'Understand your balance, how vacation differs from other leave, and the days you actually have.', terms: ['pto', 'vacation', 'sick-leave', 'floating-holiday'] },
  { title: 'How days are earned', detail: 'Decode pay periods, accrual rates, front-loaded grants and the limits on your balance.', terms: ['accrual', 'accrual-rate', 'front-loaded', 'accrual-cap'] },
  { title: 'What expires, and when', detail: 'Learn what happens at year end, when days carry over, and what you might lose.', terms: ['carryover', 'use-it-or-lose-it', 'forfeiture', 'plan-year'] },
  { title: 'Getting time off approved', detail: 'Understand notice requirements, restricted dates and the steps between planning and approval.', terms: ['notice-period', 'blackout-period', 'pto-request', 'company-holiday'] },
] as const;

/** The guide that opens the reading index; the rest follow as a plain list. */
const FEATURED_GUIDE = 'pto';

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

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]';

/**
 * /glossary, the Learn hub (a Read surface). Order follows what a visitor came for: the title,
 * then search (live as you type: it filters the SAME list already in the DOM, no submit, per
 * the site-wide "live, not a form" rule), then a reading index (four numbered pathways, the
 * practical guides as a featured lead plus a list), then every term A to Z. While a search is
 * active the index steps aside so the matches sit directly under the field.
 */
export function Glossary() {
  // The search query round-trips as ?q= like every other control: read once when the page
  // mounts (glossary-main uses createRoot, not hydration, and the prerender has no window, so
  // the static HTML stays the unfiltered hub) and written with replaceState as you type, so
  // typing never adds history entries.
  const [query, setQueryState] = useState(() =>
    typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('q') ?? '',
  );
  const setQuery = (next: string) => {
    setQueryState(next);
    const url = new URL(window.location.href);
    if (next) url.searchParams.set('q', next);
    else url.searchParams.delete('q');
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url);
  };
  const inputRef = useRef<HTMLInputElement>(null);
  const statusId = useId();
  const searching = query.trim().length > 0;
  const clearSearch = () => {
    setQuery('');
    inputRef.current?.focus();
  };
  const filtered = useMemo(() => GLOSSARY_TERMS.filter((t) => matches(t, query)), [query]);
  const groups = useMemo(() => groupAlphabetically(filtered), [filtered]);
  const featured = PRACTICAL_GUIDES.find((g) => g.termId === FEATURED_GUIDE)!;
  const otherGuides = PRACTICAL_GUIDES.filter((g) => g.termId !== FEATURED_GUIDE);

  return (
    <div className="min-h-screen bg-page">
      <SiteHeader active="glossary" />
      <main id="main-content" tabIndex={-1}>
        <Container className="px-4 pt-10 pb-4 sm:px-6 lg:pt-16">
          <h1 className="max-w-[18ch] text-display-sm text-ink type-display">Your PTO, explained simply.</h1>
          <p className="mt-4 max-w-[62ch] text-lg leading-7 text-ink">
            Plain guides to the time off you have earned. Look up a word from your handbook, or start with a topic below.
          </p>

          <section className="mt-8 max-w-2xl" aria-labelledby="glossary-search-heading">
            <h2 id="glossary-search-heading" className="text-h2 font-bold text-ink type-condensed">Look up a term</h2>
            <p className="mt-1 text-muted">Search definitions and the other names employee handbooks use.</p>
            <div className="mt-4 flex items-stretch gap-2">
              <label className="min-w-0 flex-1">
                <span className="sr-only">Search the glossary</span>
                <input
                  ref={inputRef}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-describedby={statusId}
                  placeholder="Try “carryover” or “accrual”"
                  className={`h-12 w-full min-w-0 rounded-[6px] border border-line-strong bg-surface px-4 text-[17px] text-ink placeholder:text-muted hover:border-ink ${FOCUS}`}
                />
              </label>
              {query.length > 0 && (
                <Button variant="secondary" onClick={clearSearch} className="h-12 shrink-0">
                  Clear search
                </Button>
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
              <section className="mt-16 lg:mt-20" aria-labelledby="learning-paths-heading">
                <h2 id="learning-paths-heading" className="text-h2 font-bold text-ink type-condensed">Start with a topic</h2>
                <ul className="mt-5 grid border-t border-ink md:grid-cols-2 md:gap-x-10">
                  {LEARNING_PATHS.map((path) => (
                    <li key={path.title} className="border-b border-line py-6">
                      <div className="min-w-0">
                        <h3 className="text-h2 font-bold text-ink type-condensed">{path.title}</h3>
                        <p className="mt-1 max-w-[52ch] text-muted">{path.detail}</p>
                        <ul className="mt-2 flex flex-wrap gap-x-4" aria-label={`Terms in ${path.title}`}>
                          {path.terms.map((id) => {
                            const term = GLOSSARY_TERMS.find((item) => item.id === id);
                            return term ? (
                              <li key={id}>
                                <a href={`/glossary/${id}`} className={`inline-flex min-h-11 items-center font-semibold ${FOCUS}`}>
                                  <span className="link-mark">{term.term}</span>
                                </a>
                              </li>
                            ) : null;
                          })}
                        </ul>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="mt-16 lg:mt-20" aria-labelledby="practical-guides-heading">
                <h2 id="practical-guides-heading" className="text-h2 font-bold text-ink type-condensed">Practical guides</h2>
                <p className="mt-1 max-w-[62ch] text-muted">Real questions, worked examples, and what to confirm with HR before you make plans.</p>
                <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
                  <a
                    href={`/glossary/${featured.termId}`}
                    className={`group flex flex-col self-start rounded-[10px] border border-line bg-surface p-6 transition-colors duration-150 hover:border-ink sm:p-8 ${FOCUS}`}
                  >
                    <h3 className="text-h1 text-ink type-display">{featured.title}</h3>
                    <p className="mt-3 max-w-[56ch] text-ink">{featured.answer}</p>
                    <p className="mt-3 text-sm text-muted">{featured.steps.length} things to check, a worked example and three questions for HR.</p>
                    <span className="mt-6 self-start font-semibold text-ink underline decoration-1 underline-offset-[0.22em] group-hover:decoration-2">
                      Read the guide <span aria-hidden="true">→</span>
                    </span>
                  </a>
                  <ul className="border-t border-line">
                    {otherGuides.map((guide) => (
                      <li key={guide.termId} className="border-b border-line">
                        <a href={`/glossary/${guide.termId}`} className={`group block py-4 ${FOCUS}`}>
                          <h3 className="flex items-baseline justify-between gap-4 text-lg font-bold leading-6 text-ink">
                            <span className="underline decoration-transparent decoration-1 underline-offset-[0.22em] group-hover:decoration-ink">{guide.title}</span>
                            <span aria-hidden="true" className="shrink-0 font-normal">→</span>
                          </h3>
                          <p className="mt-1 max-w-[62ch] text-muted">{guide.answer}</p>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>

              <section className="mt-16 flex flex-col gap-5 rounded-[10px] bg-surface-alt p-6 sm:p-8 lg:mt-20 lg:flex-row lg:items-center lg:justify-between" aria-label="Put your PTO knowledge to work">
                <div>
                  <h2 className="text-h2 font-bold text-ink type-condensed">Make the policy work for you</h2>
                  <p className="mt-1 max-w-[60ch] text-ink">Already know how your time off works? Forecast your balance and expiry dates, then find the best days to use it.</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button href="/policy" variant="secondary">Understand my policy</Button>
                  <Button href="/pto" variant="secondary">Plan my time off</Button>
                </div>
              </section>
            </>
          )}

          <section className={searching ? 'mt-8' : 'mt-16 lg:mt-20'} aria-labelledby="all-terms-heading">
            <h2 id="all-terms-heading" className={searching ? 'sr-only' : 'text-h2 font-bold text-ink type-condensed'}>
              {searching ? 'Matching terms' : 'Every term, A to Z'}
            </h2>
            {!searching && (
              <nav aria-label="Jump to letter" className="mt-4 flex flex-wrap border-t border-line">
                {Array.from(groups.keys()).map((letter) => (
                  <a key={letter} href={`#letter-${letter.toLowerCase()}`} className={`inline-flex h-11 min-w-11 items-center justify-center font-bold text-ink hover:bg-surface-alt hover:underline ${FOCUS}`}>
                    {letter}
                  </a>
                ))}
              </nav>
            )}

            {searching && filtered.length === 0 && <p className="mt-2 text-muted">No terms match "{query}".</p>}

            <div className="mt-4 flex flex-col">
              {Array.from(groups.entries()).map(([letter, terms]) => (
                <section key={letter} id={`letter-${letter.toLowerCase()}`} className="grid scroll-mt-4 border-t border-ink pt-3 pb-6 sm:grid-cols-[5rem_1fr]" aria-labelledby={`letter-${letter.toLowerCase()}-heading`}>
                  <h3 id={`letter-${letter.toLowerCase()}-heading`} className="text-h1 leading-none text-ink type-display">{letter}</h3>
                  <ul className="mt-2 grid gap-x-10 sm:mt-0 md:grid-cols-2">
                    {terms.map((t) => (
                      <li key={t.id} className="pb-3">
                        <a href={`/glossary/${t.id}`} className={`inline-flex min-h-11 items-center text-[17px] font-semibold ${FOCUS}`}>
                          <span className="link-mark">{t.term}</span>
                        </a>
                        <p className="max-w-[56ch] text-muted">{t.short}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </section>
        </Container>
      </main>
      <Footer />
    </div>
  );
}
