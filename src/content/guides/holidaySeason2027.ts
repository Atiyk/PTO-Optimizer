import type { Guide } from './types.ts';
import { usPlanHref, weekdaysBetween } from './planLink.ts';

const THANKSGIVING = [...weekdaysBetween('2027-11-22', '2027-11-24'), '2027-11-26'];
const CHRISTMAS = weekdaysBetween('2027-12-27', '2027-12-30');

export const HOLIDAY_SEASON_2027: Guide = {
  id: 'thanksgiving-christmas-2027-pto',
  title: 'Thanksgiving, Christmas and New Year’s 2027: the PTO days to book',
  metaTitle: 'Christmas and Thanksgiving 2027 PTO: best days to book',
  description: 'Christmas 2027 is observed Fri Dec 24 and New Year’s Day 2028 on Fri Dec 31, so 4 PTO days give 10 days off. Thanksgiving week and Veterans Day too.',
  summary: 'Christmas Day and New Year’s Day 2028 both fall on a Saturday, so the federal holidays are Friday Dec 24 and Friday Dec 31, 2027. Four PTO days, Dec 27 to 30, give 10 days off in a row. Thanksgiving week costs 4 PTO days for 9 days off, or 3 if you get the Friday.',
  published: '2026-11-22',
  updated: '2026-11-22',
  country: 'US',
  group: 'plan',
  body: `
## The late-2027 holiday dates

| Holiday | 2027 date |
|---|---|
| Veterans Day | Thu Nov 11 |
| Thanksgiving | Thu Nov 25 |
| Christmas Day (observed) | Fri Dec 24 (Christmas is Sat Dec 25) |
| New Year’s Day 2028 (observed) | Fri Dec 31 (New Year’s Day is Sat Jan 1) |

The two Friday holidays are federal dates. Private employers handle weekend holidays in different ways: some give the Friday before, some the Monday after, and some give nothing extra. Check your company holiday list for Dec 24 and Dec 31 before you book.

## Christmas to New Year’s

| Your company gives | Book | PTO days | Days off in a row |
|---|---|---|---|
| Fri Dec 24 and Fri Dec 31 | Mon Dec 27 to Thu Dec 30 | 4 | Fri Dec 24 to Sun Jan 2: 10 |
| Fri Dec 24 only | Mon Dec 27 to Fri Dec 31 | 5 | Fri Dec 24 to Sun Jan 2: 10 |

> [Open the Christmas plan in the planner](${usPlanHref(CHRISTMAS, { start: '2027-11-01', end: '2027-12-31' })}). If your company doesn’t give Fri Dec 31, switch it off and the planner shows the 5-day version.

Monday Jan 3, 2028 is an ordinary working day under the federal calendar. If you want a longer break, adding the week before Christmas (Mon Dec 20 to Thu Dec 23) costs 4 more PTO days and makes it 16 days off in a row, from Sat Dec 18 to Sun Jan 2.

## Thanksgiving week

| Your company gives | Book | PTO days | Days off in a row |
|---|---|---|---|
| Thanksgiving only | Mon Nov 22 to Wed Nov 24, and Fri Nov 26 | 4 | Sat Nov 20 to Sun Nov 28: 9 |
| Thanksgiving and the day after | Mon Nov 22 to Wed Nov 24 | 3 | Sat Nov 20 to Sun Nov 28: 9 |

If you only want a long weekend, one PTO day on Fri Nov 26 gives you Thursday to Sunday, 4 days off.

## Veterans Day

If your company gives Veterans Day, one PTO day on Fri Nov 12 makes Thursday Nov 11 to Sunday Nov 14 a 4-day weekend. Most private employers don’t give Veterans Day. The planner starts with it switched on, so switch it off if it’s a working day for you.

## The whole season: 8 PTO days

Book Thanksgiving week (4) and Christmas week (4). You get 19 days off across five weeks: 9 at Thanksgiving and 10 at Christmas.

> [Open the 8-day plan](${usPlanHref([...THANKSGIVING, ...CHRISTMAS], { start: '2027-11-01', end: '2027-12-31' })}).

## Ask early

Christmas week is a popular week to take off, and many teams approve requests in the order they arrive. Check your notice period, then ask in the spring or summer rather than in December. Once you have a plan, the planner can copy a request for your manager with every PTO day listed by weekday. [How to ask for time off](/guides/how-to-ask-for-time-off) has templates.
`,
  faq: [
    {
      question: 'When is Christmas observed in 2027?',
      answer: 'Christmas Day 2027 falls on a Saturday, so the US federal holiday is observed on Friday, December 24, 2027. Private employers may choose Friday Dec 24, Monday Dec 27, or no substitute day.',
    },
    {
      question: 'Is December 31, 2027 a federal holiday?',
      answer: 'Yes. New Year’s Day 2028 falls on a Saturday, so federal workers get Friday, December 31, 2027 off. Many private employers don’t observe that date, so check your company holiday list.',
    },
    {
      question: 'How many PTO days do I need for Christmas to New Year’s 2027?',
      answer: 'Four PTO days, Monday Dec 27 to Thursday Dec 30, if your company gives both Friday Dec 24 and Friday Dec 31. That gives 10 days off, from Friday Dec 24 to Sunday Jan 2, 2028.',
    },
    {
      question: 'When is Thanksgiving 2027?',
      answer: 'Thanksgiving 2027 is Thursday, November 25. Booking Monday to Wednesday Nov 22 to 24, plus Friday Nov 26, gives 9 days off from Saturday Nov 20 to Sunday Nov 28 for 4 PTO days.',
    },
    {
      question: 'Is January 3, 2028 a holiday in the US?',
      answer: 'No. Under the federal calendar, New Year’s Day 2028 is observed on Friday, December 31, 2027, so Monday, January 3, 2028 is an ordinary working day.',
    },
  ],
  sources: [
    { label: 'U.S. Office of Personnel Management: federal holidays', url: 'https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/' },
    { label: 'Nager.Date public holiday data (the planner’s holiday source)', url: 'https://date.nager.at/' },
  ],
  action: { href: usPlanHref([...THANKSGIVING, ...CHRISTMAS], { start: '2027-11-01', end: '2027-12-31' }), label: 'Open the holiday-season plan' },
  related: ['maximize-pto-2027', 'how-to-ask-for-time-off', 'pto-expiring-end-of-year'],
};
