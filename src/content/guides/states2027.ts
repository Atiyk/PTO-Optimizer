import type { Guide } from './types.ts';
import { usPlanHref } from './planLink.ts';

/**
 * State guides. State holiday lists apply to state government employees; private employers
 * set their own calendars. Every state date and law statement here is from the official
 * source listed on the page (checked Nov 22, 2026). Bookings are checked in guides.test.ts.
 */

const planFor = (code: string) => usPlanHref([], { budget: 15, extra: { sd: code } });

const FEDERAL_NOTE = 'If you work for a private company, start from the federal calendar in [How to maximize PTO in 2027](/guides/maximize-pto-2027): most private employers follow it more closely than the state list.';

export const CALIFORNIA_2027: Guide = {
  id: 'pto-2027-california',
  title: 'California PTO in 2027: state holidays, best days to book, and the rules on unused PTO',
  metaTitle: 'California PTO 2027: state holidays and PTO law',
  description: 'California’s 2027 state holidays, the PTO days to book around them, and why California employers can’t take away vacation you’ve earned.',
  summary: 'California has 11 state holidays in 2027, including Cesar Chavez Day (Wed Mar 31) and the day after Thanksgiving (Fri Nov 26). Christmas falls on a Saturday, and California gives state workers holiday credit instead of a weekday off. California law also bans forfeiting earned vacation: PTO counts as vacation and must be paid out when you leave.',
  published: '2026-11-22',
  updated: '2026-11-22',
  country: 'US',
  group: 'state',
  state: { name: 'California', code: 'US-CA' },
  body: `
## California state holidays in 2027

| Holiday | 2027 date |
|---|---|
| New Year’s Day | Fri Jan 1 |
| Martin Luther King Jr. Day | Mon Jan 18 |
| Presidents’ Day | Mon Feb 15 |
| Cesar Chavez Day | Wed Mar 31 |
| Memorial Day | Mon May 31 |
| Independence Day (observed) | Mon Jul 5 |
| Labor Day | Mon Sep 6 |
| Veterans Day | Thu Nov 11 |
| Thanksgiving | Thu Nov 25 |
| Day after Thanksgiving | Fri Nov 26 |
| Christmas Day | Sat Dec 25 (holiday credit) |

These are the holidays for California state employees. When a state holiday falls on a Sunday, it moves to Monday, so July 4 is observed on Mon Jul 5. When one falls on a Saturday, state employees get holiday credit to use later instead of a Friday off. That applies to Christmas Day 2027 and to New Year’s Day 2028.

Juneteenth (Jun 19) and Native American Day (Fri Sep 24, 2027) are optional holidays: most state employees can take one of them instead of the floating holiday they’d otherwise get.

${FEDERAL_NOTE}

## Best days to book in California

| Book | PTO days | Days off in a row |
|---|---|---|
| Mon Mar 29, Tue Mar 30, Thu Apr 1, Fri Apr 2 (around Cesar Chavez Day) | 4 | Sat Mar 27 to Sun Apr 4: 9 |
| Mon Nov 22 to Wed Nov 24 (with the day after Thanksgiving off) | 3 | Sat Nov 20 to Sun Nov 28: 9 |
| Fri Nov 12 (after Veterans Day) | 1 | Thu Nov 11 to Sun Nov 14: 4 |
| Mon Dec 27 to Fri Dec 31 (no weekday Christmas holiday) | 5 | Sat Dec 25 to Sun Jan 2: 9 |

## California’s rules on unused PTO

California is one of the few states where earned vacation can’t be taken away. The state labor commissioner’s office calls a policy that forfeits earned vacation “an illegal policy under California law.” A PTO bank that combines vacation and sick days follows the same rules.

- **No forfeiture.** Vacation is earned as you work, and earned days stay yours.
- **Caps are allowed.** An employer can set an accrual cap, so you stop earning once your balance reaches it.
- **Payout when you leave.** Unused vacation must be paid at your final rate of pay, whatever the reason you leave.
- **Waiting periods are allowed** if they’re genuine: a new hire may earn no vacation for an initial period.

If you’re near your accrual cap, plan a break before you hit it, or the days you would have earned are lost. [How PTO accrual works](/guides/how-pto-accrual-works) explains caps.

> [Open the planner with California selected](${planFor('US-CA')}).
`,
  faq: [
    {
      question: 'Is use it or lose it PTO legal in California?',
      answer: 'No. California’s labor commissioner treats earned vacation as wages that can’t be forfeited, and PTO counts as vacation. Employers may cap accrual instead, which stops new PTO from building up once you reach the cap.',
    },
    {
      question: 'Is Cesar Chavez Day a holiday in California in 2027?',
      answer: 'Yes, for California state employees. Cesar Chavez Day 2027 is Wednesday, March 31. Most private employers don’t give it, so check your company holiday list.',
    },
    {
      question: 'Do California state workers get a day off when Christmas falls on Saturday?',
      answer: 'No weekday off. When a California state holiday falls on a Saturday, state employees receive holiday credit to use later. Christmas Day 2027 and New Year’s Day 2028 both fall on Saturdays.',
    },
    {
      question: 'Does California require PTO payout when you quit?',
      answer: 'Yes. Under California Labor Code section 227.3, earned and unused vacation or PTO must be paid at your final rate of pay when employment ends, whether you quit or are let go.',
    },
  ],
  sources: [
    { label: 'CalHR: state holidays', url: 'https://www.calhr.ca.gov/about-calhr/divisions-programs/personnel-management/leave-benefits/state-holidays/' },
    { label: 'California Labor Commissioner: vacation FAQ', url: 'https://www.dir.ca.gov/dlse/faq_vacation.htm' },
  ],
  action: { href: planFor('US-CA'), label: 'Plan 2027 in California' },
  related: ['maximize-pto-2027', 'pto-expiring-end-of-year', 'how-pto-accrual-works'],
};

