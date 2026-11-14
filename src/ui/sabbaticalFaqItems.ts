import type { FAQItem } from './FAQ';

// Phase 6: exported (same reasoning as FAQ.tsx's own ITEMS) so /sabbatical's own FAQPage
// JSON-LD and the consolidated /faq page both read this ONE array - previously these four
// questions only existed inline inside Sabbatical.tsx's own component, with no structured
// data and no path for /faq to show them without a second, drifting copy.
export const SABBATICAL_FAQ_ITEMS: FAQItem[] = [
  {
    question: 'When is the best time to take a sabbatical?',
    answer:
      'Right before a public holiday or a cluster of them, such as late December. Weekends and holidays next to the sabbatical add days off for free, so the same number of weeks covers more days. The sabbatical planner ranks start dates by total days off.',
  },
  {
    question: 'Can I add PTO days to a sabbatical?',
    answer:
      'Often, yes. Many employers let you add ordinary PTO to a sabbatical to make it longer. Whether yours does depends on your employer’s policy, so check before you count on it.',
  },
  {
    question: 'How long do sabbaticals usually run?',
    answer:
      'Anywhere from a few weeks to several months, depending on the employer and industry. There is no single standard, so the sabbatical planner lets you set any length.',
  },
  {
    question: 'Can my added PTO days land before my eligibility date?',
    answer:
      'Yes. Added PTO days are ordinary PTO, not part of the sabbatical, so they can fall before your eligibility date. The planner puts each one on whichever side adds more days off, and the summary says how many go before and after.',
  },
];
