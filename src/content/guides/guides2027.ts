/**
 * The 2027 search guides (/2027 and /2027/<slug>). One entry per page. Every number a page
 * prints comes from the functions in guidePlan.ts at render time; the copy here receives
 * those numbers (GuideFacts) instead of restating them, so text and plan cannot disagree.
 *
 * To add a year or a country: add its holiday files to guideHolidays.ts, add entries here,
 * add a dated holiday check like holidayData2027.test.ts against the official source, then
 * run `npx tsx --tsconfig tsconfig.app.json scripts/generate-guide-html.ts` and commit the
 * generated HTML. guides2027.test.ts fails if a guide's year has no holiday file or a plan
 * comes back empty. Content QA checklist: docs/growth/SEO-STRATEGY.md.
 */
import { formatDay, formatRange, joinList, plural, type DateStyle } from './guideFormat';
import {
  ALL_PUBLIC_HOLIDAYS, computeGuidePlan, guideHolidayList, holidayGapFills, holidayWeekends,
  type GapFill, type GuideHoliday, type GuidePlan, type GuideScope, type HolidaySet, type HolidayWeekend, type PlanSpec,
} from './guidePlan';

export type SourceId = 'opm' | 'govuk' | 'govukLeave' | 'nager';

export const SOURCES: Record<SourceId, { label: string; href: string }> = {
  opm: { label: 'U.S. Office of Personnel Management, federal holidays', href: 'https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/' },
  govuk: { label: 'GOV.UK, UK bank holidays', href: 'https://www.gov.uk/bank-holidays' },
  govukLeave: { label: 'GOV.UK, holiday entitlement', href: 'https://www.gov.uk/holiday-entitlement-rights' },
  nager: { label: 'Nager.Date public holiday data (what the planner reads)', href: '/data-sources' },
};

/** An illustrative shorter US list for "what if my employer gives fewer holidays".
 * Not a statistic: the page says so next to every number it produces. */
export const SIX_US_HOLIDAYS: HolidaySet = {
  id: 'six',
  skipped: ['Columbus Day', 'Juneteenth National Independence Day', 'Martin Luther King, Jr. Day', 'Presidents Day', 'Veterans Day'],
};
const SIX_NAMES = "New Year's Day, Memorial Day, Independence Day, Labor Day, Thanksgiving and Christmas";

export interface GuideFacts {
  guide: Guide;
  /** The public holidays /pto starts from for this guide's country, region and year. */
  holidays: GuideHoliday[];
  /** Computed plans, in the order of guide.plans. */
  plans: GuidePlan[];
  weekends: HolidayWeekend[];
  gapFills: GapFill[];
}

export interface GuidePlanConfig extends PlanSpec {
  /** Heading over this plan's table. */
  title: (plan: GuidePlan, f: GuideFacts) => string;
  /** One or two sentences under the heading. */
  note: (plan: GuidePlan, f: GuideFacts) => string;
}

export interface GuideFaq {
  id: string;
  question: string;
  answer: (f: GuideFacts) => string;
}

export interface Guide extends GuideScope {
  /** URL path, no trailing slash. */
  path: string;
  /** Short link text for the hub, the footer and the homepage list. */
  navLabel: string;
  /** <title> before " — Timebower". */
  title: string;
  description: (f: GuideFacts) => string;
  h1: string;
  dateStyle: DateStyle;
  /** "federal holidays" / "bank holidays". */
  holidayWord: string;
  plans: GuidePlanConfig[];
  /** The answer, first thing under the heading. */
  answer: (f: GuideFacts) => string;
  why: (f: GuideFacts) => string[];
  assumptions: (f: GuideFacts) => string[];
  show: { holidayTable?: boolean; longWeekends?: boolean; expiring?: boolean };
  faqs: GuideFaq[];
  /** When the holiday dates and copy were last checked against the sources. */
  lastChecked: string;
  sources: SourceId[];
}

