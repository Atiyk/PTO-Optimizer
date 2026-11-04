import { SiteHeader } from './SiteHeader';
import { Footer } from './Footer';
import { Container } from './Container';
import { ITEMS as PTO_FAQ_ITEMS, type FAQItem } from './FAQ';
import { SABBATICAL_FAQ_ITEMS } from './sabbaticalFaqItems';
import { ABOUT_FAQ_ITEMS } from './aboutFaqItems';

/**
 * Phase 6B: one page consolidating both tools' questions in anchored sections, so a
 * visitor (or a search result) lands on a real page instead of only a mid-page anchor on
 * /pto. Reads the SAME two arrays each tool's own FAQ section and JSON-LD already read -
 * never a second, copied set of questions that could drift from what's actually shown on
 * /pto or /sabbatical.
 */
function FaqSection({ id, title, items }: { id: string; title: string; items: FAQItem[] }) {
  return (
    <section id={id} className="border-t border-slate-200 pt-6 first:border-t-0 first:pt-0">
      <h2 className="mb-3 text-lg font-semibold text-slate-900">{title}</h2>
      <div className="flex flex-col divide-y divide-slate-100">
        {items.map((item) => (
          <details key={item.question} className="group py-2.5">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-md px-2 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900">
              <h3 className="text-sm font-medium text-slate-700 group-open:text-slate-900">{item.question}</h3>
              <span aria-hidden="true" className="shrink-0 text-base text-slate-600 transition-transform group-open:rotate-180">▾</span>
            </summary>
            <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-slate-500">{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function FaqPage() {
  return (
    <div className="min-h-screen bg-page">
      <SiteHeader active="other" />
      <main id="main-content" tabIndex={-1}>
        <Container className="flex flex-col gap-8 px-4 py-10">
          <section>
            <h1 className="m-0 text-3xl font-bold text-slate-900">Frequently asked questions</h1>
            <p className="mt-2 max-w-prose text-sm text-slate-600">
              Questions about <a href="/pto" className="rounded-sm underline hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900">Plan PTO</a> and{' '}
              <a href="/sabbatical" className="rounded-sm underline hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900">Sabbatical</a> tools, consolidated here. Each tool's
              own page has this same content inline, right where it's relevant.
            </p>
            <nav aria-label="FAQ sections" className="mt-3 flex flex-wrap gap-2 text-sm">
              <a href="#pto" className="inline-flex min-h-11 items-center rounded-md px-2 underline hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900">
                Plan PTO &darr;
              </a>
              <a href="#sabbatical" className="inline-flex min-h-11 items-center rounded-md px-2 underline hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900">
                Sabbatical &darr;
              </a>
              <a href="#about" className="inline-flex min-h-11 items-center rounded-md px-2 underline hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900">
                About &darr;
              </a>
            </nav>
          </section>

          <FaqSection id="pto" title="Plan PTO" items={PTO_FAQ_ITEMS} />
          <FaqSection id="sabbatical" title="Sabbatical" items={SABBATICAL_FAQ_ITEMS} />
          <FaqSection id="about" title="About this site" items={ABOUT_FAQ_ITEMS} />
        </Container>
      </main>
      <Footer />
    </div>
  );
}
