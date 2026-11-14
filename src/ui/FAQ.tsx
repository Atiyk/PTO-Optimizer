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
      "Weekends and public holidays are fixed days off. The planner finds workdays where a few PTO days join them into longer breaks, then picks the set of breaks that fits your PTO and your two slider settings.",
  },
  {
    question: 'What do the two sliders do?',
    answer:
      'What matters more weighs total days off against a rough travel estimate. How many breaks sets how many separate breaks you get, from one long break to as many as the calendar allows.',
  },
  {
    question: 'Where does the travel data come from?',
    answer:
      'In the US, from public TSA airport checkpoint counts for 2025, averaged over 7-day windows. It shows broad seasons, not single days. Other countries have no travel data, so the planner uses a generic seasonal rule. It is not a forecast or a fare price.',
  },
  {
    question: 'Why are the suggestions all near holidays?',
    answer:
      'A holiday next to a weekend makes a break longer without using PTO, so breaks there cost the least. To favor quieter travel weeks instead, move What matters more to the right.',
  },
  {
    question: 'What if my company’s holidays are different?',
    answer:
      'Edit the holiday list under More options in the planner. Uncheck public holidays you work, and add your company’s own days off. Many employers don’t observe every public holiday.',
  },
  {
    question: 'Will I get the same result if I come back?',
    answer:
      "Yes. The same link gives the same plan unless the public holiday data has changed since. Employer holidays and other private settings stay in your browser, so a plan that used them can differ for someone else.",
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
