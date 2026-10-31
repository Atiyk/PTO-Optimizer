import type { Citation, RulePack } from '../src/coverage/types';

/*
 * Seed labour packs: hourly paid sick leave (C4) and overtime thresholds (cost flags for
 * cover ranking, not payroll). Every number is pinned by `rulepacks.test.ts`. Not legal
 * advice; `mirror` / `agency_guidance` sources must be checked against the statute.
 */

const R = '2026-10-30';
/** Re-verified for the time clock work (overtime bands, meal and rest breaks). */
const V = '2026-10-31';

const CA_246 = 'https://california.public.law/codes/labor_code_section_246';
const CA_510 = 'https://california.public.law/codes/ca_lab_code_section_510';
const CA_512 = 'https://california.public.law/codes/labor_code_section_512';
const ca = (section: string, url: string, quote: string): Citation => ({
  regulation: 'Cal. Labor Code',
  section,
  url,
  retrievedOn: R,
  publisher: 'mirror',
  quote,
});

export const LABOR_US_CA: RulePack = {
  key: 'labor-us-ca',
  version: 1,
  name: 'California paid sick leave and overtime',
  vertical: 'general',
  jurisdiction: { country: 'US', state: 'CA' },
  effectiveFrom: '2024-01-01',
  ageGroups: [],
  rules: [
    {
      id: 'ca-sick-accrual',
      label: 'Paid sick leave: 1 hour per 30 worked, usable from day 90, use may be limited to 40 h/yr, balance may be capped at 80 h',
      kind: 'sick_accrual',
      hoursPerUnit: 30,
      usableFromDay: 90,
      annualUseCap: 40,
      balanceCap: 80,
      carryoverMax: 'all',
      frontloadHours: 40,
      annualAccrualCap: null,
      basis: 'law',
      citation: ca(
        '§ 246(b)(1), (c), (d), (j)',
        CA_246,
        'not less than one hour per every 30 hours worked … beginning on the 90th day … 40 hours or five days … 80 hours or 10 days',
      ),
    },
    {
      id: 'ca-overtime',
      label: 'Overtime at 1.5× over 8 h in a workday or 40 h in a workweek; 2× over 12 h in a day; 7th day in a row: first 8 h at 1.5×, then 2×',
      kind: 'overtime_flag',
      dailyHours: 8,
      weeklyHours: 40,
      multiplier: 1.5,
      doubleTimeDailyHours: 12,
      doubleTimeMultiplier: 2,
      seventhDay: true,
      basis: 'law',
      citation: { ...ca('§ 510(a)', CA_510, 'Any work in excess of eight hours in one workday and any work in excess of 40 hours in any one workweek … in excess of 12 hours in one day … twice the regular rate'), retrievedOn: V },
    },
    {
      id: 'ca-meal-1',
      label: 'Meal period of at least 30 min for a work period of more than 5 h, starting by the end of hour 5 (waivable by mutual consent when the day is no more than 6 h)',
      kind: 'meal_break',
      whenOverHours: 5,
      minutes: 30,
      nth: 1,
      startByHours: 5,
      basis: 'law',
      citation: { ...ca('§ 512(a)', CA_512, 'more than five hours per day without providing the employee with a meal period of not less than 30 minutes'), retrievedOn: V },
    },
    {
      id: 'ca-meal-2',
      label: 'Second meal period of at least 30 min for more than 10 h (waivable when no more than 12 h and the first was not waived)',
      kind: 'meal_break',
      whenOverHours: 10,
      minutes: 30,
      nth: 2,
      startByHours: 10,
      basis: 'law',
      citation: { ...ca('§ 512(a)', CA_512, 'more than 10 hours per day without providing the employee with a second meal period of not less than 30 minutes'), retrievedOn: V },
    },
    {
      id: 'ca-rest',
      label: 'Paid rest of 10 min per 4 h worked or major fraction; none needed under 3.5 h',
      kind: 'rest_break',
      minutes: 10,
      perHours: 4,
      majorFraction: true,
      minShiftHours: 3.5,
      basis: 'law',
      citation: {
        regulation: 'IWC Wage Orders § 12 (DLSE Rest Periods FAQ)',
        section: '§ 12 Rest Periods',
        url: 'https://www.dir.ca.gov/dlse/faq_RestPeriods.htm',
        retrievedOn: V,
        publisher: 'agency_guidance',
        quote: 'a net ten consecutive minutes for each four hour work period, or major fraction thereof … less than three and one-half hours',
      },
    },
  ],
  notes: [
    'Use cap, balance cap and frontloading are employer options (§ 246(d), (j)); the defaults use them. Frontloaded policies need no accrual or carryover.',
    'The "40 hours or five days, whichever is more" use rule (DLSE FAQ Q2) matters for shifts over 8 hours: not modelled.',
    'Overtime, meal and rest rules were re-checked on 2026-10-31. Alternative workweek schedules (§§ 511, 514, 554) are not modelled.',
    'Meal waivers need mutual consent; the time clock flags a missed meal and leaves the waiver to the manager. Meal premiums (an extra hour of pay) are a payroll matter: not computed.',
  ],
};