export const TEXAS_2027: Guide = {
  id: 'pto-2027-texas',
  title: 'Texas PTO in 2027: state holidays, best days to book, and the rules on unused PTO',
  metaTitle: 'Texas PTO 2027: state holidays and PTO payout rules',
  description: 'Texas’s 2027 national, state and optional holidays, the PTO days to book around them, and when a Texas employer has to pay out unused PTO.',
  summary: 'Texas state employees get the national holidays plus state holidays including Texas Independence Day (Tue Mar 2), San Jacinto Day (Wed Apr 21), LBJ Day (Fri Aug 27), the day after Thanksgiving and Christmas Eve (Fri Dec 24). For private employers, Texas law requires a PTO payout only if the written policy promises one.',
  published: '2026-11-22',
  updated: '2026-11-22',
  country: 'US',
  group: 'state',
  state: { name: 'Texas', code: 'US-TX' },
  body: `
## Texas holidays in 2027

| Holiday | 2027 date | Type |
|---|---|---|
| New Year’s Day | Fri Jan 1 | National |
| Martin Luther King Jr. Day | Mon Jan 18 | National |
| Confederate Heroes Day | Tue Jan 19 | State |
| Presidents’ Day | Mon Feb 15 | National |
| Texas Independence Day | Tue Mar 2 | State |
| Good Friday | Fri Mar 26 | Optional |
| San Jacinto Day | Wed Apr 21 | State |
| Memorial Day | Mon May 31 | National |
| Emancipation Day | Sat Jun 19 | State |
| Independence Day | Sun Jul 4 | National |
| Lyndon Baines Johnson Day | Fri Aug 27 | State |
| Labor Day | Mon Sep 6 | National |
| Veterans Day | Thu Nov 11 | National |
| Thanksgiving | Thu Nov 25 | National |
| Day after Thanksgiving | Fri Nov 26 | State |
| Christmas Eve | Fri Dec 24 | State |
| Christmas Day | Sat Dec 25 | National |
| December 26 | Sun Dec 26 | State |

These holidays are set by Texas Government Code section 662.003 for state employees. On state holidays, agencies stay open with skeleton crews, and on national holidays they close. Rosh Hashanah and Yom Kippur are optional holidays along with Good Friday. The state auditor’s 2027 schedule gives no weekday off for Emancipation Day or Independence Day, which fall on a weekend.

${FEDERAL_NOTE}

## Best days to book in Texas

| Book | PTO days | Days off in a row |
|---|---|---|
| Mon Nov 22 to Wed Nov 24 (with the day after Thanksgiving off) | 3 | Sat Nov 20 to Sun Nov 28: 9 |
| Mon Dec 27 to Fri Dec 31 (with Christmas Eve off) | 5 | Fri Dec 24 to Sun Jan 2: 10 |
| Thu Aug 26 (before LBJ Day) | 1 | Thu Aug 26 to Sun Aug 29: 4 |
| Mon Mar 1 (before Texas Independence Day) | 1 | Sat Feb 27 to Tue Mar 2: 4 |

## Texas rules on unused PTO

Texas has no law that requires paid vacation, and no law that bans forfeiting it. The written policy decides.

- **Payout only if promised.** The Texas Workforce Commission says a payout of unused leave is required under the Texas Payday Law “only if such a payment is promised by the employer.” If no policy promises it, nothing is owed.
- **Forfeiture is allowed** when the written policy says so, including at separation.
- **Leave can’t count as notice.** Under the Commission’s guidance, a policy can’t count paid or unpaid leave toward a required resignation notice period.

Read your handbook for the words “payout” and “forfeited” before you resign or before your reset date. [PTO expiring at the end of the year](/guides/pto-expiring-end-of-year) covers what to do if days are at risk.

> [Open the planner with Texas selected](${planFor('US-TX')}).
`,
  faq: [
    {
      question: 'Does Texas require employers to pay out unused PTO?',
      answer: 'Only if the employer’s written policy or agreement promises it. The Texas Workforce Commission says a payout is required under the Texas Payday Law only when the employer promised one. Without that promise, nothing is owed.',
    },
    {
      question: 'Is use it or lose it PTO legal in Texas?',
      answer: 'Yes. Texas has no law against it, so an employer’s written policy can say unused PTO is forfeited at the reset date or when you leave. Check your handbook for the exact rule.',
    },
    {
      question: 'Is Christmas Eve a holiday in Texas in 2027?',
      answer: 'Yes, for Texas state employees. December 24 is a Texas state holiday, and in 2027 it falls on a Friday. Private employers decide for themselves whether to give it.',
    },
    {
      question: 'When is LBJ Day 2027?',
      answer: 'Lyndon Baines Johnson Day is a Texas state holiday on August 27. In 2027 it falls on a Friday. State agencies stay open with skeleton crews on state holidays.',
    },
  ],
  sources: [
    { label: 'Texas Government Code section 662.003: holidays', url: 'https://texas.public.law/statutes/tex._gov%27t_code_section_662.003' },
    { label: 'Texas State Auditor’s Office: 2027 holiday schedule', url: 'https://hr.sao.texas.gov/Documents/Holidays/Holidays2027.pdf' },
    { label: 'Texas Workforce Commission: accrued leave payouts', url: 'https://efte.twc.texas.gov/accrued_leave_payouts.html' },
  ],
  action: { href: planFor('US-TX'), label: 'Plan 2027 in Texas' },
  related: ['maximize-pto-2027', 'pto-expiring-end-of-year', 'thanksgiving-christmas-2027-pto'],
};

