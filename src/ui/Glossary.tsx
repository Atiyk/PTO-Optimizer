import { useMemo, useState } from 'react';
import { SiteHeader } from './SiteHeader';
import { Footer } from './Footer';
import { Container } from './Container';
import { GLOSSARY_TERMS, type GlossaryTerm } from '../content/glossary/terms';

function matches(term: GlossaryTerm, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
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
  const filtered = useMemo(() => GLOSSARY_TERMS.filter((t) => matches(t, query)), [query]);
  const groups = useMemo(() => groupAlphabetically(filtered), [filtered]);

  return (
    <div className="min-h-screen bg-page">
      <SiteHeader active="glossary" />
      <main>
        <Container className="px-4 py-10">
          <h1 className="text-3xl font-bold text-slate-900">Glossary</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Plain-English definitions of the terms your handbook uses, written for you, not for HR. Every definition
            links to a page with more detail and a question you can take to HR.
          </p>
          <label className="mt-6 block max-w-sm">
            <span className="sr-only">Search the glossary</span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search terms…"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
          </label>

          {filtered.length === 0 && <p className="mt-8 text-sm text-slate-500">No terms match "{query}".</p>}

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