const WA_210 = 'https://app.leg.wa.gov/RCW/default.aspx?cite=49.46.210';
const WA_130 = 'https://app.leg.wa.gov/RCW/default.aspx?cite=49.46.130';
const WA_092 = 'https://lawfilesext.leg.wa.gov/law/WAC/WAC%20296%20%20TITLE/WAC%20296%20-126%20%20CHAPTER/WAC%20296%20-126%20-092.htm';

export const LABOR_US_WA: RulePack = {
  key: 'labor-us-wa',
  version: 1,
  name: 'Washington paid sick leave and overtime',
  vertical: 'general',
  jurisdiction: { country: 'US', state: 'WA' },
  effectiveFrom: '2025-01-01',
  ageGroups: [],
  rules: [
    {
      id: 'wa-sick-accrual',
      label: 'Paid sick leave: 1 hour per 40 worked, usable from the 90th day after starting, carryover up to 40 h',
      kind: 'sick_accrual',
      hoursPerUnit: 40,
      // "the ninetieth calendar day after the commencement": start + 90 = day 91.
      usableFromDay: 91,
      carryoverMax: 40,
      annualUseCap: null,
      annualAccrualCap: null,
      balanceCap: null,
      frontloadHours: null,
      basis: 'law',
      citation: {
        regulation: 'Rev. Code Wash.',
        section: 'RCW 49.46.210(1)(a), (d), (j)',
        url: WA_210,
        retrievedOn: R,
        publisher: 'official',
        quote: 'at least one hour of paid sick leave for every forty hours worked … beginning on the ninetieth calendar day',
      },
    },
    {
      id: 'wa-overtime',
      label: 'Overtime over 40 h in a workweek (no daily threshold)',
      kind: 'overtime_flag',
      dailyHours: null,
      weeklyHours: 40,
      basis: 'law',
      multiplier: 1.5,
      citation: { regulation: 'Rev. Code Wash.', section: 'RCW 49.46.130(1)', url: WA_130, retrievedOn: R, publisher: 'official', quote: 'for a workweek longer than forty hours' },
    },
    {
      id: 'wa-meal',
      label: 'Meal period of at least 30 min, starting no less than 2 h and no more than 5 h into the shift',
      kind: 'meal_break',
      whenOverHours: 5,
      minutes: 30,
      nth: 1,
      startAfterHours: 2,
      startByHours: 5,
      basis: 'law',
      citation: { regulation: 'Wash. Admin. Code', section: 'WAC 296-126-092(1)', url: WA_092, retrievedOn: V, publisher: 'official', quote: 'a meal period of at least thirty minutes which commences no less than two hours nor more than five hours from the beginning of the shift' },
    },
    {
      id: 'wa-rest',
      label: 'Paid rest of at least 10 min for each 4 h of working time',
      kind: 'rest_break',
      minutes: 10,
      perHours: 4,
      majorFraction: false,
      basis: 'law',
      citation: { regulation: 'Wash. Admin. Code', section: 'WAC 296-126-092(4)', url: WA_092, retrievedOn: V, publisher: 'official', quote: "a rest period of not less than ten minutes, on the employer's time, for each four hours of working time" },
    },
  ],
  notes: [
    'Frontloading is allowed if it meets the accrual, use and carryover rules (RCW 49.46.210(1)(a)); not set by default.',
    'WAC 296-126-092 also limits work to 3 hours without a rest period and sets extra meal periods for long shifts: not modelled. Some industries (e.g. agriculture, healthcare under RCW 49.12.480) have their own rules.',
  ],
};


