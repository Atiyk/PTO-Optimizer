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
      "Holidays and weekends are fixed; the tool finds runs of consecutive days off that a small number of PTO days can bridge, then compares non-overlapping combinations within your budget to find a good set of breaks.",
  },
  {
    question: 'What do the two sliders do?',
    answer:
      'The first weighs total days off and a rough travel estimate when choosing dates. The second sets how many separate breaks you want, from one long stretch to as many as the calendar allows.',
  },
  {
    question: 'Where does the travel data come from?',
    answer:
      'The US estimate averages public TSA checkpoint counts from 2025 over each 7-day window, so it reflects broad seasons, not particular weekdays or next year’s traffic. Other countries use a generic seasonal rule without local observations. Neither is a forecast, and neither says anything about fares or prices. Your PTO days and days off are exact; only the travel estimate is approximate.',
  },
  {
    question: 'Why are the suggestions all near holidays?',
    answer:
      'A holiday or regular day off can stretch a break without using extra PTO. The travel slider lets you give more weight to dates that look quieter in the model.',
  },
  {
    question: 'My company’s holidays are different.',
    answer:
      'The holiday list is editable. Public holidays are not the same as company holidays, and many employers do not observe all of them.',
  },
  {
    question: 'Will I get the same result if I come back?',
    answer:
      "Yes, as long as the link includes its dates and the holiday data hasn't been updated since. That is why a shared link reproduces what the sender saw.",
  },
];

export function FAQ() {
  return (
    <section id="questions" aria-labelledby="questions-heading" className="text-ink">
      <h2 id="questions-heading" className="mb-3 text-h2 font-bold text-ink type-condensed">Questions</h2>
      <div className="flex flex-col divide-y divide-line border-y border-line">
        {ITEMS.map((item) => (
          <details key={item.question} className="group">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-[6px] py-2 text-left hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] [&::-webkit-details-marker]:hidden">
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
          className="link-mark inline-flex min-h-11 items-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          target="_blank"
          rel="noreferrer"
        >
          tsa.gov/travel/passenger-volumes
        </a>
      </p>
    </section>
  );
}