const day = (f: GuideFacts, iso: string) => formatDay(iso, f.guide.dateStyle);
const range = (f: GuideFacts, start: string, end: string) => formatRange(start, end, f.guide.dateStyle);
const longest = (plan: GuidePlan) => plan.breaks.reduce((a, b) => (b.totalDaysOff > a.totalDaysOff ? b : a));
const keptNote = (plan: GuidePlan) => (plan.reserveKept > 0 ? ` It keeps ${plural(plan.reserveKept, 'day')} back for sick days or surprises.` : '');
const usTotal = (f: GuideFacts) => f.holidays.length;
const dec31 = (f: GuideFacts) => f.holidays.some((h) => h.date === `${f.guide.year}-12-31`);
const fourDayWeekends = (f: GuideFacts) => f.weekends.filter((w) => w.withOneDay && w.withOneDay.run.length >= 4);

const US_ASSUMPTIONS = (f: GuideFacts): string[] => [
  `Your employer gives you all ${usTotal(f)} federal holiday dates. Not every employer observes all federal holidays, so check your handbook. On /pto, switch off any holiday you don't get and the plan redraws.`,
  'A Monday-to-Friday week, January 1 to December 31, 2027, nothing booked yet.',
  'Year-round plans start no break in the first three weeks (time to ask) and keep a day or two back. Most-days-off plans do neither.',
];


const HUB: Guide = {
  path: '/2027',
  navLabel: 'Best days to take off in 2027',
  title: 'Best days to take off in 2027 (US)',
  description: (f) => `The 2027 US federal holidays by weekday, the long weekends one PTO day makes, and a full plan: ${f.plans[0].daysOff} days off for ${f.plans[0].ptoUsed} PTO days.`,
  h1: 'Best days to take off in 2027',
  year: 2027,
  country: 'US',
  budget: 15,
  dateStyle: 'US',
  holidayWord: 'federal holidays',
  plans: [
    {
      id: 'federal', style: 'year', holidays: ALL_PUBLIC_HOLIDAYS,
      title: (p) => `${p.daysOff} days off for ${p.ptoUsed} PTO days`,
      note: (p) => `A year-round plan for ${p.budget} PTO days and all ${p.holidays.length} federal holiday dates.${keptNote(p)}`,
    },
    {
      id: 'six', style: 'year', holidays: SIX_US_HOLIDAYS,
      title: (p) => `With six holidays: ${p.daysOff} days off for ${p.ptoUsed} PTO days`,
      note: (p) => `The same ${p.budget} PTO days if your employer gives only ${SIX_NAMES} (${plural(p.holidays.length, 'day')} off in 2027). This list is an example, not an average.`,
    },
  ],
  answer: (f) => {
    const four = fourDayWeekends(f).length;
    return `In 2027, all ${usTotal(f)} US federal holiday dates fall on a Monday, Thursday or Friday, so ${four} of them become four-day weekends for one PTO day each. Spread ${f.plans[0].ptoUsed} of 15 PTO days around them, keeping ${f.plans[0].reserveKept} back, and you get ${f.plans[0].daysOff} days off.`;
  },
  why: (f) => {
    const gap = f.gapFills[0];
    const lines = [
      `Monday and Friday holidays already give a three-day weekend; one PTO day makes it four. Veterans Day and Thanksgiving are Thursdays, so take the Friday after.`,
      'March, April and August have no federal holiday, so a week off there costs five PTO days for nine days off.',
    ];
    if (gap) lines.push(`The best value of the year is between Christmas and New Year. Christmas is observed on ${day(f, gap.holidays[0])} and New Year's Day 2028 on ${day(f, gap.holidays[1])}, so ${plural(gap.ptoDays.length, 'PTO day')} (${range(f, gap.ptoDays[0], gap.ptoDays.at(-1)!)}) give ${gap.run.length} days off in a row, ${formatRange(gap.run.start, gap.run.end, 'US')}.`);
    return lines;
  },
  assumptions: US_ASSUMPTIONS,
  show: { longWeekends: true, expiring: true },
  faqs: [
    {
      id: 'how-many-holidays',
      question: 'How many federal holidays are there in 2027?',
      answer: (f) => `There are 11 federal holidays, observed on ${usTotal(f)} dates in 2027. The extra one is Friday, December 31: New Year's Day 2028 falls on a Saturday.`,
    },
    {
      id: 'christmas-2027',
      question: 'When is Christmas observed in 2027?',
      answer: () => 'On Friday, December 24: Christmas Day 2027 is a Saturday. Juneteenth works the same way, observed Friday, June 18.',
    },
    {
      id: 'best-single-day',
      question: 'Which single PTO days go furthest in 2027?',
      answer: (f) => `Any day next to a holiday weekend: the Friday before a Monday holiday, or the Friday after Veterans Day and Thanksgiving. Each gives four days off. There are ${fourDayWeekends(f).length} such days in 2027.`,
    },
  ],
  lastChecked: '2026-11-22',
  sources: ['opm', 'nager'],
};

