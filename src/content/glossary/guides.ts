/**
 * Practical, non-jurisdictional learning guides. These are rendered on the existing
 * prerendered /glossary/:id routes; no new router or SEO-only content path.
 * Examples are hypothetical employer policies, not statements of legal entitlement.
 */
export interface PracticalGuide {
  termId: string;
  title: string;
  answer: string;
  steps: readonly string[];
  example: { setup: string; calculation: string; result: string };
  mistakes: readonly string[];
  hrQuestions: readonly string[];
  action: { href: '/policy' | '/pto'; label: string };
  caveat: string;
}

export const PRACTICAL_GUIDES: readonly PracticalGuide[] = [
  {
    termId: 'pto',
    title: 'How to read your PTO policy',
    answer: 'Find your leave type, balance, earning schedule, reset date, and approval rules before you plan a trip. Each detail can change the number of days you can use.',
    steps: [
      'Check whether vacation and sick leave share one balance or have separate rules.',
      'Find the date your plan year starts, when days are added, and any balance cap.',
      'Check how much notice is needed and who approves requests.',
      'Ask whether unused days carry over or have an expiration date.',
    ],
    example: {
      setup: 'An example handbook gives 15 vacation days each year, starting January 1, with a 5-day carryover cap.',
      calculation: 'If you have 8 unused days at the reset, the stated cap would carry 5 and leave 3 subject to the plan rules.',
      result: 'Confirm how the cap works before you plan. Local law may change what an employer can require.',
    },
    mistakes: ['Treating sick leave as vacation days.', 'Assuming all public holidays are company days off.', 'Assuming a displayed balance is already approved for a trip.'],
    hrQuestions: ['Is this one PTO bank or several?', 'When does my balance reset?', 'Which holidays do we actually observe?'],
    action: { href: '/policy', label: 'Check your policy and balance' },
    caveat: 'This is a reading checklist, not a legal review. Your employer policy and local rules determine what applies.',
  },
  {
    termId: 'accrual',
    title: 'How to forecast the PTO you will earn',
    answer: 'Accrued PTO is earned over time. Your available balance on a future date can differ from the annual allowance shown in your offer letter.',
    steps: [
      'Start with the balance as of a known date.',
      'Find the rate and timing of each credit: monthly, per pay period, or per hour worked.',
      'Count only credits earned by your chosen future date.',
      'Subtract time off that will actually be taken, and check any cap or reset.',
    ],
    example: {
      setup: 'You have 4 days now. Your example policy adds 1.25 days at each month end. You want a balance after four credits.',
      calculation: '4 starting + (1.25 × 4 months) = 9 days, before any leave or cap.',
      result: 'Nine days is a forecast, not a promise. A cap, reset, unpaid leave, or different credit date could change it.',
    },
    mistakes: ['Counting a full year of days before earning them.', 'Counting the same approved leave twice.', 'Ignoring a cap that pauses new credits.'],
    hrQuestions: ['On which date does each credit post?', 'Does accrual change during unpaid leave?', 'What happens when I reach the balance cap?'],
    action: { href: '/policy', label: 'Forecast my balance' },
    caveat: 'The numbers are illustrative. Use your own accrual method and confirm any waiting period or policy cap.',
  },
  {
    termId: 'carryover',
    title: 'What happens to unused PTO at year end?',
    answer: 'Carryover is the amount of unused time you may keep after a plan reset. A cap and an expiration date are different rules, so check both.',
    steps: [
      'Find your plan reset date. It may not be January 1.',
      'Check the maximum amount that can carry into the new period.',
      'Check whether carried days expire earlier than newly earned days.',
      'Compare your forecast unused balance with the carryover rule, then plan any at-risk time.',
    ],
    example: {
      setup: 'Your example policy has a 5-day carryover limit and you expect 12 unused days at reset.',
      calculation: '12 unused − 5 carried = 7 days above the stated cap.',
      result: 'Seven days may be at risk under that policy. Do not assume they can lawfully be forfeited in your jurisdiction.',
    },
    mistakes: ['Treating the annual reset as the same thing as a carryover deadline.', 'Ignoring an earlier expiry for old carried days.', 'Assuming all locations allow use-it-or-lose-it rules.'],
    hrQuestions: ['What is our exact plan reset date?', 'Do carried days have a separate expiration?', 'Are there local rules that limit forfeiture?'],
    action: { href: '/policy', label: 'Check my expiration risk' },
    caveat: 'Local employment law may restrict forfeiture. This example does not decide whether days can legally expire.',
  },
  {
    termId: 'company-holiday',
    title: 'Public holidays versus employer days off',
    answer: 'A public holiday on a calendar does not always mean you are off work. Use your employer-observed dates when counting how many PTO days a break costs.',
    steps: [
      'Check the employer holiday calendar for the year you want to travel.',
      'Confirm which dates are observed when a public holiday falls on a weekend.',
      'Remove dates your employer does not observe, and add company-only closures.',
      'Recalculate your plan with your real workweek and holiday choices.',
    ],
    example: {
      setup: 'A public holiday is on Sunday. Your employer says it will close on Monday too.',
      calculation: 'If Monday is an observed day off, a Tuesday–Friday request costs 4 PTO days instead of 5 for a Monday–Friday workweek.',
      result: 'If Monday is not observed by your employer, it may cost a fifth PTO day.',
    },
    mistakes: ['Assuming every public holiday is paid leave.', 'Using the holiday date instead of the observed closure.', 'Forgetting local or regional holidays.'],
    hrQuestions: ['Which holidays are paid days off for my team?', 'What is our substitute-day rule?', 'Do office and shift workers follow the same calendar?'],
    action: { href: '/pto', label: 'Adjust my employer holidays' },
    caveat: 'Timebower starts with public holiday data. Your employer calendar is the final planning assumption.',
  },
  {
    termId: 'notice-period',
    title: 'When should I request time off?',
    answer: 'Notice is how early your employer asks you to request leave. It is not the same as approval, so keep both dates and statuses clear.',
    steps: [
      'Find the required notice period and whether it counts calendar or workdays.',
      'Work backward from the first day you want off.',
      'Check any blackout dates or team coverage requirements.',
      'Submit your request and track whether it is pending, approved, or denied.',
    ],
    example: {
      setup: 'Your example policy asks for 14 calendar days of notice. You want your first day off on July 20.',
      calculation: 'July 20 minus 14 calendar days is July 6.',
      result: 'July 6 is the latest date under this simplified rule. A policy using business days or earlier cutoff times differs.',
    },
    mistakes: ['Treating a submitted request as approved.', 'Counting calendar days when the policy means workdays.', 'Waiting until after a booking to check team coverage.'],
    hrQuestions: ['Is notice counted in calendar or workdays?', 'Who approves requests?', 'How are urgent or last-minute requests handled?'],
    action: { href: '/pto', label: 'Plan dates and track a request' },
    caveat: 'Your employer sets its request workflow, subject to any applicable local requirements.',
  },
  {
    termId: 'payout',
    title: 'What could unused PTO be worth if you leave?',
    answer: 'An unused balance is not automatically a cash payment. Any payout can depend on the type of leave, your work location, the policy, and how you leave.',
    steps: [
      'Separate vacation or general PTO from sick leave and other categories.',
      'Confirm your unused balance on the departure date, including earned credits and scheduled leave.',
      'Check the employer payout policy and the official labor rules where you work.',
      'If payout applies, use your gross daily or hourly pay to make an estimate.',
    ],
    example: {
      setup: 'Suppose a verified policy pays all 6 unused vacation days. Your assumed gross daily rate is $300.',
      calculation: '6 eligible days × $300 per day = $1,800 gross before taxes or other deductions.',
      result: 'The arithmetic is only a scenario. It does not prove that any particular employer must pay $1,800.',
    },
    mistakes: ['Applying vacation payout rules to sick leave.', 'Using a current balance without projecting to the departure date.', 'Treating gross pay as take-home pay.'],
    hrQuestions: ['Which leave types are payable on departure?', 'How is the final unused balance calculated?', 'What official rule or policy governs my payout?'],
    action: { href: '/policy', label: 'Forecast unused PTO first' },
    caveat: 'No jurisdiction-specific payout right is asserted here. Check current official labor guidance before relying on an estimate.',
  },
  {
    termId: 'bridge-day',
    title: 'Turn one PTO day into a longer break',
    answer: 'A bridge day joins a holiday or weekend to another stretch of free time. The right request depends on your actual workweek and observed holidays.',
    steps: [
      'Find a paid company holiday next to a weekend.',
      'Look for a working day between that holiday and the weekend.',
      'Check whether taking that day off makes one continuous break.',
      'Compare the resulting calendar days off with the PTO cost in your plan.',
    ],
    example: {
      setup: 'Your employer gives you Thursday off, and you normally do not work Saturday or Sunday.',
      calculation: 'Request Friday: Thursday + Friday + Saturday + Sunday = 4 consecutive calendar days off for 1 PTO day.',
      result: 'This works only if Thursday is really an employer-observed day off and Friday is a normal workday.',
    },
    mistakes: ['Counting a public holiday that your employer does not observe.', 'Assuming a weekend is free when you work shifts.', 'Ignoring a notice period or blackout dates.'],
    hrQuestions: ['Do we observe the Thursday holiday?', 'Are there blackout dates near that weekend?', 'How far in advance should I ask for Friday?'],
    action: { href: '/pto', label: 'Find my best bridge days' },
    caveat: 'The optimizer uses your selected workweek, holidays and constraints. Verify the dates with your employer.',
  },
  {
    termId: 'pto-request',
    title: 'Keep planned, requested and approved leave separate',
    answer: 'A proposed trip, a submitted request and approved leave are not the same thing. Tracking each stage keeps your forecast and calendar useful.',
    steps: [
      'Save the dates you are considering without marking them approved.',
      'Submit the request using your employer process.',
      'Record the response and update the dates if the plan changes.',
      'When leave is taken, check that the final balance counts it once.',
    ],
    example: {
      setup: 'You have 10 PTO days. You request a 3-day trip, but approval is still pending.',
      calculation: 'Confirmed available before that trip: 10 days. If approved and taken: 10 − 3 = 7 days, before new accrual.',
      result: 'Keep the pending request visible as a scenario, not as a guaranteed deduction.',
    },
    mistakes: ['Treating pending as approved.', 'Leaving canceled requests in the confirmed forecast.', 'Deducting the same trip from both starting balance and future leave.'],
    hrQuestions: ['Where do I check approval status?', 'When is my balance actually deducted?', 'Can I change or cancel an approved request?'],
    action: { href: '/pto', label: 'Plan and track a request' },
    caveat: 'Timebower is a personal tracker. It does not send requests to your employer or confirm approval.',
  },
];

export function findPracticalGuide(termId: string): PracticalGuide | undefined {
  return PRACTICAL_GUIDES.find((guide) => guide.termId === termId);
}
