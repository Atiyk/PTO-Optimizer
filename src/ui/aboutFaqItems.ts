import type { FAQItem } from './FAQ';
import { PRODUCT_NAME } from '../brand';

/** Shared FAQ about the free consumer product, not a historical rename notice. */
export const ABOUT_FAQ_ITEMS: FAQItem[] = [{
  question: 'Do I need an account to use Timebower?',
  answer: `No. ${PRODUCT_NAME} works without an account. You can plan time off and manage your PTO in this browser. If you want reminder emails, you can sign in with just your email address, and delete it in one click. Review dates and settings before you share a planning link.`,
}];