const TEN: Guide = {
  path: '/2027/10-pto-days',
  navLabel: 'How to use 10 PTO days in 2027',
  title: 'How to maximize 10 PTO days in 2027',
  description: (f) => `Ten PTO days in 2027 can give ${f.plans[0].daysOff} days off: one day beside each holiday weekend. Dates, the six-holiday version and a plan with one long break.`,
  h1: 'How to maximize 10 PTO days in 2027',
  year: 2027,
  country: 'US',
  budget: 10,
  dateStyle: 'US',
  holidayWord: 'federal holidays',
  plans: [
    {
      id: 'most-days-off', style: 'max', holidays: ALL_PUBLIC_HOLIDAYS,
      title: (p) => `Most days off: ${p.daysOff} days off for ${p.ptoUsed} PTO days`,
      note: (p) => `${plural(p.breaks.length, 'long weekend')}, each one PTO day beside a federal holiday.`,
    },
    {
      id: 'six', style: 'max', holidays: SIX_US_HOLIDAYS,
      title: (p) => `With six holidays: ${p.daysOff} days off for ${p.ptoUsed} PTO days`,
      note: (p) => `If your employer gives only ${SIX_NAMES} (${plural(p.holidays.length, 'day')} off in 2027), fewer PTO days sit next to a holiday, and some become plain three-day weekends. This list is an example, not an average.`,
    },
    {
      id: 'one-long-break', style: 'year', holidays: ALL_PUBLIC_HOLIDAYS,
      title: (p) => `One real break: ${p.daysOff} days off for ${p.ptoUsed} PTO days`,
      note: (p) => `The homepage's year-round style: long weekends through the year and ${longest(p).totalDaysOff} days off in a row at the end of December.${keptNote(p)}`,
    },
  ],
  answer: (f) => {
    const [most, six, long] = f.plans;
    return `Put each PTO day next to a federal holiday weekend. With all ${usTotal(f)} federal holiday dates, 10 PTO days give ${most.daysOff} days off: ${plural(most.breaks.length, 'four-day weekend')}. If your employer gives six holidays, the same 10 days give ${six.daysOff}. If you want one long trip instead, the third plan gives ${long.daysOff} days off with a ${longest(long).totalDaysOff}-day break.`;
  },
  why: (f) => {
    const [most, , long] = f.plans;
    return [
      `Every PTO day in the first plan touches a holiday, so each one adds a weekday to a weekend that was already three days long, or, after a Thursday holiday, joins the holiday to the weekend. That is why ${most.ptoUsed} PTO days return ${most.daysOff} days off.`,
      `The catch is that none of those breaks is longer than four days. The year-round plan trades some of them for ${range(f, longest(long).start, longest(long).end)}, which uses ${plural(longest(long).ptoCost, 'PTO day')}, because Christmas falls on ${day(f, '2027-12-24')} that year.`,
      'If you travel far, the long break matters more than the total.',
    ];
  },
  assumptions: US_ASSUMPTIONS,
  show: {},
  faqs: [
    {
      id: 'ten-days-enough',
      question: 'Is 10 PTO days enough for a real vacation in 2027?',
      answer: (f) => `Yes, if you spend about half of it in one place. The year-round plan here uses ${plural(longest(f.plans[2]).ptoCost, 'PTO day')} for ${longest(f.plans[2]).totalDaysOff} days off over Christmas and keeps the rest for long weekends.`,
    },
    {
      id: 'fewer-holidays',
      question: 'What if my employer gives fewer holidays?',
      answer: (f) => `Fewer holidays means fewer four-day weekends. With six holidays the most-days-off plan drops from ${f.plans[0].daysOff} to ${f.plans[1].daysOff} days off. Open that plan and switch your own holidays on or off.`,
    },
    {
      id: 'when-to-ask',
      question: 'When should I ask for these days?',
      answer: () => 'As early as your notice rules allow, and earlier for days your coworkers are likely to want too, such as the Friday before July 4 or the week of Christmas. The planner shows an ask-by date for each break.',
    },
  ],
  lastChecked: '2026-11-22',
  sources: ['opm', 'nager'],
};

