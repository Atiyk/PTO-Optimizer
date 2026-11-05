import type { FAQItem } from './FAQ';

// One array, read by /family's own FAQ section, its FAQPage JSON-LD (scripts/prerender.ts)
// and the consolidated /faq page, so the three can never drift apart.
export const FAMILY_FAQ_ITEMS: FAQItem[] = [
  {
    question: 'Where do the school district calendars come from?',
    answer:
      'Each preset is copied by hand from the district’s own published calendar, and the planner shows the official source link, the school year and the date it was last checked. It is a short list, not a directory of every district, and districts change dates (weather makeup days, board revisions). Check your own school’s calendar, and add or remove dates if anything differs.',
  },
  {
    question: 'What happens to a photo or screenshot of the school calendar?',
    answer:
      'It is read on your device. The text recognition runs in your browser from files this site hosts itself, the image is never uploaded, and it is released from memory as soon as the text has been read. Only the dates you tick in the review list are added; the photo, the recognised text and the snippets shown next to each date are never stored or put in the link.',
  },
  {
    question: 'What does a “Share with family” link contain?',
    answer:
      'Only dates. You choose whether to include the school closure dates, your available days, or both. The link never contains your PTO balance, your employer, names, notes, or the text of anything you imported. Anyone who has the link can see those dates.',
  },
  {
    question: 'Why does it say coverage is partial?',
    answer:
      'The planner only knows the school dates you added. A date that is not in the list is unknown, not a confirmed school day, so it never calls your year fully covered, only says that no gaps were found in the dates you added. Early-release days, teacher training days you did not add, and sick days are not included.',
  },
  {
    question: 'How does it choose which breaks to take off?',
    answer:
      'It spends your PTO where it buys the most days with your kids: for each school break it finds the best run of consecutive working days to take off, then picks the combination across breaks that adds up to the most days together without going over the PTO you set. Switch a break off and the days move to the others straight away.',
  },
];
