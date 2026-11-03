import type { FAQItem } from './FAQ';
import { PRODUCT_NAME } from '../brand';

/** Shared FAQ about the free consumer product, not a historical rename notice. */
export const ABOUT_FAQ_ITEMS: FAQItem[] = [{
  question: 'Do I need an account to use Gapless?',
  answer: `No. ${PRODUCT_NAME} works without an account. You can plan time off and manage your PTO in this browser. Review dates and settings before you share a planning link.`,
}];
