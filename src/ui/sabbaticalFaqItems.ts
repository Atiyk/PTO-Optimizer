import type { FAQItem } from './FAQ';

// Phase 6: exported (same reasoning as FAQ.tsx's own ITEMS) so /sabbatical's own FAQPage
// JSON-LD and the consolidated /faq page both read this ONE array - previously these four
// questions only existed inline inside Sabbatical.tsx's own component, with no structured
// data and no path for /faq to show them without a second, drifting copy.
export const SABBATICAL_FAQ_ITEMS: FAQItem[] = [
  {
    question: 'When is the best time to take a sabbatical?',
    answer:
      'The placements above rank windows by how many holidays and weekends sit inside or next to the block - a sabbatical started right before a public holiday or a cluster of them buys more total time away for the same number of weeks off.',
  },
  {
    question: 'Can I add PTO days to a sabbatical?',
    answer:
      'Often, yes - many employers allow combining ordinary PTO with a sabbatical to extend it. Whether yours does depends entirely on your own employer’s policy; check before counting on it.',
  },
  {
    question: 'How long do sabbaticals usually run?',
    answer:
      'Lengths vary widely by employer and industry, from a few weeks to several months - there’s no single standard, so this tool lets you set any length rather than assuming one.',
  },
  {
    question: 'Can my added PTO days land before my eligibility date?',
    answer:
      'Yes - PTO days are ordinary PTO, not part of the sabbatical itself, so they can fall before the date you become eligible to start the sabbatical block. The solver places each added day on whichever side of the block buys the most total time off, and the hero above always says which: "N before, M after."',
  },
];