const NY_162 = 'https://law.justia.com/codes/new-york/lab/article-5/title-1/162';
const NY_MEALS: RulePack['rules'] = [
  {
    id: 'ny-meal-noon',
    label: 'Noonday meal: at least 30 min between 11:00 and 14:00 for a shift of more than 6 h that spans that window',
    kind: 'meal_break',
    whenOverHours: 6,
    minutes: 30,
    nth: 1,
    window: { from: 660, to: 840 },
    basis: 'law',
    citation: { regulation: 'N.Y. Labor Law', section: '§ 162(2)', url: NY_162, retrievedOn: V, publisher: 'mirror', quote: 'works a shift of more than six hours which extends over the noon day meal period … at least thirty minutes off within that period' },
  },
  {
    id: 'ny-meal-evening',
    label: 'Extra meal: at least 20 min between 17:00 and 19:00 for a shift starting before 11:00 and running past 19:00',
    kind: 'meal_break',
    whenOverHours: 0,
    minutes: 20,
    nth: 2,
    window: { from: 1020, to: 1140 },
    shiftStartsBefore: 660,
    shiftEndsAfter: 1140,
    basis: 'law',
    citation: { regulation: 'N.Y. Labor Law', section: '§ 162(3)', url: NY_162, retrievedOn: V, publisher: 'mirror', quote: 'starting before eleven o’clock in the morning and continuing later than seven o’clock in the evening … at least twenty minutes between five and seven' },
  },
];

const NYS_GUIDE = 'https://www.ny.gov/new-york-paid-sick-leave/new-york-paid-sick-leave';
const nys = (section: string, quote: string): Citation => ({
  regulation: 'N.Y. Labor Law § 196-b (NYS DOL guidance page)',
  section,
  url: NYS_GUIDE,
  retrievedOn: R,
  publisher: 'agency_guidance',
  quote,
});
const NY_OT: Citation = {
  regulation: '12 N.Y.C.R.R. Part 142',
  section: '§ 142-2.2',
  url: 'https://www.law.cornell.edu/regulations/new-york/12-NYCRR-142-2.2',
  retrievedOn: R,
  publisher: 'mirror',
  quote: 'For working time over 40 hours',
};

export const LABOR_US_NY: RulePack = {
  key: 'labor-us-ny',
  version: 1,
  name: 'New York State paid sick leave and overtime (outside NYC)',
  vertical: 'general',
  jurisdiction: { country: 'US', state: 'NY' },
  effectiveFrom: '2021-01-01',
  ageGroups: [],
  rules: [
    {
      id: 'nys-sick-5-99',
      label: 'Paid sick leave (5–99 employees): 1 hour per 30 worked, up to 40 h a year',
      kind: 'sick_accrual',
      hoursPerUnit: 30,
      annualAccrualCap: 40,
      annualUseCap: 40,
      employerSize: { min: 5, max: 99 },
      usableFromDay: null,
      balanceCap: null,
      frontloadHours: 40,
      basis: 'law',
      needsVerification: true,
      reason: 'Carryover rules are not stated on the DOL page that was fetched; the statute text (§ 196-b) could not be fetched. Carryover is left unset.',
      citation: nys('§ 196-b (5–99 employees)', 'up to 40 hours of paid sick leave per calendar year … at least one hour for every 30 hours worked'),
    },
    {
      id: 'nys-sick-100',
      label: 'Paid sick leave (100+ employees): 1 hour per 30 worked, up to 56 h a year',
      kind: 'sick_accrual',
      hoursPerUnit: 30,
      annualAccrualCap: 56,
      annualUseCap: 56,
      employerSize: { min: 100 },
      usableFromDay: null,
      balanceCap: null,
      frontloadHours: 56,
      basis: 'law',
      needsVerification: true,
      reason: 'Carryover rules are not stated on the DOL page that was fetched; the statute text (§ 196-b) could not be fetched. Carryover is left unset.',
      citation: nys('§ 196-b (100+ employees)', 'Employers with 100 or more employees must provide up to 56 hours of paid sick leave per calendar year.'),
    },
    {
      id: 'ny-overtime',
      label: 'Overtime over 40 h in a workweek (no daily threshold)',
      kind: 'overtime_flag',
      dailyHours: null,
      weeklyHours: 40,
      multiplier: 1.5,
      basis: 'law',
      citation: NY_OT,
    },
    ...NY_MEALS,
  ],
  notes: [
    'Employers with 4 or fewer employees and net income of $1M or less owe 40 hours of unpaid sick leave: not modelled.',
    '§ 162 has separate rules for factory workers and for shifts starting between 13:00 and 06:00: not modelled. New York has no general paid rest-break rule.',
  ],
};

