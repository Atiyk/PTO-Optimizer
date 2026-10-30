import type { Citation, RulePack } from '../src/coverage/types';

/*
 * Seed childcare rule packs. Every number below was read from the source in its citation on
 * the retrieval date; `rulepacks.test.ts` pins each one. Sources marked `mirror` are
 * reproductions of the official code (Justia / Cornell LII) because the official publisher
 * could not be fetched from the build sandbox: verify against the official publisher before
 * relying on them. Not legal advice.
 */

const R = '2026-10-30';

const ca22 = (section: string, url: string, quote: string): Citation => ({
  regulation: 'Cal. Code Regs. tit. 22',
  section,
  url,
  retrievedOn: R,
  publisher: 'mirror',
  quote,
});

const CA_101416_5 = 'https://regulations.justia.com/states/california/title-22/division-12/chapter-1/subchapter-2/article-6/section-101416-5/';
const CA_101216_3 = 'https://regulations.justia.com/states/california/title-22/division-12/chapter-1/article-6/section-101216-3';
const CA_101516_5 = 'https://regulations.justia.com/states/california/title-22/division-12/chapter-1/subchapter-3/article-6/section-101516-5';
const CA_HSC_1596_955 = 'https://www.leginfo.ca.gov/pub/15-16/bill/asm/ab_0751-0800/ab_762_bill_20150902_enrolled.htm';

export const CHILDCARE_US_CA: RulePack = {
  key: 'childcare-us-ca',
  version: 1,
  name: 'California licensed child care centers (Title 22 + H&S Code)',
  vertical: 'childcare',
  jurisdiction: { country: 'US', state: 'CA' },
  effectiveFrom: '2025-06-27',
  labels: { demandUnit: 'children', groupNoun: 'age group', staffNoun: 'teacher' },
  ageGroups: [
    { key: 'infant', label: 'Infants', fromMonths: 0 },
    { key: 'toddler', label: 'Toddlers (18–36 months)', fromMonths: 18 },
    { key: 'preschool', label: 'Preschool', fromMonths: 36 },
    { key: 'school_age', label: 'School age', fromMonths: 60 },
  ],
  rules: [
    {
      id: 'ca-ratio-infant',
      label: 'Infants: 1 teacher per 4',
      kind: 'ratio',
      ageGroup: 'infant',
      childrenPerStaff: 4,
      maxGroupSize: null,
      basis: 'law',
      citation: ca22('§ 101416.5(b)', CA_101416_5, 'There shall be a ratio of one teacher for every four infants in attendance.'),
    },
    {
      id: 'ca-ratio-toddler',
      label: 'Toddler program: 1 teacher per 6, group of at most 12',
      kind: 'ratio',
      ageGroup: 'toddler',
      childrenPerStaff: 6,
      maxGroupSize: 12,
      basis: 'law',
      citation: {
        regulation: 'Cal. Health & Safety Code (as amended by AB 762, 2015)',
        section: '§ 1596.955(a)(3)–(4)',
        url: CA_HSC_1596_955,
        retrievedOn: R,
        publisher: 'enacted_bill',
        quote: 'A ratio of six children to each teacher is maintained … does not exceed 12 toddlers.',
      },
    },
    {
      id: 'ca-ratio-preschool',
      label: 'Preschool: 1 teacher per 12 (teacher-only staffing)',
      kind: 'ratio',
      ageGroup: 'preschool',
      childrenPerStaff: 12,
      maxGroupSize: null,
      basis: 'law',
      citation: ca22('§ 101216.3(a)', CA_101216_3, 'one teacher visually observing and supervising no more than 12 children in attendance'),
    },
    {
      id: 'ca-ratio-school-age',
      label: 'School age: 1 teacher per 14 (teacher-only staffing)',
      kind: 'ratio',
      ageGroup: 'school_age',
      childrenPerStaff: 14,
      maxGroupSize: 28,
      basis: 'law',
      citation: ca22('§ 101516.5(b)(1)', CA_101516_5, 'A teacher shall supervise no more than 14 children or with an aide a maximum of 28 children.'),
    },
    {
      id: 'ca-mixed-age',
      label: 'Mixed ages: staff for the youngest child',
      kind: 'mixed_age',
      method: 'youngest',
      basis: 'law',
      needsVerification: true,
      reason:
        'The general-centre sections fetched (101216.3, 101216.4) state no mixed-age method. The school-age centre rule ' +
        '§ 101516.5(c) staffs mixed groups "based on the age of the youngest child"; the pack applies that, the stricter reading.',
      citation: ca22('§ 101516.5(c)', CA_101516_5, 'based on the age of the youngest child in the group'),
    },
  ],
  notes: [
    'Teacher + aide options (1:15, or 1:18 in a preschool program with a qualified aide, § 101216.3(b)) are not modelled yet: the pack uses teacher-only ratios, the stricter choice.',
    'Title 5 (CDE-funded) programs follow Title 5 ratios instead (§ 101216.3(c)); not in this pack.',
    'Napping ratios (§ 101230(c), § 101416.5(d)) are not modelled.',
  ],
};