export const NEW_YORK_2027: Guide = {
  id: 'pto-2027-new-york',
  title: 'New York PTO in 2027: state holidays, best days to book, and the rules on unused PTO',
  metaTitle: 'New York PTO 2027: state holidays and PTO rules',
  description: 'New York State’s 2027 legal holidays, including Lincoln’s Birthday and Election Day, the PTO days to book around them, and New York’s rules on forfeited PTO.',
  summary: 'New York State employees get Lincoln’s Birthday (Fri Feb 12), Columbus Day (Mon Oct 11) and Election Day (Tue Nov 2) on top of the federal holidays. Lincoln’s Birthday and Presidents’ Day make Feb 12 to 15 a four-day weekend. For private employers, New York allows forfeiting PTO only if the conditions were given to employees in writing.',
  published: '2026-11-22',
  updated: '2026-11-22',
  country: 'US',
  group: 'state',
  state: { name: 'New York', code: 'US-NY' },
  body: `
## New York State holidays in 2027

| Holiday | 2027 date |
|---|---|
| New Year’s Day | Fri Jan 1 |
| Martin Luther King Jr. Day | Mon Jan 18 |
| Lincoln’s Birthday | Fri Feb 12 |
| Washington’s Birthday (observed) | Mon Feb 15 |
| Memorial Day | Mon May 31 |
| Juneteenth | Sat Jun 19 (holiday leave credit) |
| Independence Day (observed) | Mon Jul 5 |
| Labor Day | Mon Sep 6 |
| Columbus Day | Mon Oct 11 |
| Election Day | Tue Nov 2 |
| Veterans’ Day | Thu Nov 11 |
| Thanksgiving | Thu Nov 25 |
| Christmas Day | Sat Dec 25 (holiday leave credit) |

This is the Department of Civil Service calendar for state employees. Juneteenth and Christmas Day fall on a Saturday in 2027, and no weekday replaces them. Employees who work Monday to Friday earn holiday leave to use later instead. In 2027, Lincoln’s Birthday is a floating holiday for some bargaining units, and Election Day hadn’t been designated a floating holiday when the calendar was published.

${FEDERAL_NOTE}

## Best days to book in New York

| Book | PTO days | Days off in a row |
|---|---|---|
| Tue Feb 16 to Fri Feb 19 (after Lincoln’s Birthday and Presidents’ Day) | 4 | Fri Feb 12 to Sun Feb 21: 10 |
| Fri Oct 8 (before Columbus Day) | 1 | Fri Oct 8 to Mon Oct 11: 4 |
| Mon Nov 1 (before Election Day) | 1 | Sat Oct 30 to Tue Nov 2: 4 |

The February break lines up with New York City public schools’ midwinter recess, Mon Feb 15 to Fri Feb 19, 2027. The [family planner](/family?c=US&d=nyc-doe-2026-27) lines up PTO with the whole NYC school calendar.

## New York’s rules on unused PTO

- **Forfeiture needs written notice.** The New York State Department of Labor says an employer can set conditions under which accrued vacation is lost, but only if it told employees those conditions in writing.
- **No written forfeiture policy means payout.** If you’ve earned vacation and there’s no written policy saying it’s forfeited, the employer must pay it.
- **Employers must share the policy.** New York requires employers to give employees their vacation policy in writing or post it.

> [Open the planner with New York selected](${planFor('US-NY')}).
`,
  faq: [
    {
      question: 'Is Lincoln’s Birthday a holiday in New York in 2027?',
      answer: 'Yes, for New York State employees. Lincoln’s Birthday 2027 is Friday, February 12, and Washington’s Birthday is Monday, February 15, so state workers get a four-day weekend. Some bargaining units have it as a floating holiday.',
    },
    {
      question: 'Is Election Day 2027 a holiday in New York?',
      answer: 'Election Day, Tuesday November 2, 2027, is on New York State’s calendar of legal holidays for state employees. Private employers don’t have to give it, though New York law gives voters time off to vote in some cases.',
    },
    {
      question: 'Can a New York employer take away unused vacation?',
      answer: 'Only if the employer told employees in writing the conditions under which accrued vacation is forfeited. Without a written forfeiture policy, earned vacation must be paid, according to the New York State Department of Labor.',
    },
    {
      question: 'Do New York state workers get Christmas Eve off in 2027?',
      answer: 'No. Christmas Day 2027 is a Saturday, and New York gives state employees holiday leave credit instead of a weekday off. Christmas Eve, Friday December 24, is not on the state calendar.',
    },
  ],
  sources: [
    { label: 'NYS Department of Civil Service: 2027 legal holidays', url: 'https://www.cs.ny.gov/attendance_leave/2027_legal_holidays.cfm' },
    { label: 'NYS Department of Labor: wages and hours FAQ', url: 'https://dol.ny.gov/wages-and-hours-frequently-asked-questions' },
  ],
  action: { href: planFor('US-NY'), label: 'Plan 2027 in New York' },
  related: ['maximize-pto-2027', 'pto-expiring-end-of-year', 'how-to-ask-for-time-off'],
};

