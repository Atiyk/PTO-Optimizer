export interface FAQItem {
  question: string;
  answer: string;
}

// Exactly six, per spec - an invented seventh turns a trust-building section into filler.
// Answers are always in the DOM (native <details> hides content with CSS, not conditional
// rendering), and each question is a real heading element inside <summary>, so the whole
// section is indexable even collapsed.
// Exported (Phase 5): the prerender script's FAQPage JSON-LD reads this same array, so the
// structured data and the visible FAQ can never drift apart into two different sources of
// truth for the same six questions.
export const ITEMS: FAQItem[] = [
  {
    question: 'How does it choose which days to take?',
    answer:
      "Holidays and weekends are fixed; the tool finds runs of consecutive days off that a small number of PTO days can bridge, then picks the best non-overlapping combination within your budget. It solves for the best overall set of breaks rather than picking the best single break and repeating - that's what lets it beat planning it by hand.",
  },
  {
    question: 'What do the two sliders do?',
    answer:
      'The first trades total days off against travel demand. The second sets how many separate breaks you want, from one long stretch to as many as the calendar allows.',
  },
  {
    question: 'Where does the travel data come from?',
    answer:
      'Daily US TSA checkpoint throughput, public domain, linked below. It measures how many people are flying, not ticket prices, and uses last year’s figures as a proxy for this year’s patterns. It is US-only; other countries fall back to a generic seasonal estimate, labelled "Estimated". It does not predict fares. The Travel score and its percentile are built from this same throughput data, which moves far less than destination-level prices do.',
  },
  {
    question: 'Why are the suggestions all near holidays?',
    answer:
      'Because holidays are the only free days adjacent to workdays, so bridging them is mathematically the most efficient use of PTO. Those are also the busiest and most expensive weeks to travel, which is what the weighting slider exists to let you trade away.',
  },
  {
    question: 'My company’s holidays are different.',
    answer:
      'The holiday list is editable. Public holidays are not the same as company holidays, and many employers do not observe all of them.',
  },
  {
    question: 'Will I get the same result if I come back?',
    answer:
      'Yes - the same inputs always produce the same plan. That is why a shared link reproduces exactly what the sender saw.',
  },
];

export function FAQ() {
  return (
    <section id="questions" aria-labelledby="questions-heading" className="text-ink">
      <h2 id="questions-heading" className="mb-3 text-h2 font-bold text-ink type-condensed">Questions</h2>
      <div className="flex flex-col divide-y divide-line border-y border-line">
        {ITEMS.map((item) => (
          <details key={item.question} className="group">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-[3px] py-2 text-left hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] [&::-webkit-details-marker]:hidden">
              <h3 className="text-[15px] font-semibold text-ink">
                {item.question}
              </h3>
              <span aria-hidden="true" className="inline-flex shrink-0 text-ink transition-transform duration-150 group-open:rotate-180"><svg viewBox="0 0 12 12" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 4.5 6 8l3.5-3.5" /></svg></span>
            </summary>
            <p className="max-w-prose pb-4 text-[15px] leading-6 text-muted">{item.answer}</p>
          </details>
        ))}
      </div>
      <p className="mt-4 text-sm text-muted">
        TSA checkpoint travel numbers:{' '}
        <a
          href="https://www.tsa.gov/travel/passenger-volumes"
          className="link-mark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          target="_blank"
          rel="noreferrer"
        >
          tsa.gov/travel/passenger-volumes
        </a>
      </p>
    </section>
  );
}
