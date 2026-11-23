import type { Guide } from './types.ts';
import { usPlanHref, weekdaysBetween } from './planLink.ts';

const JUNE_JULY = weekdaysBetween('2027-06-21', '2027-07-02');
const FOUR_WEEKS = [
  ...weekdaysBetween('2027-06-14', '2027-06-17'),
  ...weekdaysBetween('2027-06-21', '2027-07-02'),
  ...weekdaysBetween('2027-07-06', '2027-07-09'),
];

export const SUMMER_2027: Guide = {
  id: 'summer-2027-long-weekends',
  title: 'Summer 2027 long weekends: Memorial Day, Juneteenth, July 4 and Labor Day',
  metaTitle: 'Summer 2027 long weekends and the PTO to book (US)',
  description: 'Memorial Day, Juneteenth, July 4 and Labor Day 2027 dates, the PTO days to book around each, and how 10 PTO days become 18 days off in a row.',
  summary: 'US summer 2027 has four federal holidays: Memorial Day (Mon May 31), Juneteenth (observed Fri Jun 18), Independence Day (observed Mon Jul 5) and Labor Day (Mon Sep 6). Juneteenth and July 4 fall two weeks apart, so 10 PTO days between them give 18 days off in a row.',
  published: '2026-11-22',
  updated: '2026-11-22',
  country: 'US',
  group: 'plan',
  body: `
## Summer 2027 holiday dates

| Holiday | 2027 date | Long weekend |
|---|---|---|
| Memorial Day | Mon May 31 | Sat May 29 to Mon May 31 |
| Juneteenth (observed) | Fri Jun 18 | Fri Jun 18 to Sun Jun 20 |
| Independence Day (observed) | Mon Jul 5 | Sat Jul 3 to Mon Jul 5 |
| Labor Day | Mon Sep 6 | Sat Sep 4 to Mon Sep 6 |

Juneteenth falls on a Saturday in 2027 and July 4 on a Sunday, so the federal holidays move to Friday Jun 18 and Monday Jul 5. Not every private employer gives Juneteenth. If yours doesn’t, the June options below cost one more PTO day.

## One PTO day: four-day weekends

| Book | Days off |
|---|---|
| Fri May 28 | Fri May 28 to Mon May 31: 4 |
| Thu Jun 17 | Thu Jun 17 to Sun Jun 20: 4 |
| Fri Jul 2 | Fri Jul 2 to Mon Jul 5: 4 |
| Fri Sep 3 | Fri Sep 3 to Mon Sep 6: 4 |

Four PTO days spent this way give you a four-day weekend every month of the summer, 16 days off in all.

## Four PTO days: a 9-day week off

| Book | Days off in a row |
|---|---|
| Tue Jun 1 to Fri Jun 4 | Sat May 29 to Sun Jun 6: 9 |
| Mon Jun 14 to Thu Jun 17 | Sat Jun 12 to Sun Jun 20: 9 |
| Tue Jul 6 to Fri Jul 9 | Sat Jul 3 to Sun Jul 11: 9 |
| Tue Sep 7 to Fri Sep 10 | Sat Sep 4 to Sun Sep 12: 9 |

## Ten PTO days: 18 days off between Juneteenth and July 4

Book the two working weeks from Monday Jun 21 to Friday Jul 2. The break starts on the observed Juneteenth holiday, Friday Jun 18, and ends on the observed July 4 holiday, Monday Jul 5. That’s 18 days off in a row for 10 PTO days.

> [Open the 18-day plan in the planner](${usPlanHref(JUNE_JULY)}). Change any date and the plan recalculates.

## Eighteen PTO days: a month off

Add the week before Juneteenth (Mon Jun 14 to Thu Jun 17) and the week after July 4 (Tue Jul 6 to Fri Jul 9). Eighteen PTO days then give 30 days off, from Saturday Jun 12 to Sunday Jul 11. Few teams approve a month in one request, so ask months ahead and offer a coverage plan.

> [Open the 30-day plan](${usPlanHref(FOUR_WEEKS)}).

## Summer travel is busier around the holidays

July 4 week is one of the busiest travel weeks of the US summer. Early June, after Memorial Day, usually falls before most school summer breaks, and the week after Labor Day falls after most schools have started. The planner flags breaks it estimates fall in busier travel weeks, so you can compare before you book.

If you plan around children’s school dates, the [family planner](/family) lines up PTO with a school district’s breaks.
`,
  faq: [
    {
      question: 'When is Juneteenth observed in 2027?',
      answer: 'Juneteenth, June 19, falls on a Saturday in 2027, so the federal holiday is observed on Friday, June 18. One PTO day on Thursday Jun 17 gives a four-day weekend from Thursday to Sunday.',
    },
    {
      question: 'Is July 4, 2027 on a weekend?',
      answer: 'Yes. July 4, 2027 is a Sunday, so the federal holiday is observed on Monday, July 5. Saturday Jul 3 to Monday Jul 5 is a three-day weekend before any PTO.',
    },
    {
      question: 'How can I get 18 days off in summer 2027?',
      answer: 'Book the ten working days from Monday Jun 21 to Friday Jul 2, 2027. With Juneteenth observed on Friday Jun 18 and July 4 observed on Monday Jul 5, you get 18 days off in a row.',
    },
    {
      question: 'When is Memorial Day 2027?',
      answer: 'Memorial Day 2027 is Monday, May 31. Four PTO days from Tuesday Jun 1 to Friday Jun 4 give 9 days off in a row, from Saturday May 29 to Sunday Jun 6.',
    },
    {
      question: 'When is Labor Day 2027?',
      answer: 'Labor Day 2027 is Monday, September 6. Four PTO days from Tuesday Sep 7 to Friday Sep 10 give 9 days off, from Saturday Sep 4 to Sunday Sep 12.',
    },
  ],
  sources: [
    { label: 'U.S. Office of Personnel Management: federal holidays', url: 'https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/' },
    { label: 'Nager.Date public holiday data (the planner’s holiday source)', url: 'https://date.nager.at/' },
  ],
  action: { href: usPlanHref(JUNE_JULY), label: 'Open the 18-day summer plan' },
  related: ['maximize-pto-2027', 'thanksgiving-christmas-2027-pto', 'how-to-ask-for-time-off'],
};
