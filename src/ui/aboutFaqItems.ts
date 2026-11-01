import type { FAQItem } from './FAQ';
import { FORMER_NAME, PRODUCT_NAME } from '../brand';

// Redesign Phase 0: questions about the product itself rather than either tool - shown on
// /faq and included in that page's FAQPage JSON-LD, the same single-array pattern as
// FAQ.tsx's ITEMS and SABBATICAL_FAQ_ITEMS. The rename entry is the one place on the site
// the former name is meant to appear (besides "formerly ..." mentions).
export const ABOUT_FAQ_ITEMS: FAQItem[] = [
  {
    question: `Is this the site that used to be called ${FORMER_NAME}?`,
    answer: `Yes. ${FORMER_NAME} is now ${PRODUCT_NAME}. Your old links still work: every address and every shared plan link opens exactly the same plan as before.`,
  },
];