const FIFTEEN: Guide = {
  path: '/2027/15-pto-days',
  navLabel: 'How to use 15 PTO days in 2027',
  title: 'How to maximize 15 PTO days in 2027',
  description: (f) => `A 2027 plan for 15 PTO days: ${f.plans[0].daysOff} days off for ${f.plans[0].ptoUsed} of them, with two longer breaks, the exact dates and a six-holiday version.`,
  h1: 'How to maximize 15 PTO days in 2027',
  year: 2027,
  country: 'US',
  budget: 15,
  dateStyle: 'US',
  holidayWord: 'federal holidays',
  plans: [
    {
      id: 'year-round', style: 'year', holidays: ALL_PUBLIC_HOLIDAYS,
      title: (p) => `${p.daysOff} days off for ${p.ptoUsed} PTO days`,
      note: (p) => `Year-round: long weekends in winter and summer, then two longer breaks.${keptNote(p)}`,
    },
    {
      id: 'six', style: 'year', holidays: SIX_US_HOLIDAYS,
      title: (p) => `With six holidays: ${p.daysOff} days off for ${p.ptoUsed} PTO days`,
      note: (p) => `If your employer gives only ${SIX_NAMES} (${plural(p.holidays.length, 'day')} off in 2027). This list is an example, not an average.`,
    },
    {
      id: 'most-days-off', style: 'max', holidays: ALL_PUBLIC_HOLIDAYS,
      title: (p) => `The biggest total: ${p.daysOff} days off for ${p.ptoUsed} PTO days`,
      note: (p) => `Spends every day on single Fridays and Mondays. ${plural(p.breaks.filter((b) => b.totalDaysOff < 4).length, 'break is', 'breaks are')} only a normal weekend plus one day.`,
    },
  ],
  answer: (f) => {
    const [year, six, most] = f.plans;
    const two = [...year.breaks].sort((a, b) => b.totalDaysOff - a.totalDaysOff).slice(0, 2).sort((a, b) => a.start.localeCompare(b.start));
    return `With 15 PTO days and all ${usTotal(f)} federal holiday dates, a year-round 2027 plan gives ${year.daysOff} days off for ${year.ptoUsed} PTO days, with breaks of ${joinList(two.map((b) => `${b.totalDaysOff} days around ${range(f, b.start, b.end)}`))}. With six holidays it gives ${six.daysOff}. Spending every day on long weekends gives ${most.daysOff}, but no break longer than four days.`;
  },
  why: (f) => {
    const [year] = f.plans;
    const labor = year.breaks.find((b) => b.start <= '2027-09-06' && b.end >= '2027-09-06');
    const lines = [
      'The cheapest days go first: the Friday before Presidents Day and Memorial Day, and the Thursday before Juneteenth (observed Friday, June 18). Each costs one PTO day for four days off.',
    ];
    if (labor) lines.push(`Labor Day is the other end of a week off. ${plural(labor.ptoCost, 'PTO day')} after it give ${labor.totalDaysOff} days off, ${range(f, labor.start, labor.end)}.`);
    lines.push(`Christmas is observed on ${day(f, '2027-12-24')}, so PTO in the days before it joins the holiday weekend. The planner stops at December 31; four more PTO days, December 27 to 30, would run the break to January 2, 2028.`);
    return lines;
  },
  assumptions: US_ASSUMPTIONS,
  show: {},
  faqs: [
    {
      id: 'why-not-all-15',
      question: 'Why does the plan not use all 15 PTO days?',
      answer: (f) => `The year-round style keeps ${plural(f.plans[0].reserveKept, 'day')} back for sick days or surprises. The most-days-off plan below it spends all 15. You can change the reserve in the planner.`,
    },
    {
      id: 'summer',
      question: 'How do I get a week off in summer 2027?',
      answer: () => 'Build it around July 5 (Independence Day, observed) or Labor Day, September 6. Four PTO days next to either one give nine days off in a row.',
    },
    {
      id: 'fewer-holidays',
      question: 'What if my employer gives fewer holidays?',
      answer: (f) => `The total drops a little: ${f.plans[1].daysOff} days off with six holidays instead of ${f.plans[0].daysOff}. Open the six-holiday plan and switch your own holidays on or off.`,
    },
  ],
  lastChecked: '2026-11-22',
  sources: ['opm', 'nager'],
};