const NYC_FAQ = 'https://www.nyc.gov/site/dca/about/paid-sick-leave-FAQs.page';
const nyc = (section: string, quote: string): Citation => ({
  regulation: 'NYC Earned Safe and Sick Time Act (Admin. Code Title 20, Ch. 8), DCWP FAQs',
  section,
  url: NYC_FAQ,
  retrievedOn: R,
  publisher: 'agency_guidance',
  quote,
});

export const LABOR_US_NY_NYC: RulePack = {
  key: 'labor-us-ny-nyc',
  version: 1,
  name: 'New York City safe and sick leave and overtime',
  vertical: 'general',
  jurisdiction: { country: 'US', state: 'NY', city: 'New York City' },
  effectiveFrom: '2021-01-01',
  ageGroups: [],
  rules: [
    {
      id: 'nyc-sick-5-99',
      label: 'Safe and sick leave (5–99 employees): 1 hour per 30 worked, up to 40 h a year, carry over up to 40, use up to 40 a year',
      kind: 'sick_accrual',
      hoursPerUnit: 30,
      annualAccrualCap: 40,
      carryoverMax: 40,
      annualUseCap: 40,
      usableFromDay: null,
      balanceCap: null,
      frontloadHours: 40,
      employerSize: { min: 5, max: 99 },
      basis: 'law',
      citation: nyc('FAQ I.3, VI.3, VI.10–VI.11', 'Accrual is 1 hour for every 30 hours worked … up to 40 or 56 hours of unused accrued leave may carry over'),
    },
    {
      id: 'nyc-sick-100',
      label: 'Safe and sick leave (100+ employees): 1 hour per 30 worked, up to 56 h a year, carry over up to 56, use up to 56 a year',
      kind: 'sick_accrual',
      hoursPerUnit: 30,
      annualAccrualCap: 56,
      carryoverMax: 56,
      annualUseCap: 56,
      usableFromDay: null,
      balanceCap: null,
      frontloadHours: 56,
      employerSize: { min: 100 },
      basis: 'law',
      citation: nyc('FAQ I.3, VI.3, VI.10–VI.11', 'up to 56 paid hours (100 or more) … use of only up to 40 or 56 accrued hours per Calendar Year'),
    },
    { id: 'nyc-overtime', label: 'Overtime over 40 h in a workweek (no daily threshold)', kind: 'overtime_flag', dailyHours: null, weeklyHours: 40, multiplier: 1.5, basis: 'law', citation: NY_OT },
    ...NY_MEALS,
  ],
  notes: [
    'No waiting period: leave is usable as it accrues (FAQ VI.9).',
    'The DCWP FAQs also describe 32 immediately available unpaid hours and 20 hours of paid prenatal leave as separate banks: not modelled.',
    'Frontloading with a year-end payout removes the carryover requirement (FAQ VI.12): not modelled.',
  ],
};

const CO_403 = 'https://colorado.public.law/statutes/crs_8-13.3-403';
const CO_INFO4 = 'https://cdle.colorado.gov/sites/cdle/files/info_%234_meal_and_rest_periods_09.15.25.pdf';

