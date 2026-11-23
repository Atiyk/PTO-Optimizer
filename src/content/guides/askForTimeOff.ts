import type { Guide } from './types.ts';

export const ASK_FOR_TIME_OFF: Guide = {
  id: 'how-to-ask-for-time-off',
  title: 'How to ask for time off: 3 email templates and when to send them',
  metaTitle: 'How to ask for time off: email templates that get a yes',
  description: 'When to ask for PTO, what to include so your manager can approve it quickly, and three copy-ready templates: a short request, a long trip and a holiday week.',
  summary: 'Ask for time off in writing, as early as your notice period allows, and list every working day you’ll be out. Say who covers your work and what will be done before you leave. Ask for popular holiday weeks months ahead, because many teams approve requests in the order they arrive.',
  published: '2026-11-22',
  updated: '2026-11-22',
  country: 'US',
  group: 'basics',
  body: `
## Before you ask

- **Check your balance.** Make sure you’ll have the days on the date the break starts, not just today. If you accrue PTO each paycheck, [check what you’ll have earned](/guides/how-pto-accrual-works).
- **Check your notice period.** Many handbooks ask for two weeks’ notice for a week off, and more for longer trips.
- **Check blackout periods.** Some teams don’t allow PTO during a launch, a busy season or the last weeks of a quarter.
- **Check the team calendar.** If two people already have the same week off, expect a harder conversation.

## What to include

- The exact dates, with each working day listed by weekday. “Mon Jun 21 to Fri Jul 2, 10 working days” is easier to approve than “the last two weeks of June.”
- The number of PTO days you’re using.
- Who covers your work, and what you’ll finish before you go.
- Whether you’ll be reachable. “I won’t be checking email” is a fine answer for a vacation.

The planner’s request panel lists every PTO day by weekday and copies a ready-to-send request for any break.

## Template 1: a short request

> Hi [name], I’d like to take PTO on [Fri Jul 2], which makes a four-day weekend with July 4. [Project] will be done by Thursday, and [colleague] can cover [task]. Does that work for you?

## Template 2: a long trip

> Hi [name], I’d like to request PTO from [Mon Jun 21] to [Fri Jul 2], 10 working days. I’m asking now to give the team plenty of notice. Before I leave I’ll finish [project] and hand [task] to [colleague], and I’ll write up anything open. I won’t be checking email while I’m away. Can we talk about anything that would make these dates hard for the team?

## Template 3: a holiday week

> Hi [name], I’d like to take Mon Dec 27 to Thu Dec 30, 4 working days, between the Christmas and New Year’s holidays. I know that week is popular, so I wanted to ask early. If the team needs coverage, I’m happy to work [another date] or set up [coverage plan].

## If the answer is no

Ask what would make it work: different dates, a shorter break, or a coverage plan you set up. If the issue is a blackout period, ask when it ends and book the first week after it. If days are about to be forfeited at your reset date because a request was refused, ask for the carryover in writing.

## After it’s approved

- Get the approval in writing, or in your HR system, before you book travel.
- Put the dates in your team calendar. The planner can download the break as a calendar file.
- Set an out-of-office message a day before you leave.
`,
  faq: [
    {
      question: 'How far in advance should I ask for time off?',
      answer: 'Follow your notice period first; many handbooks ask for two weeks for a week off. For popular weeks like Thanksgiving, Christmas or July 4, ask months ahead, because many teams approve requests in the order they arrive.',
    },
    {
      question: 'What should a PTO request email include?',
      answer: 'A PTO request should list the exact dates, each working day by weekday, the number of PTO days used, who covers your work, and what you’ll finish before you leave. Keep it to a few sentences.',
    },
    {
      question: 'Do I have to give a reason for taking PTO?',
      answer: 'Usually not for vacation PTO; “personal time” or “a vacation” is enough at most companies. Some policies ask for a reason for sick leave or for leave beyond your balance. Your handbook says which applies.',
    },
    {
      question: 'Can my employer deny a PTO request?',
      answer: 'In most US workplaces, yes. Employers can deny vacation requests for business reasons, such as coverage or a blackout period. Protected leave, like FMLA leave or some state sick leave, follows separate rules.',
    },
    {
      question: 'Should I ask for time off by email or in person?',
      answer: 'Do both if you can. Mention it in a one-on-one, then send the dates in writing or through your HR system, so there’s a record of the request and the approval.',
    },
  ],
  sources: [
    { label: 'U.S. Department of Labor: vacation leave', url: 'https://www.dol.gov/general/topic/workhours/vacation_leave' },
    { label: 'U.S. Department of Labor: Family and Medical Leave Act', url: 'https://www.dol.gov/agencies/whd/fmla' },
  ],
  action: { href: '/pto', label: 'Plan a break and copy the request' },
  related: ['maximize-pto-2027', 'thanksgiving-christmas-2027-pto', 'how-pto-accrual-works'],
};