const LONG_WEEKENDS: Guide = {
  path: '/2027/long-weekends',
  navLabel: '2027 long weekends',
  title: '2027 long weekends: every US federal holiday weekend',
  description: (f) => `Every 2027 US federal holiday weekend, which PTO day turns each into four days off, and a plan with ${f.plans[0].breaks.length} long weekends: ${f.plans[0].daysOff} days off for ${f.plans[0].ptoUsed} PTO days.`,
  h1: '2027 long weekends',
  year: 2027,
  country: 'US',
  budget: 11,
  dateStyle: 'US',
  holidayWord: 'federal holidays',
  plans: [
    {
      id: 'every-long-weekend', style: 'max', holidays: ALL_PUBLIC_HOLIDAYS,
      title: (p) => `${plural(p.breaks.length, 'long weekend')}: ${p.daysOff} days off for ${p.ptoUsed} PTO days`,
      note: () => 'One PTO day beside every holiday weekend of 2027, as the planner places them.',
    },
    {
      id: 'six', style: 'max', holidays: SIX_US_HOLIDAYS, budget: 6,
      title: (p) => `With six holidays: ${p.daysOff} days off for ${p.ptoUsed} PTO days`,
      note: () => `If your employer gives only ${SIX_NAMES}. This list is an example, not an average.`,
    },
  ],
  answer: (f) => {
    const free = f.weekends.filter((w) => w.free.length >= 3).length;
    const p = f.plans[0];
    return `${free} of the ${usTotal(f)} US federal holiday dates in 2027 already make a three-day weekend, and one PTO day beside any holiday weekend makes it four. The planner fits ${plural(p.breaks.length, 'of these long weekend', 'of these long weekends')} inside 2027: ${p.daysOff} days off for ${p.ptoUsed} PTO days.${dec31(f) ? ' The last one, New Year\'s Day 2028 on Friday, December 31, runs into 2028, so it is listed below but not in the plan.' : ''}`;
  },
  why: (f) => {
    const gap = f.gapFills[0];
    const lines = [
      'For a Monday holiday, take the Friday before; the Tuesday after gives the same four days. For a Friday holiday, take the Thursday before or the Monday after.',
      'Veterans Day and Thanksgiving fall on Thursdays. Neither is a long weekend on its own; the Friday after each one is.',
    ];
    if (gap) lines.push(`Christmas (observed ${day(f, gap.holidays[0])}) and New Year's Day 2028 (observed ${day(f, gap.holidays[1])}) sit one week apart. Filling the ${plural(gap.ptoDays.length, 'working day')} between them gives ${gap.run.length} days off in a row.`);
    return lines;
  },
  assumptions: US_ASSUMPTIONS,
  show: { longWeekends: true },
  faqs: [
    {
      id: 'how-many-long-weekends',
      question: 'How many three-day weekends are there in 2027?',
      answer: (f) => `With every federal holiday off, ${f.weekends.filter((w) => w.free.length >= 3).length}. Veterans Day and Thanksgiving fall on Thursdays, so they need a PTO day on Friday to make a long weekend.`,
    },
    {
      id: 'thanksgiving-2027',
      question: 'What day is Thanksgiving 2027?',
      answer: () => 'Thursday, November 25, 2027. Taking Friday, November 26 gives four days off, Thursday to Sunday.',
    },
    {
      id: 'july-4-2027',
      question: 'Is July 4, 2027 a long weekend?',
      answer: () => 'Yes. July 4, 2027 is a Sunday, so the federal holiday is observed on Monday, July 5. Saturday to Monday is three days off, and Friday, July 2 makes it four.',
    },
  ],
  lastChecked: '2026-11-22',
  sources: ['opm', 'nager'],
};