export const LABOR_US_CO: RulePack = {
  key: 'labor-us-co',
  version: 1,
  name: 'Colorado paid sick leave (HFWA) and overtime (COMPS)',
  vertical: 'general',
  jurisdiction: { country: 'US', state: 'CO' },
  effectiveFrom: '2021-01-01',
  ageGroups: [],
  rules: [
    {
      id: 'co-sick-accrual',
      label: 'Paid sick leave: 1 hour per 30 worked, up to 48 h a year, carry forward up to 48, use up to 48 a year, usable as accrued',
      kind: 'sick_accrual',
      hoursPerUnit: 30,
      annualAccrualCap: 48,
      carryoverMax: 48,
      annualUseCap: 48,
      usableFromDay: null,
      balanceCap: null,
      frontloadHours: 48,
      basis: 'law',
      citation: {
        regulation: 'Colo. Rev. Stat.',
        section: '§ 8-13.3-403(2)(a), (3)(a)–(b)',
        url: CO_403,
        retrievedOn: R,
        publisher: 'mirror',
        quote: 'at least one hour of paid sick leave for every thirty hours worked … more than forty-eight hours',
      },
    },
    {
      id: 'co-overtime',
      label: 'Overtime over 12 h in a workday or 40 h in a workweek',
      kind: 'overtime_flag',
      dailyHours: 12,
      weeklyHours: 40,
      basis: 'law',
      citation: {
        regulation: '7 Colo. Code Regs. 1103-1 (COMPS Order)',
        section: 'Rule 4.1.1(A)–(B)',
        url: 'https://www.law.cornell.edu/regulations/colorado/7-CCR-1103-1-4',
        retrievedOn: R,
        publisher: 'mirror',
        quote: '40 hours per workweek … 12 hours per workday',
      },
      multiplier: 1.5,
    },
    {
      id: 'co-meal',
      label: 'Uninterrupted, duty-free meal period of at least 30 min for shifts over 5 consecutive hours',
      kind: 'meal_break',
      whenOverHours: 5,
      minutes: 30,
      nth: 1,
      basis: 'law',
      citation: { regulation: '7 Colo. Code Regs. 1103-1 (COMPS Order), CDLE INFO #4', section: 'Rule 5.1', url: CO_INFO4, retrievedOn: V, publisher: 'agency_guidance', quote: 'For shifts of over 5 consecutive hours, all employees are entitled to uninterrupted, duty-free meal periods … at least 30 minutes' },
    },
    {
      id: 'co-rest',
      label: 'Paid 10-min rest for each 4 h of work or major fraction (1 rest for more than 2 up to 6 h, 2 for more than 6 up to 10 h, …)',
      kind: 'rest_break',
      minutes: 10,
      perHours: 4,
      majorFraction: true,
      basis: 'law',
      citation: { regulation: '7 Colo. Code Regs. 1103-1 (COMPS Order), CDLE INFO #4', section: 'Rule 5.2', url: CO_INFO4, retrievedOn: V, publisher: 'agency_guidance', quote: 'paid 10-minute rest periods for each 4 hours of work, or major fraction of that time' },
    },
  ],
  notes: [
    'The 12-consecutive-hours overtime trigger (Rule 4.1.1(C)) is not modelled.',
    'Where a duty-free meal is impractical, an on-duty paid meal is allowed (Rule 5.1.1): the time clock still flags it for a manager to confirm.',
  ],
};


export const LABOR_US_FEDERAL: RulePack = {
  key: 'labor-us-federal',
  version: 1,
  name: 'US federal baseline (FLSA): overtime over 40 h a week',
  vertical: 'general',
  jurisdiction: { country: 'US' },
  effectiveFrom: '2024-01-01',
  ageGroups: [],
  rules: [
    {
      id: 'flsa-overtime',
      label: 'Overtime at 1.5× the regular rate over 40 h in a workweek (no daily threshold)',
      kind: 'overtime_flag',
      dailyHours: null,
      weeklyHours: 40,
      multiplier: 1.5,
      basis: 'law',
      citation: {
        regulation: '29 U.S.C.',
        section: '§ 207(a)(1)',
        url: 'https://www.law.cornell.edu/uscode/text/29/207',
        retrievedOn: V,
        publisher: 'mirror',
        quote: 'for a workweek longer than forty hours … at a rate not less than one and one-half times the regular rate',
      },
    },
  ],
  notes: [
    'The FLSA does not require breaks or meal periods (U.S. DOL, FLSA FAQ: https://www.dol.gov/agencies/whd/flsa/faq). Many states do: pick your state’s pack, or add your own policy.',
    'Used as the default for US sites with no state labour pack. Exempt (salaried) roles are outside overtime: mark them salaried.',
  ],
};

export const LABOR_PACKS = [LABOR_US_FEDERAL, LABOR_US_CA, LABOR_US_WA, LABOR_US_NY, LABOR_US_NY_NYC, LABOR_US_CO] as const;