export const FLORIDA_2027: Guide = {
  id: 'pto-2027-florida',
  title: 'Florida PTO in 2027: state holidays, best days to book, and the rules on unused PTO',
  metaTitle: 'Florida PTO 2027: state holidays and PTO rules',
  description: 'Florida’s nine 2027 state holidays, the PTO days to book around them, and why your written policy decides what happens to unused PTO in Florida.',
  summary: 'Florida state employees get nine paid holidays in 2027, including the day after Thanksgiving, plus one floating holiday. Florida moves Saturday holidays to Friday, so Christmas is observed Fri Dec 24 and New Year’s Day 2028 on Fri Dec 31. Florida has no law on PTO payout or forfeiture: your employer’s written policy decides.',
  published: '2026-11-22',
  updated: '2026-11-22',
  country: 'US',
  group: 'state',
  state: { name: 'Florida', code: 'US-FL' },
  body: `
## Florida state holidays in 2027

| Holiday | 2027 date |
|---|---|
| New Year’s Day | Fri Jan 1 |
| Martin Luther King Jr. Day | Mon Jan 18 |
| Memorial Day | Mon May 31 |
| Independence Day (observed) | Mon Jul 5 |
| Labor Day | Mon Sep 6 |
| Veterans’ Day | Thu Nov 11 |
| Thanksgiving | Thu Nov 25 |
| Day after Thanksgiving | Fri Nov 26 |
| Christmas Day (observed) | Fri Dec 24 |
| New Year’s Day 2028 (observed) | Fri Dec 31 |

These are the paid holidays in Florida Statutes section 110.117 for state employees, who also get one floating holiday a year. Presidents’ Day and Juneteenth aren’t on the list. When a holiday falls on a Saturday, Florida observes the Friday before. When it falls on a Sunday, Florida observes the Monday after.

${FEDERAL_NOTE}

## Best days to book in Florida

| Book | PTO days | Days off in a row |
|---|---|---|
| Mon Dec 27 to Thu Dec 30 (Christmas to New Year’s) | 4 | Fri Dec 24 to Sun Jan 2: 10 |
| Mon Nov 22 to Wed Nov 24 (with the day after Thanksgiving off) | 3 | Sat Nov 20 to Sun Nov 28: 9 |
| Fri Nov 12 (after Veterans’ Day) | 1 | Thu Nov 11 to Sun Nov 14: 4 |

Florida state employees can get 19 days off in late 2027 for 7 PTO days, using the Thanksgiving and Christmas breaks above.

## Florida’s rules on unused PTO

Florida has no state law on vacation pay, and federal law doesn’t require paid vacation either. That leaves the written policy in charge.

Your employer owes a payout of unused PTO when you leave only if the policy or your contract promises one. Days can be forfeited at the reset date if the policy says so, and the carryover cap is whatever the policy sets.

Read your handbook before your reset date. [PTO expiring at the end of the year](/guides/pto-expiring-end-of-year) covers what to check and how to use days that are at risk.

> [Open the planner with Florida selected](${planFor('US-FL')}).
`,
  faq: [
    {
      question: 'Does Florida require employers to pay out unused PTO?',
      answer: 'No Florida law requires it, and federal law doesn’t either. A Florida employer owes a payout of unused PTO only if its written policy or your contract promises one.',
    },
    {
      question: 'Is Presidents’ Day a Florida state holiday?',
      answer: 'No. Florida Statutes section 110.117 lists nine paid holidays for state employees, and Presidents’ Day isn’t one of them. Juneteenth isn’t on the list either.',
    },
    {
      question: 'Is December 31, 2027 a holiday for Florida state employees?',
      answer: 'Yes. New Year’s Day 2028 falls on a Saturday, and Florida observes Saturday holidays on the preceding Friday, so state employees get Friday, December 31, 2027 off.',
    },
    {
      question: 'Is the day after Thanksgiving a holiday in Florida?',
      answer: 'Yes, for Florida state employees. The Friday after Thanksgiving is one of the nine paid holidays in Florida law. In 2027 that’s Friday, November 26.',
    },
  ],
  sources: [
    { label: 'Florida Statutes section 110.117: paid holidays', url: 'https://www.flsenate.gov/Laws/Statutes/2024/110.117' },
    { label: 'U.S. Department of Labor: vacation leave', url: 'https://www.dol.gov/general/topic/workhours/vacation_leave' },
  ],
  action: { href: planFor('US-FL'), label: 'Plan 2027 in Florida' },
  related: ['maximize-pto-2027', 'thanksgiving-christmas-2027-pto', 'pto-expiring-end-of-year'],
};

