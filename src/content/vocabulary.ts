/**
 * Stage 2D vocabulary standard (see docs/VOCABULARY.md) — the chosen word per concept, and
 * the banned alternatives that must never appear in our own UI copy. A banned word is still
 * valid as a glossary alias (Stage 3A); it's only forbidden in strings WE write for the
 * interface itself.
 */
export const VOCABULARY: { concept: string; use: string; banned: string[] }[] = [
  { concept: 'the bank of days this site plans', use: 'PTO', banned: ['annual leave', 'holiday allowance'] },
  { concept: 'a day added to the balance over time', use: 'accrual', banned: ['rollover accrual'] },
  { concept: "a day that doesn't carry forward", use: 'carryover', banned: ['rollover', 'roll-over', 'carry forward'] },
  { concept: 'losing days at reset', use: 'forfeited', banned: ['use-it-or-lose-it', 'lapsed', 'expired days'] },
  { concept: 'a single-day employer holiday the employer picks', use: 'floating holiday', banned: ['personal holiday', 'flex holiday'] },
  { concept: 'the date balances reset', use: 'reset date', banned: ['plan-year end'] },
  { concept: 'the maximum balance you can hold', use: 'accrual cap', banned: ['balance cap', 'PTO ceiling'] },
  { concept: 'days blocked from being requested', use: 'blackout period', banned: ['blackout dates', 'restricted period'] },
  { concept: 'how far ahead you must ask', use: 'notice period', banned: ['lead time', 'advance notice'] },
  { concept: 'a bank with no fixed number of days', use: 'unlimited PTO', banned: ['flexible PTO', 'discretionary PTO'] },
  { concept: 'money paid out for unused days on leaving', use: 'payout', banned: ['cash-out'] },
  { concept: 'time away with no accrual and no pay', use: 'unpaid leave', banned: ['LOA'] },
  // F29: one word for the result. "PTO days" stays the word for the cost.
  { concept: 'every calendar day you are not working: weekends, holidays and PTO days', use: 'days off', banned: ['calendar days off', 'days away', 'calendar days away'] },
];

const BANNED_WORDS = VOCABULARY.flatMap((v) => v.banned);

/** Returns every banned word found inside `text`, case-insensitively. Used by the lint test
 * below and, later, as a check over new /policy and glossary copy as it's written. */
export function findBannedVocabulary(text: string): string[] {
  const lower = text.toLowerCase();
  return BANNED_WORDS.filter((word) => lower.includes(word.toLowerCase()));
}