const tx = (section: string, url: string, quote?: string): Citation => ({
  regulation: '26 Tex. Admin. Code ch. 746 (HHSC minimum standards, child-care centers)',
  section,
  url,
  retrievedOn: R,
  publisher: 'mirror',
  quote,
});
const TX_1601 = 'https://regulations.justia.com/resources/v2025071600/tx/admin/2025/tx26_7461601_200901576_1.pdf';
const TX_1609 = 'https://regulations.justia.com/resources/v2025071600/tx/admin/2025/tx26_7461609_200901576_2.pdf';
const TX_1603 = 'https://www.law.cornell.edu/regulations/texas/26-Tex-Admin-Code-SS-746-1603';

const TX_ROWS: [key: string, label: string, from: number, ratio: number, group: number][] = [
  ['0_11m', '0–11 months', 0, 4, 10],
  ['12_17m', '12–17 months', 12, 5, 13],
  ['18_23m', '18–23 months', 18, 9, 18],
  ['2y', '2 years', 24, 11, 22],
  ['3y', '3 years', 36, 15, 30],
  ['4y', '4 years', 48, 18, 35],
  ['5y', '5 years', 60, 22, 35],
  ['6_8y', '6–8 years', 72, 26, 35],
  ['9_13y', '9–13 years', 108, 26, 35],
];

export const CHILDCARE_US_TX: RulePack = {
  key: 'childcare-us-tx',
  version: 1,
  name: 'Texas licensed child-care centers (HHSC minimum standards)',
  vertical: 'childcare',
  jurisdiction: { country: 'US', state: 'TX' },
  effectiveFrom: '2025-06-27',
  labels: { demandUnit: 'children', groupNoun: 'age group', staffNoun: 'caregiver' },
  ageGroups: TX_ROWS.map(([key, label, fromMonths]) => ({ key, label, fromMonths })),
  rules: [
    ...TX_ROWS.map(([key, label, , ratio, group]) => ({
      id: `tx-ratio-${key}`,
      label: `${label}: 1 caregiver per ${ratio}, group of at most ${group}`,
      kind: 'ratio' as const,
      ageGroup: key,
      childrenPerStaff: ratio,
      maxGroupSize: group,
      basis: 'law' as const,
      citation: tx('§ 746.1601 (ratio chart) and § 746.1609 (group size chart)', TX_1601, `${label}: ${ratio} per caregiver; max group ${group} (${TX_1609})`),
    })),
    {
      id: 'tx-mixed-age',
      label: 'Mixed ages: the age of the middle child (core number) sets the ratio',
      kind: 'mixed_age',
      method: 'core_child',
      basis: 'law',
      citation: tx('§ 746.1603', TX_1603, 'The age of this child is the specified age of the children in this group.'),
    },
  ],
  notes: [
    'Ratios apply when 13 or more children are in care; smaller centers have other rules (§ 746.1609 scope). Not modelled.',
    'Naptime (§ 746.1613) and opening/closing (§ 746.1615) adjustments are not modelled.',
  ],
};

const ny = (section: string, quote?: string): Citation => ({
  regulation: '18 N.Y.C.R.R. Part 418-1 (OCFS child day care centers)',
  section,
  url: 'https://www.law.cornell.edu/regulations/new-york/18-NYCRR-418-1.8',
  retrievedOn: R,
  publisher: 'mirror',
  quote,
});