const FOUR_DAY: Guide = {
  path: '/2027/four-day-week',
  navLabel: 'A four-day work week in 2027',
  title: 'PTO on a four-day work week in 2027',
  description: (f) => `If you work Monday to Thursday, 10 PTO days in 2027 can give ${f.plans[0].daysOff} days off. Which holidays land on your Friday off, and the dates to request.`,
  h1: 'Planning 2027 on a four-day work week',
  year: 2027,
  country: 'US',
  budget: 10,
  workWeek: '1111000',
  dateStyle: 'US',
  holidayWord: 'federal holidays',
  plans: [
    {
      id: 'most-days-off', style: 'max', holidays: ALL_PUBLIC_HOLIDAYS,
      title: (p) => `Most days off: ${p.daysOff} days off for ${p.ptoUsed} PTO days`,
      note: () => 'Monday-to-Thursday work week, all federal holiday dates.',
    },
    {
      id: 'year-round', style: 'year', holidays: ALL_PUBLIC_HOLIDAYS,
      title: (p) => `Longer breaks: ${p.daysOff} days off for ${p.ptoUsed} PTO days`,
      note: (p) => `Two ten-day breaks in summer and early fall, built from ${plural(longest(p).ptoCost, 'PTO day')} each.${keptNote(p)}`,
    },
    {
      id: 'six', style: 'max', holidays: SIX_US_HOLIDAYS,
      title: (p) => `With six holidays: ${p.daysOff} days off for ${p.ptoUsed} PTO days`,
      note: () => `If your employer gives only ${SIX_NAMES}. This list is an example, not an average.`,
    },
  ],
  answer: (f) => {
    const lost = f.weekends.filter((w) => !w.onWorkday);
    return `On a Monday-to-Thursday week, every Monday holiday in 2027 is already a four-day weekend, and one PTO day on the Thursday before makes it five. ${plural(lost.length, 'holiday')} (${joinList(lost.map((w) => day(f, w.date)))}) land on your Friday off. With 10 PTO days the planner finds ${f.plans[0].daysOff} days off.`;
  },
  why: (f) => [
    'A three-day weekend is your normal week, so a Monday holiday gives four days off for free. One PTO day on the Thursday before gives five.',
    `Veterans Day and Thanksgiving are Thursdays, your last working day. Each already joins your weekend, and the Wednesday before adds a fifth day.`,
    `The longer-breaks plan spends ${plural(longest(f.plans[1]).ptoCost, 'PTO day')} after Independence Day and Labor Day, because three working days, Tuesday to Thursday, bridge to the next long weekend.`,
  ],
  assumptions: (f) => [
    'You work Monday to Thursday. The links set this in the planner (Work week, under More options).',
    'A Friday holiday gives you nothing extra. If your employer gives a substitute day, add it as a company holiday in the planner.',
    `Your employer gives you all ${usTotal(f)} federal holiday dates in 2027. Not every employer does.`,
  ],
  show: { longWeekends: true },
  faqs: [
    {
      id: 'friday-holidays',
      question: 'What happens when a holiday falls on my day off?',
      answer: (f) => `Nothing changes in this plan: ${joinList(f.weekends.filter((w) => !w.onWorkday).map((w) => day(f, w.date)))} are already your days off. Some employers give another day instead. Ask HR, then add it in the planner.`,
    },
    {
      id: 'pto-hours',
      question: 'Do I use more PTO hours on a four-day week?',
      answer: () => 'Often, yes: a 10-hour day costs 10 hours of PTO if your employer tracks hours. The planner counts days, so divide your hours by your day length first.',
    },
    {
      id: 'other-schedules',
      question: 'Can I plan a 9/80 or another schedule?',
      answer: () => 'Yes. The planner has a compressed-schedule setting for 9/80 every other Friday, and any work week under More options. Open the plan and change it there.',
    },
  ],
  lastChecked: '2026-11-22',
  sources: ['opm', 'nager'],
};

