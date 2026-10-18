interface FAQItem {
  question: string;
  answer: string;
}

// Exactly six, per spec - an invented seventh turns a trust-building section into filler.
// Answers are always in the DOM (native <details> hides content with CSS, not conditional
// rendering), and each question is a real heading element inside <summary>, so the whole
// section is indexable even collapsed.
const ITEMS: FAQItem[] = [
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
    <section className="mt-10 border-t border-slate-100 dark:border-slate-800 pt-6 text-sm text-slate-500 dark:text-slate-400">
      <h2 className="mb-3 text-sm font-medium text-slate-600 dark:text-slate-300">Questions</h2>
      <div className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
        {ITEMS.map((item) => (
          <details key={item.question} className="group py-2.5">
            <summary className="cursor-pointer list-none">
              <h3 className="inline text-sm font-normal text-slate-600 dark:text-slate-300 marker:content-none group-open:text-slate-800 dark:group-open:text-slate-100">
                {item.question}
              </h3>
            </summary>
            <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-slate-500 dark:text-slate-400">{item.answer}</p>
          </details>
        ))}
      </div>
      <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
        TSA checkpoint travel numbers:{' '}
        <a
          href="https://www.tsa.gov/travel/passenger-volumes"
          className="underline hover:text-slate-600 dark:hover:text-slate-300"
          target="_blank"
          rel="noreferrer"
        >
          tsa.gov/travel/passenger-volumes
        </a>
      </p>
    </section>
  );
}