const NY_ROWS: [key: string, label: string, from: number, ratio: number, group: number, sub: string][] = [
  ['6w_18m', '6 weeks–18 months', 0, 4, 8, '(k)(2)'],
  ['18_36m', '18–36 months', 18, 5, 12, '(k)(3)'],
  ['3y', '3 years', 36, 7, 18, '(k)(4)'],
  ['4y', '4 years', 48, 8, 21, '(k)(5)'],
  ['5y', '5 years', 60, 9, 24, '(k)(6)'],
  ['school_age', 'School age through 9 years', 72, 10, 20, '(k)(7)'],
  ['10_12y', '10–12 years', 120, 15, 30, '(k)(8)'],
];

export const CHILDCARE_US_NY: RulePack = {
  key: 'childcare-us-ny',
  version: 1,
  name: 'New York child day care centers (18 NYCRR 418-1, outside NYC)',
  vertical: 'childcare',
  jurisdiction: { country: 'US', state: 'NY' },
  effectiveFrom: '2020-06-03',
  labels: { demandUnit: 'children', groupNoun: 'age group', staffNoun: 'teacher' },
  ageGroups: NY_ROWS.map(([key, label, fromMonths]) => ({ key, label, fromMonths })),
  rules: [
    ...NY_ROWS.map(([key, label, , ratio, group, sub]) => ({
      id: `ny-ratio-${key}`,
      label: `${label}: 1 teacher per ${ratio}, group of at most ${group}`,
      kind: 'ratio' as const,
      ageGroup: key,
      childrenPerStaff: ratio,
      maxGroupSize: group,
      basis: 'law' as const,
      citation: ny(`§ 418-1.8${sub}`, `${label}: 1:${ratio}, max group ${group}`),
    })),
    {
      id: 'ny-mixed-age',
      label: 'Mixed ages at the start or end of the day: ratio of the youngest child',
      kind: 'mixed_age',
      method: 'youngest',
      basis: 'law',
      citation: ny('§ 418-1.8(l)(9)–(10)', 'the ratio and group size for the youngest child apply'),
    },
  ],
  notes: [
    'All-day groups of 3- to 5-year-olds use the majority age (§ 418-1.8(l)(6)); the pack applies the youngest-child rule, which is never less strict.',
    'Infants may not be mixed with other ages except in approved continuity-of-care rooms (§ 418-1.8(l)(7), (r)).',
    'New York City centers are regulated by the NYC Health Code (Article 47), not Part 418-1: not in this pack.',
  ],
};

/**
 * Clinic pack (second vertical): configuration only. Dental-board and veterinary rules vary
 * by state and were not researched in this build, so every rule is the org's own policy.
 */
export const CLINIC_TEMPLATE: RulePack = {
  key: 'clinic-template',
  version: 1,
  name: 'Clinic: licensed role present for booked work (your policy)',
  vertical: 'clinic',
  jurisdiction: { country: 'US' },
  effectiveFrom: '2026-01-01',
  labels: { demandUnit: 'bookings', groupNoun: 'service', staffNoun: 'clinician' },
  ageGroups: [
    { key: 'hygiene', label: 'Hygiene chair', fromMonths: 0 },
    { key: 'surgery', label: 'Surgery / procedure', fromMonths: 1 },
  ],
  rules: [
    { id: 'clinic-hygiene', label: 'One hygienist per booked hygiene chair', kind: 'ratio', ageGroup: 'hygiene', childrenPerStaff: 1, maxGroupSize: null, basis: 'org_policy' },
    { id: 'clinic-surgery', label: 'Two clinical staff per booked procedure', kind: 'ratio', ageGroup: 'surgery', childrenPerStaff: 0.5, maxGroupSize: null, basis: 'org_policy' },
    { id: 'clinic-mixed', label: 'Each service staffed separately', kind: 'mixed_age', method: 'proportional', basis: 'org_policy' },
    { id: 'clinic-licensed', label: 'Only licensed clinicians count', kind: 'ratio_counts_credential', anyOf: ['rdh_licence', 'vet_tech_licence', 'dds_licence'], basis: 'org_policy' },
    { id: 'clinic-dentist-on-site', label: 'A dentist on site while bookings run', kind: 'role_present', credential: 'dds_licence', min: 1, scope: 'site', when: 'children_present', basis: 'org_policy' },
  ],
  notes: ['Supervision rules for hygienists differ by state dental board. Confirm yours; the pack ships as your policy, not law.'],
};

export const CHILDCARE_PACKS = [CHILDCARE_US_CA, CHILDCARE_US_TX, CHILDCARE_US_NY, CLINIC_TEMPLATE] as const;
