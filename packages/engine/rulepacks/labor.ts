import type { Citation, RulePack } from '../src/coverage/types';

/*
 * Seed labour packs: hourly paid sick leave (C4) and overtime thresholds (cost flags for
 * cover ranking, not payroll). Every number is pinned by `rulepacks.test.ts`. Not legal
 * advice; `mirror` / `agency_guidance` sources must be checked against the statute.
 */

const R = '2026-10-30';

const CA_246 = 'https://california.public.law/codes/labor_code_section_246';
const CA_510 = 'https://california.public.law/codes/ca_lab_code_section_510';
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
      label: 'Overtime over 8 h in a workday or 40 h in a workweek',
      kind: 'overtime_flag',
      dailyHours: 8,
      weeklyHours: 40,
      basis: 'law',
      citation: ca('§ 510(a)', CA_510, 'Any work in excess of eight hours in one workday and any work in excess of 40 hours in any one workweek'),
    },
  ],
  notes: [
    'Use cap, balance cap and frontloading are employer options (§ 246(d), (j)); the defaults use them. Frontloaded policies need no accrual or carryover.',
    'The "40 hours or five days, whichever is more" use rule (DLSE FAQ Q2) matters for shifts over 8 hours: not modelled.',
    'Double time (> 12 h/day) and the 7th-day rule (§ 510(a)) are not modelled.',
  ],
};

const WA_210 = 'https://app.leg.wa.gov/RCW/default.aspx?cite=49.46.210';
const WA_130 = 'https://app.leg.wa.gov/RCW/default.aspx?cite=49.46.130';

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
      citation: { regulation: 'Rev. Code Wash.', section: 'RCW 49.46.130(1)', url: WA_130, retrievedOn: R, publisher: 'official', quote: 'for a workweek longer than forty hours' },
    },
  ],
  notes: ['Frontloading is allowed if it meets the accrual, use and carryover rules (RCW 49.46.210(1)(a)); not set by default.'],
};

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
      basis: 'law',
      citation: NY_OT,
    },
  ],
  notes: ['Employers with 4 or fewer employees and net income of $1M or less owe 40 hours of unpaid sick leave: not modelled.'],
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
    { id: 'nyc-overtime', label: 'Overtime over 40 h in a workweek (no daily threshold)', kind: 'overtime_flag', dailyHours: null, weeklyHours: 40, basis: 'law', citation: NY_OT },
  ],
  notes: [
    'No waiting period: leave is usable as it accrues (FAQ VI.9).',
    'The DCWP FAQs also describe 32 immediately available unpaid hours and 20 hours of paid prenatal leave as separate banks: not modelled.',
    'Frontloading with a year-end payout removes the carryover requirement (FAQ VI.12): not modelled.',
  ],
};

const CO_403 = 'https://colorado.public.law/statutes/crs_8-13.3-403';

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
    },
  ],
  notes: ['The 12-consecutive-hours overtime trigger (Rule 4.1.1(C)) is not modelled.'],
};

export const LABOR_PACKS = [LABOR_US_CA, LABOR_US_WA, LABOR_US_NY, LABOR_US_NY_NYC, LABOR_US_CO] as const;
