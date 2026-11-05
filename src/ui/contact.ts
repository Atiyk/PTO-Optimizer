/**
 * Consumer contact addresses. One inbox, two prefilled subjects; no form backend, no
 * account. The bug-report body is a fixed template of optional prompts: it never carries
 * the URL, plan inputs, balances or anything else from the page, so nothing personal is
 * sent unless the person types it.
 */
export const CONTACT_EMAIL = 'gaplessreminders@gmail.com';

export const CONTACT_MAILTO = `mailto:${CONTACT_EMAIL}?subject=Gapless%20Contact`;

export const BUG_REPORT_BODY = [
  'What happened?',
  '',
  '',
  'What did you expect to happen?',
  '',
  '',
  'Steps to reproduce (optional):',
  '1. ',
  '',
  'Device and browser (optional):',
  '',
].join('\n');

export const BUG_REPORT_MAILTO = `mailto:${CONTACT_EMAIL}?subject=Gapless%20Bug%20Report&body=${encodeURIComponent(BUG_REPORT_BODY)}`;