const UK: Guide = {
  path: '/2027/uk-annual-leave',
  navLabel: '25 days of leave in England and Wales, 2027',
  title: 'How to use 25 days of annual leave in 2027 (England and Wales)',
  description: (f) => `The 8 bank holidays in England and Wales in 2027, and a plan with ${f.plans[0].daysOff} days off for ${f.plans[0].ptoUsed} of your 25 days of leave, Easter and Christmas included.`,
  h1: 'Making 25 days of leave go further in 2027',
  year: 2027,
  country: 'GB',
  subdivision: 'GB-ENG',
  budget: 25,
  dateStyle: 'GB',
  holidayWord: 'bank holidays',
  plans: [
    {
      id: 'twenty-five', style: 'year', holidays: ALL_PUBLIC_HOLIDAYS,
      title: (p) => `${p.daysOff} days off for ${p.ptoUsed} days of leave`,
      note: (p) => `25 days of leave on top of the 8 bank holidays.${keptNote(p)}`,
    },
    {
      id: 'twenty', style: 'year', holidays: ALL_PUBLIC_HOLIDAYS, budget: 20,
      title: (p) => `If you have 20 days: ${p.daysOff} days off for ${p.ptoUsed} days of leave`,
      note: () => 'For a contract of 28 days that includes the bank holidays, which leaves 20 to choose.',
    },
  ],
  answer: (f) => {
    const p = f.plans[0];
    const easter = p.breaks.find((b) => b.end === '2027-03-29');
    const christmas = longest(p);
    return `England and Wales have 8 bank holidays in 2027. With 25 days of leave (PTO, or what most UK contracts call annual leave) on top, a year-round plan gives ${p.daysOff} days off for ${p.ptoUsed} days of leave${easter ? `, including ${easter.totalDaysOff} days at Easter for ${easter.ptoCost}` : ''} and ${christmas.totalDaysOff} days over Christmas.`;
  },
  why: (f) => {
    const gap = f.gapFills[0];
    const lines = [
      'Easter is early: Good Friday is 26 March and Easter Monday 29 March. Four days of leave before Good Friday give ten days off.',
      'May has two bank holiday Mondays (3 and 31 May) and late August one (30 August). The Friday before each makes a four-day weekend.',
      'Christmas Day and Boxing Day fall on a weekend, so the substitute days are Monday 27 and Tuesday 28 December.',
    ];
    if (gap) lines.push(`New Year's Day 2028 is a Saturday, with the bank holiday on Monday 3 January 2028. ${plural(gap.ptoDays.length, 'day')} of leave, ${range(f, gap.ptoDays[0], gap.ptoDays.at(-1)!)}, would join Christmas to New Year for ${gap.run.length} days off. The plan stops at 31 December, so it is not counted above.`);
    return lines;
  },
  assumptions: () => [
    'England and Wales only. Scotland and Northern Ireland have different bank holidays; pick your region in the planner.',
    'Your employer gives you the 8 bank holidays off on top of your 25 days. Not every employer does, and some contracts count bank holidays inside the total.',
    'You work Monday to Friday, and your leave year runs January to December. If yours starts in April or on your work anniversary, set your own dates in the planner.',
    'The plan keeps 2 days back and starts no break in the first three weeks of January.',
  ],
  show: { longWeekends: true },
  faqs: [
    {
      id: 'bank-holidays-2027',
      question: 'How many bank holidays are there in 2027 in England?',
      answer: () => 'Eight: New Year\'s Day, Good Friday, Easter Monday, the early May and spring bank holidays, the summer bank holiday, and substitute days for Christmas and Boxing Day on 27 and 28 December.',
    },
    {
      id: 'statutory',
      question: 'Are bank holidays part of my statutory leave?',
      answer: () => 'They can be. Most people who work a 5-day week must get at least 28 days of paid leave a year, and an employer can count bank holidays in those 28. Check your contract to see whether your 25 days are on top.',
    },
    {
      id: 'scotland',
      question: 'Does this plan work in Scotland or Northern Ireland?',
      answer: () => 'Not as it is. Scotland has 2 January, a first-Monday summer holiday and St Andrew\'s Day; Northern Ireland adds St Patrick\'s Day and 12 July. Choose your region in the planner.',
    },
  ],
  lastChecked: '2026-11-22',
  sources: ['govuk', 'govukLeave', 'nager'],
};

