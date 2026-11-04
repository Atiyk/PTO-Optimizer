import { SiteHeader } from './SiteHeader';
import { Footer } from './Footer';
import { Container } from './Container';
import { ITEMS as PTO_FAQ_ITEMS, type FAQItem } from './FAQ';
import { SABBATICAL_FAQ_ITEMS } from './sabbaticalFaqItems';
import { ABOUT_FAQ_ITEMS } from './aboutFaqItems';

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]';

const SECTIONS: { id: string; title: string; items: FAQItem[] }[] = [
  { id: 'pto', title: 'Plan PTO', items: PTO_FAQ_ITEMS },
  { id: 'sabbatical', title: 'Sabbatical', items: SABBATICAL_FAQ_ITEMS },
  { id: 'about', title: 'About this site', items: ABOUT_FAQ_ITEMS },
];

/**
 * Phase 6B: one page consolidating both tools' questions in anchored sections, so a
 * visitor (or a search result) lands on a real page instead of only a mid-page anchor on
 * /pto. Reads the SAME arrays each tool's own FAQ section and JSON-LD already read -
 * never a second, copied set of questions that could drift from what's actually shown on
 * /pto or /sabbatical.
 *
 * Disclosures are native <details>/<summary>: Enter/Space toggle them, answers stay in the
 * prerendered HTML, and each question is a real heading. The plus turns to a minus when open,
 * so state is shown by shape, not colour.
 */
function FaqSection({ id, title, items }: { id: string; title: string; items: FAQItem[] }) {
  return (
    <section id={id} className="scroll-mt-6" aria-labelledby={`${id}-heading`}>
      <div className="flex items-baseline justify-between gap-4 border-b border-ink pb-3">
        <h2 id={`${id}-heading`} className="text-h2 font-bold text-ink type-condensed">{title}</h2>
        <p className="shrink-0 text-sm text-muted">
          {items.length} {items.length === 1 ? 'question' : 'questions'}
        </p>
      </div>
      <div className="flex flex-col">
        {items.map((item) => (
          <details key={item.question} className="group border-b border-line">
            <summary className={`flex min-h-11 cursor-pointer list-none items-start justify-between gap-4 py-4 text-left hover:bg-surface-alt/60 [&::-webkit-details-marker]:hidden ${FOCUS}`}>
              <h3 className="text-[17px] font-semibold leading-6 text-ink">{item.question}</h3>
              <span aria-hidden="true" className="relative mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[3px] border border-ink group-open:bg-ink">
                <span className="absolute h-[1.5px] w-2.5 bg-ink group-open:bg-white" />
                <span className="absolute h-2.5 w-[1.5px] bg-ink group-open:hidden" />
              </span>
            </summary>
            <p className="max-w-[68ch] pb-5 pr-9 leading-7 text-ink">{item.answer}</p>
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
        <Container className="px-4 pt-10 pb-4 sm:px-6 lg:pt-16">
          <h1 className="max-w-[16ch] text-display-sm text-ink type-display">Frequently asked questions</h1>
          <p className="mt-4 max-w-[62ch] text-lg leading-7 text-ink">
            Questions about the <a href="/pto" className={`link-mark ${FOCUS}`}>Plan PTO</a> and{' '}
            <a href="/sabbatical" className={`link-mark ${FOCUS}`}>Sabbatical</a> tools, in one place. Each tool's own page has the same
            answers inline, right where they are relevant.
          </p>

          <div className="mt-10 grid gap-10 lg:mt-14 lg:grid-cols-[12rem_minmax(0,72ch)] lg:gap-16">
            <nav aria-label="FAQ sections" className="lg:sticky lg:top-6 lg:self-start">
              <h2 className="sr-only">Sections</h2>
              <ul className="flex flex-wrap gap-x-5 border-y border-line lg:flex-col lg:border-y-0 lg:border-t lg:border-ink lg:pt-2">
                {SECTIONS.map((s) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className={`inline-flex min-h-11 items-center font-semibold text-ink ${FOCUS}`}>
                      <span className="link-mark">{s.title}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="flex min-w-0 flex-col gap-14">
              {SECTIONS.map((s) => (
                <FaqSection key={s.id} id={s.id} title={s.title} items={s.items} />
              ))}
            </div>
          </div>
        </Container>
      </main>
      <Footer />
    </div>
  );
}
