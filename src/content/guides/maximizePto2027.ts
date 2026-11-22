import type { Guide } from './types.ts';
import { usPlanHref, weekdaysBetween } from './planLink.ts';

const FOUR_BREAKS = [
  ...weekdaysBetween('2027-07-06', '2027-07-09'),
  ...weekdaysBetween('2027-09-07', '2027-09-10'),
  ...weekdaysBetween('2027-11-22', '2027-11-24'), '2027-11-26',
  ...weekdaysBetween('2027-12-27', '2027-12-30'),
];

export const MAXIMIZE_PTO_2027: Guide = {
  id: 'maximize-pto-2027',
  title: 'How to maximize PTO in 2027: the US dates that turn 4 days into 9',
  metaTitle: 'How to maximize PTO in 2027 (US): every long weekend',
  description: 'Every 2027 US federal holiday, the PTO days to book around each one, and a plan that turns 16 PTO days into 37 days off. Dates checked against OPM.',
  summary: 'In 2027, five US federal holidays fall on a Monday. Four PTO days after each one give you 9 days off in a row. Four PTO days between Christmas (observed Fri Dec 24) and New Year’s (observed Fri Dec 31) give you 10. Book four of those breaks and 16 PTO days become 37 days off.',
  published: '2026-11-22',
  updated: '2026-11-22',
  country: 'US',
  group: 'plan',
  body: `
## The 2027 federal holidays

| Holiday | Date in 2027 | Day |
|---|---|---|
| New Year’s Day | Jan 1 | Friday |
| Martin Luther King Jr. Day | Jan 18 | Monday |
| Presidents’ Day | Feb 15 | Monday |
| Memorial Day | May 31 | Monday |
| Juneteenth (observed) | Jun 18 | Friday |
| Independence Day (observed) | Jul 5 | Monday |
| Labor Day | Sep 6 | Monday |
| Columbus Day / Indigenous Peoples’ Day | Oct 11 | Monday |
| Veterans Day | Nov 11 | Thursday |
| Thanksgiving | Nov 25 | Thursday |
| Christmas Day (observed) | Dec 24 | Friday |
| New Year’s Day 2028 (observed) | Dec 31 | Friday |

Three 2027 holidays land on a weekend, so the federal calendar moves them to the nearest weekday. Juneteenth (Saturday Jun 19) is observed on Friday Jun 18. July 4 is a Sunday, so the holiday is Monday Jul 5. Christmas is a Saturday, so it’s observed on Friday Dec 24.

New Year’s Day 2028 is also a Saturday. Federal workers get it on Friday Dec 31, 2027, which gives the 2027 federal calendar two New Year’s holidays. Many private employers skip the Dec 31 date, so check your company’s holiday list before you plan around it.

Private employers set their own holidays. Most give New Year’s Day, Memorial Day, July 4, Labor Day, Thanksgiving and Christmas. Fewer give MLK Day, Presidents’ Day, Juneteenth, Columbus Day or Veterans Day.

## The best days to book in 2027

| Book these PTO days | PTO days | Days off in a row |
|---|---|---|
| Tue Jan 19 to Fri Jan 22 (after MLK Day) | 4 | Sat Jan 16 to Sun Jan 24: 9 |
| Tue Feb 16 to Fri Feb 19 (after Presidents’ Day) | 4 | Sat Feb 13 to Sun Feb 21: 9 |
| Tue Jun 1 to Fri Jun 4 (after Memorial Day) | 4 | Sat May 29 to Sun Jun 6: 9 |
| Mon Jun 14 to Thu Jun 17 (before Juneteenth) | 4 | Sat Jun 12 to Sun Jun 20: 9 |
| Tue Jul 6 to Fri Jul 9 (after July 4) | 4 | Sat Jul 3 to Sun Jul 11: 9 |
| Tue Sep 7 to Fri Sep 10 (after Labor Day) | 4 | Sat Sep 4 to Sun Sep 12: 9 |
| Mon Nov 22 to Wed Nov 24, and Fri Nov 26 (Thanksgiving) | 4 | Sat Nov 20 to Sun Nov 28: 9 |
| Mon Dec 27 to Thu Dec 30 (Christmas to New Year’s) | 4 | Fri Dec 24 to Sun Jan 2: 10 |

If your company gives the day after Thanksgiving, the Thanksgiving week costs 3 PTO days. If it doesn’t observe Fri Dec 31, the Christmas week costs 5.

For one long summer trip, book the two weeks between Juneteenth and July 4, Mon Jun 21 to Fri Jul 2. That’s 10 PTO days for 18 days off in a row, from Fri Jun 18 to Mon Jul 5. [The summer guide](/guides/summer-2027-long-weekends) has the longer versions.

## Plans for 10, 16 and 20 PTO days

### 10 PTO days: two full weeks and two long weekends

Book Memorial Day week (4 PTO days) and Christmas week (4). That’s 19 days off. Spend the last 2 days on Fri Jul 2 and Fri Sep 3, which make July 4 and Labor Day into 4-day weekends. Total: 27 days off.

### 16 PTO days: four 9- or 10-day breaks

Book the weeks of July 4, Labor Day, Thanksgiving and Christmas. You get 37 days off, with a long break every two or three months in the second half of the year.

> [Open the 16-day plan in the planner](${usPlanHref(FOUR_BREAKS)}). Switch off any holiday your company doesn’t give, add your own company holidays, and the plan updates as you type.

### 20 PTO days: one long trip and three breaks

Take the 18-day Juneteenth to July 4 stretch (10 PTO days), then Labor Day week (4), Thanksgiving week (4) and Wed Dec 29 to Thu Dec 30 (2). With Fri Dec 31 observed, those last two days give Dec 29 to Jan 2 off. That’s 18 + 9 + 9 + 5 = 41 days off.

## Why some headlines say 15 PTO days make 54 days off

The math behind those headlines works. Book 15 single Fridays and Mondays next to weekends and holidays, and the planner’s “Most days off” style also finds 54. Most of those days are weekends you already had, though, and 15 three-day weekends isn’t what most people mean by a vacation. The plans above put the same PTO into fewer, longer breaks. If you’d rather have many short breaks, pick “Frequent long weekends” in the planner.

## Before you book

- **Check your company holiday list.** Everything above assumes the federal calendar. The planner starts with every federal holiday on, and you can switch off the ones you don’t get.
- **Ask early for the popular weeks.** July 4, Thanksgiving and Christmas weeks go first on most teams. If your notice period is two weeks, Christmas week needs a request by Mon Dec 13, 2027 at the latest.
- **Check your accrual.** If you earn PTO each pay period, you may not have 4 days banked by January. Turn on accrual in the planner and it schedules a break only after you’ve earned the days. [How PTO accrual works](/guides/how-pto-accrual-works).
- **Expect busier travel on holiday weeks.** The planner flags breaks it estimates fall in busier travel weeks.
`,
  faq: [
    {
      question: 'What are the best days to take off in 2027?',
      answer: 'The best 2027 bookings are the four weekdays after each Monday holiday (MLK Day, Presidents’ Day, Memorial Day, July 4 observed, Labor Day) and Dec 27 to 30. Each gives 9 or 10 days off for 4 PTO days.',
    },
    {
      question: 'How many days off can 15 PTO days give in 2027?',
      answer: 'Fifteen PTO days give about 40 days off in 2027 if you book three holiday weeks (July 4, Labor Day, Christmas) and three long weekends. Booking 15 single Fridays and Mondays can reach 54, but most of that is weekends you already had.',
    },
    {
      question: 'Is New Year’s Day 2028 a holiday on Dec 31, 2027?',
      answer: 'For federal workers, yes. January 1, 2028 is a Saturday, so the federal holiday is observed on Friday, December 31, 2027. Many private employers don’t observe it, so check your company holiday list.',
    },
    {
      question: 'When is Christmas observed in 2027?',
      answer: 'Christmas Day 2027 is a Saturday, so the federal holiday is observed on Friday, December 24, 2027. Booking Monday to Thursday, Dec 27 to 30, then gives 10 days off in a row for 4 PTO days.',
    },
    {
      question: 'When is July 4 observed in 2027?',
      answer: 'July 4, 2027 is a Sunday, so the federal holiday is observed on Monday, July 5. Four PTO days, Tuesday Jul 6 to Friday Jul 9, give 9 days off from Saturday Jul 3 to Sunday Jul 11.',
    },
    {
      question: 'What is the longest break 10 PTO days can give in 2027?',
      answer: 'Ten PTO days from Monday Jun 21 to Friday Jul 2, 2027 give 18 days off in a row. The break runs from Juneteenth (observed Friday Jun 18) to the observed July 4 holiday on Monday Jul 5.',
    },
  ],
  sources: [
    { label: 'U.S. Office of Personnel Management: federal holidays', url: 'https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/' },
    { label: 'Nager.Date public holiday data (the planner’s holiday source)', url: 'https://date.nager.at/' },
  ],
  action: { href: usPlanHref(FOUR_BREAKS), label: 'Open the 2027 plan' },
  related: ['summer-2027-long-weekends', 'thanksgiving-christmas-2027-pto', 'pto-expiring-end-of-year'],
};