export const GUIDES: readonly Guide[] = [HUB, TEN, FIFTEEN, LONG_WEEKENDS, FOUR_DAY, UK];

export const GUIDE_HUB = HUB;

export function findGuide(path: string): Guide | undefined {
  const clean = path.replace(/\/+$/, '') || '/';
  return GUIDES.find((g) => g.path === clean);
}

/** A US holiday season the hub mentions for people whose 2026 days expire at year end. */
export const EXPIRING_2026 = { year: 2026, from: '2026-11-23', resetDate: '2026-12-31' } as const;

const factsCache = new Map<string, GuideFacts>();

export function guideFacts(guide: Guide): GuideFacts {
  const cached = factsCache.get(guide.path);
  if (cached) return cached;
  const facts: GuideFacts = {
    guide,
    holidays: guideHolidayList(guide),
    plans: guide.plans.map((spec) => computeGuidePlan(guide, spec)),
    weekends: holidayWeekends(guide),
    gapFills: holidayGapFills(guide),
  };
  factsCache.set(guide.path, facts);
  return facts;
}

export interface ExpiringFacts {
  weekends: HolidayWeekend[];
  gapFills: GapFill[];
}

export function expiringFacts(): ExpiringFacts {
  const scope: GuideScope = { year: EXPIRING_2026.year, country: 'US', budget: 0 };
  return {
    weekends: holidayWeekends(scope).filter((w) => w.date >= EXPIRING_2026.from),
    gapFills: holidayGapFills(scope).filter((g) => g.ptoDays[0] >= EXPIRING_2026.from),
  };
}

export { dec31 as hasObservedNewYearOnDec31 };
