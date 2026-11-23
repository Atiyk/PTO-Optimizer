import type { Guide } from './types.ts';
import { usPlanHref, weekdaysBetween } from './planLink.ts';

const DEC_2026 = weekdaysBetween('2026-12-28', '2026-12-31');

export const PTO_EXPIRING: Guide = {
  id: 'pto-expiring-end-of-year',
  title: 'PTO expiring at the end of the year? What to check, and how to use it',
  metaTitle: 'Use it or lose it PTO: what to do before your reset date',
  description: 'Check your carryover cap and your state’s rules, then turn leftover PTO into the longest break. This December, 4 PTO days give 10 days off.',
  summary: 'Unused PTO is forfeited at your reset date only if your policy says so and your state allows it. California, Colorado and Montana don’t allow employers to take away earned vacation. Check your carryover cap first. If days will be forfeited, book them next to a holiday: this December, 4 PTO days from Dec 28 to 31 give 10 days off.',
  published: '2026-11-22',
  updated: '2026-11-22',
  country: 'US',
  group: 'basics',
  body: `
## Check whether your days are at risk

A policy where unused PTO is forfeited at the reset date is often called “use it or lose it.” Before you rush to book, look in your handbook or HR portal for four things.

- **Carryover cap.** Many policies let you carry some days into the new plan year, often 5 days or 40 hours. With 7 days left and a 5-day cap, only 2 days are at risk.
- **Reset date.** Most plans reset on January 1. Some reset on your hire anniversary or at the start of a fiscal year, and some give you until March 31 to use carried-over days.
- **Payout.** Some employers pay for unused days at the reset date, or once a year on request.
- **Donation.** Some employers let you give unused days to a leave bank for colleagues.

If the policy doesn’t say, ask HR in writing: “How many PTO days can I carry into next year, and when do carried-over days have to be used?”

> [The policy calculator](/policy) estimates your balance on any date from your accrual rate, carryover cap and reset date.

## Your state may not allow it

State law can override the policy. California, Colorado and Montana don’t allow employers to take away vacation you’ve already earned, although an employer can cap how much you accrue. In several other states, including Iowa, Nebraska and Rhode Island, the law is unclear. Most other states allow a forfeiture policy if the employer states it clearly in writing.

This is general information, not legal advice. If a large balance is at stake, check your state labor department’s page or ask an employment lawyer.

## If your days will be forfeited this December

Christmas Day 2026 and New Year’s Day 2027 both fall on a Friday, so 8 PTO days cover 16 days off in a row.

| Book | PTO days | Days off in a row |
|---|---|---|
| Mon Dec 28 to Thu Dec 31 | 4 | Fri Dec 25 to Sun Jan 3: 10 |
| Mon Dec 21 to Thu Dec 24 | 4 | Sat Dec 19 to Sun Dec 27: 9 |
| Both weeks | 8 | Sat Dec 19 to Sun Jan 3: 16 |
| Thu Dec 31 only | 1 | Thu Dec 31 to Sun Jan 3: 4 |

This assumes your company gives Christmas Day and New Year’s Day, as most do. Christmas Eve is a working day for most US employers, so it counts as a PTO day above.

> [Open the Dec 28 to 31 plan in the planner](${usPlanHref(DEC_2026, { start: '2026-12-01', end: '2027-01-03' })}). Change the number of PTO days and the dates update as you type.

With only one or two days to use, book single Fridays or Mondays before your reset date. Each one turns a weekend into three days off.

## Ask now

The last two weeks of December are popular, and many teams approve requests in the order they arrive. If your notice period is two weeks, a request for Dec 28 has to go in by Monday Dec 14 at the latest.

A short request that usually works:

> Hi [name], I have [4] PTO days that will be forfeited on Dec 31. I’d like to take Dec 28 to 31. I’ll have [project] wrapped up by the 23rd, and [colleague] has agreed to cover [task]. Does that work?

If the answer is no because of coverage, ask for one of three things: a different week before the reset date, a written exception to carry the days over, or a payout. Each is a fair request when the policy is what put the days at risk.

## Plan next year in January

Expiring PTO is easier to avoid with a plan made early in the year. In 2027, five federal holidays fall on a Monday, and four PTO days around each give 9 days off. [How to maximize PTO in 2027](/guides/maximize-pto-2027) lists every date.
`,
  faq: [
    {
      question: 'Can my employer take away PTO I didn’t use?',
      answer: 'In most US states, yes, if the written policy says unused PTO is forfeited at the reset date. California, Colorado and Montana don’t allow employers to take away vacation already earned. Check your state labor department’s page.',
    },
    {
      question: 'What is a PTO carryover cap?',
      answer: 'A carryover cap is the most unused PTO you can move into the next plan year. A common cap is 5 days or 40 hours. Days above the cap are forfeited at the reset date unless the policy offers a payout.',
    },
    {
      question: 'What should I do with PTO I’m about to lose in December 2026?',
      answer: 'Book it next to a holiday. Christmas Day 2026 and New Year’s Day 2027 fall on Fridays, so four PTO days, Monday Dec 28 to Thursday Dec 31, give 10 days off from Dec 25 to Jan 3.',
    },
    {
      question: 'Do employers have to pay out unused PTO?',
      answer: 'It depends on your state and your policy. Some states require a payout of earned vacation when you leave a job, and some employers pay out unused days at the reset date. No federal law requires a payout.',
    },
    {
      question: 'How do I find my PTO reset date?',
      answer: 'Look in your employee handbook or HR portal under PTO or vacation policy. Most plans reset on January 1, but some reset on your hire anniversary or at the start of the fiscal year. If it’s unclear, ask HR in writing.',
    },
  ],
  sources: [
    { label: 'Mercer: state laws that limit vacation forfeitures', url: 'https://www.mercer.com/insights/law-and-policy/state-laws-limit-vacation-forfeitures/' },
    { label: 'U.S. Department of Labor: vacation leave', url: 'https://www.dol.gov/general/topic/workhours/vacation_leave' },
  ],
  action: { href: '/policy', label: 'Check your balance and reset date' },
  related: ['maximize-pto-2027', 'how-pto-accrual-works', 'how-to-ask-for-time-off'],
};