export const MASSACHUSETTS_2027: Guide = {
  id: 'pto-2027-massachusetts',
  title: 'Massachusetts PTO in 2027: Patriots’ Day, best days to book, and the rules on unused PTO',
  metaTitle: 'Massachusetts PTO 2027: Patriots’ Day and PTO law',
  description: 'Massachusetts 2027 legal holidays, the April vacation week around Patriots’ Day, and why unused vacation counts as wages under Massachusetts law.',
  summary: 'Patriots’ Day 2027 is Monday, April 19, and 4 PTO days after it give 9 days off. Massachusetts doesn’t move Saturday holidays, so Juneteenth and Christmas 2027 stay on Saturday. Massachusetts treats earned vacation as wages: it must be paid when you leave, and a forfeiture policy needs prior notice and a fair chance to use the days.',
  published: '2026-11-22',
  updated: '2026-11-22',
  country: 'US',
  group: 'state',
  state: { name: 'Massachusetts', code: 'US-MA' },
  body: `
## Massachusetts legal holidays in 2027

| Holiday | 2027 date |
|---|---|
| New Year’s Day | Fri Jan 1 |
| Martin Luther King Jr. Day | Mon Jan 18 |
| Presidents’ Day | Mon Feb 15 |
| Patriots’ Day | Mon Apr 19 |
| Memorial Day | Mon May 31 |
| Juneteenth | Sat Jun 19 |
| Independence Day (observed) | Mon Jul 5 |
| Labor Day | Mon Sep 6 |
| Columbus Day | Mon Oct 11 |
| Veterans Day | Thu Nov 11 |
| Thanksgiving | Thu Nov 25 |
| Christmas Day | Sat Dec 25 |

The Secretary of the Commonwealth lists these as the days state, county and municipal offices close. A holiday that falls on a Sunday is observed on Monday. A Saturday holiday stays on Saturday, so there’s no Friday off for Juneteenth or Christmas in 2027.

${FEDERAL_NOTE}

## Best days to book in Massachusetts

| Book | PTO days | Days off in a row |
|---|---|---|
| Tue Apr 20 to Fri Apr 23 (after Patriots’ Day) | 4 | Sat Apr 17 to Sun Apr 25: 9 |
| Fri Oct 8 (before Columbus Day) | 1 | Fri Oct 8 to Mon Oct 11: 4 |
| Fri Nov 12 (after Veterans Day) | 1 | Thu Nov 11 to Sun Nov 14: 4 |

Many Massachusetts school districts take April vacation in the week of Patriots’ Day, so the April break lines up with school for many parents. Check your district’s calendar, or use the [family planner](/family).

## Massachusetts rules on unused PTO

- **Vacation pay is wages.** Under the Massachusetts Wage Act, vacation an employer has promised counts as wages.
- **Payout when you leave.** Earned, unused vacation is paid in the final paycheck, including after an involuntary discharge.
- **Forfeiture needs notice and a fair chance.** The Attorney General’s advisory calls a policy that forfeits unused vacation “an acceptable variation of an accrual cap,” but only if the employer gives adequate prior notice and employees have a reasonable opportunity to use the time.

> [Open the planner with Massachusetts selected](${planFor('US-MA')}).
`,
  faq: [
    {
      question: 'When is Patriots’ Day 2027?',
      answer: 'Patriots’ Day 2027 is Monday, April 19. It’s a legal holiday in Massachusetts and Maine. Booking Tuesday Apr 20 to Friday Apr 23 gives 9 days off, from Saturday Apr 17 to Sunday Apr 25.',
    },
    {
      question: 'Is use it or lose it PTO legal in Massachusetts?',
      answer: 'It can be. The Massachusetts Attorney General’s advisory allows it only if the employer gives employees adequate prior notice and a reasonable opportunity to use their vacation. Otherwise it may be an illegal forfeiture of wages.',
    },
    {
      question: 'Does Massachusetts require PTO payout when you leave a job?',
      answer: 'Yes, for earned vacation. Massachusetts treats promised vacation pay as wages, so earned, unused vacation must be included in your final pay, including when you are let go.',
    },
    {
      question: 'Is Christmas Eve 2027 a holiday in Massachusetts?',
      answer: 'No. Christmas Day 2027 is a Saturday, and Massachusetts keeps Saturday holidays on Saturday, so state offices don’t close on Friday, December 24.',
    },
  ],
  sources: [
    { label: 'Secretary of the Commonwealth: Massachusetts legal holidays', url: 'https://www.sec.state.ma.us/divisions/cis/holiday-info.htm' },
    { label: 'Mass.gov: Massachusetts law about vacation leave', url: 'https://www.mass.gov/info-details/massachusetts-law-about-vacation-leave' },
    { label: 'Massachusetts Attorney General: advisory on vacation policies', url: 'https://www.mass.gov/doc/attorney-generals-advisory-on-vacation-policies/download' },
  ],
  action: { href: planFor('US-MA'), label: 'Plan 2027 in Massachusetts' },
  related: ['maximize-pto-2027', 'pto-expiring-end-of-year', 'how-pto-accrual-works'],
};

export const STATE_GUIDES: readonly Guide[] = [CALIFORNIA_2027, TEXAS_2027, NEW_YORK_2027, FLORIDA_2027, MASSACHUSETTS_2027];
