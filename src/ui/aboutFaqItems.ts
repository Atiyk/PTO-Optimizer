import type { FAQItem } from './FAQ';
import { PRODUCT_NAME } from '../brand';

/** Shared FAQ about the free consumer product, not a historical rename notice. */
export const ABOUT_FAQ_ITEMS: FAQItem[] = [{
  question: 'Do I need an account to use Timebower?',
  answer: `No. ${PRODUCT_NAME} is free, and every plan works signed out. Signed out, your plans and PTO records stay in this browser. Sign in with an email address only if you want reminder emails. You can delete the account in one click.`,
}];
