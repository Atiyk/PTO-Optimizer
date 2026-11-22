import type { Guide } from './types.ts';
import { usPlanHref } from './planLink.ts';

export const PTO_ACCRUAL: Guide = {
  id: 'how-pto-accrual-works',
  title: 'How PTO accrual works, with the math for every pay schedule',
  metaTitle: 'How PTO accrual works: PTO per paycheck, explained',
  description: 'How much PTO you earn each paycheck on weekly, biweekly, semimonthly and monthly pay, how accrual caps work, and when you can afford a week off.',
  summary: 'PTO accrual means you earn time off gradually instead of getting it all on day one. Divide your yearly PTO by your number of paychecks: 15 days a year on biweekly pay is 120 hours ÷ 26, or about 4.62 hours per paycheck. At that rate, a 4-day break needs about seven paychecks of accrual.',
  published: '2026-11-22',
  updated: '2026-11-22',
  country: 'US',
  group: 'basics',
  body: `
## The basic formula

PTO per paycheck = yearly PTO ÷ paychecks per year.

Work in hours if your pay stub shows hours. A full-time day is usually 8 hours, so 15 days is 120 hours.

| Pay schedule | Paychecks a year | 10 days (80 h) | 15 days (120 h) | 20 days (160 h) |
|---|---|---|---|---|
| Weekly | 52 | 1.54 h | 2.31 h | 3.08 h |
| Biweekly | 26 | 3.08 h | 4.62 h | 6.15 h |
| Semimonthly | 24 | 3.33 h | 5.00 h | 6.67 h |
| Monthly | 12 | 6.67 h | 10.00 h | 13.33 h |

Biweekly and semimonthly sound alike but differ. Biweekly is every other week, 26 paychecks. Semimonthly is twice a month, often on the 15th and the last day, 24 paychecks.

## Per hour worked

Some employers, especially for hourly and part-time staff, accrue PTO per hour worked. A common rate is 1 hour of PTO for every 30 hours worked. California’s paid sick leave law uses the same minimum rate for sick leave. At 40 hours a week, 1 hour per 30 is about 69 hours a year, roughly 8.7 days.

## Front-loaded PTO

Some employers grant the whole year’s PTO at the start of the plan year instead of accruing it. That’s often called front-loaded PTO. You can book a January trip on day one, but if you leave mid-year, some policies take back the days you hadn’t yet earned from your final pay. Check the policy before you rely on it.

## When can you afford a week off?

With accrual, the question is whether you’ll have earned the days by the time the break starts.

Take 15 days a year on biweekly pay, starting Jan 1 with a zero balance. You earn about 4.62 hours per paycheck. A 4-day break, 32 hours, needs seven paychecks, which takes you to early April. The 2027 Memorial Day week (4 PTO days for 9 days off, starting May 29) fits. The MLK Day week in January doesn’t.

Some policies let you borrow against future accrual, which is a negative balance. Others don’t. Ask before you book a break you haven’t earned yet.

> [Turn on accrual in the planner](${usPlanHref([], { budget: 15, extra: { ac: '1', am: '1.25' } })}) and it only schedules breaks once you’ve earned the days.

## Accrual caps and carryover

An accrual cap is the most PTO you can hold. When your balance reaches it, you stop earning until you take time off. Some policies set the cap at 1.5 times your yearly PTO, which is 22.5 days on a 15-day plan.

A carryover cap is different. It limits how much unused PTO moves into the next plan year. Days above it are forfeited at the reset date, unless your state doesn’t allow that. [PTO expiring at the end of the year](/guides/pto-expiring-end-of-year) covers what to do.

## Waiting periods

Many employers start accrual on day one but don’t let new hires use PTO until after a waiting period, often 60 or 90 days. The days still count. They just can’t be booked yet.

## Check your own numbers

Your pay stub usually shows your balance and the hours earned that period. The [policy calculator](/policy) projects your balance for any future date from your accrual rate, pay schedule, cap and reset date, so you can see what you’ll have before you ask for time off.
`,
  faq: [
    {
      question: 'How much PTO do I earn per paycheck?',
      answer: 'Divide your yearly PTO hours by your paychecks per year. Fifteen days (120 hours) on biweekly pay is 120 ÷ 26, about 4.62 hours per paycheck. On semimonthly pay it’s 5 hours, and on monthly pay it’s 10 hours.',
    },
    {
      question: 'What is the difference between accrued and front-loaded PTO?',
      answer: 'Accrued PTO is earned gradually, usually each paycheck. Front-loaded PTO is granted all at once at the start of the plan year. Front-loaded days can be used immediately, but some policies recover unearned days if you leave.',
    },
    {
      question: 'What happens when I hit my PTO accrual cap?',
      answer: 'You stop earning PTO until your balance drops below the cap. If the cap is 22.5 days and you have 22.5 days, you earn nothing more until you take time off. The days you already have stay yours.',
    },
    {
      question: 'How many hours of PTO is 1 hour per 30 hours worked?',
      answer: 'At 40 hours a week for 52 weeks, 1 hour per 30 hours worked gives about 69 hours a year, roughly 8.7 eight-hour days. Part-time schedules earn proportionally less at the same rate.',
    },
    {
      question: 'Can I use PTO before I accrue it?',
      answer: 'Only if your policy allows a negative balance, which some employers call borrowing or advancing PTO. Many don’t. Ask HR before booking a break that starts before you’ve earned the days.',
    },
  ],
  sources: [
    { label: 'California Department of Industrial Relations: paid sick leave FAQ', url: 'https://www.dir.ca.gov/dlse/paid_sick_leave.htm' },
    { label: 'U.S. Department of Labor: vacation leave', url: 'https://www.dol.gov/general/topic/workhours/vacation_leave' },
  ],
  action: { href: '/policy', label: 'Project your PTO balance' },
  related: ['pto-expiring-end-of-year', 'maximize-pto-2027', 'how-to-ask-for-time-off'],
};
