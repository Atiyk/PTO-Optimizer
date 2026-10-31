import { describe, expect, it } from 'vitest';
import { isVerified, rulesOf, validateRulePack, type RulePack } from '../src/coverage/types';
import { CHILDCARE_US_CA, CHILDCARE_US_NY, CHILDCARE_US_TX, CLINIC_TEMPLATE } from './childcare';
import { SEED_PACKS, seedPack } from './index';
import { LABOR_US_CA, LABOR_US_CO, LABOR_US_FEDERAL, LABOR_US_NY, LABOR_US_NY_NYC, LABOR_US_WA } from './labor';

/*
 * One assertion per cited number (build rule: "a test per cited number"). If a number
 * changes, this test must change in the same commit as the new citation.
 */

const ratio = (p: RulePack, group: string) => rulesOf(p, 'ratio').find((r) => r.ageGroup === group)!;
const sick = (p: RulePack, id: string) => rulesOf(p, 'sick_accrual').find((r) => r.id === id)!;
const ot = (p: RulePack) => rulesOf(p, 'overtime_flag')[0]!;

describe('seed rule packs', () => {
  it('every pack is valid; every law rule is cited or marked "needs verification"', () => {
    for (const p of SEED_PACKS) {
      expect(validateRulePack(p), p.key).toEqual([]);
      for (const r of p.rules) {
        if (r.basis === 'law') expect(!!r.citation || r.needsVerification, `${p.key}/${r.id}`).toBe(true);
        if (r.citation) expect(r.citation.url).toMatch(/^https:\/\//);
        if (r.citation) expect(r.citation.retrievedOn).toMatch(/^2026-10-3[01]$/);
      }
    }
    expect(new Set(SEED_PACKS.map((p) => p.key)).size).toBe(SEED_PACKS.length);
    expect(seedPack('childcare-us-ca')).toBe(CHILDCARE_US_CA);
  });

  it('CA childcare: § 101416.5(b) 1:4 infants; H&S 1596.955(a)(3)–(4) 1:6 toddlers, group 12; § 101216.3(a) 1:12; § 101516.5(b)(1) 1:14 / 28', () => {
    expect([ratio(CHILDCARE_US_CA, 'infant').childrenPerStaff, ratio(CHILDCARE_US_CA, 'infant').citation?.section]).toEqual([4, '§ 101416.5(b)']);
    expect([ratio(CHILDCARE_US_CA, 'toddler').childrenPerStaff, ratio(CHILDCARE_US_CA, 'toddler').maxGroupSize]).toEqual([6, 12]);
    expect(ratio(CHILDCARE_US_CA, 'toddler').citation?.section).toBe('§ 1596.955(a)(3)–(4)');
    expect([ratio(CHILDCARE_US_CA, 'preschool').childrenPerStaff, ratio(CHILDCARE_US_CA, 'preschool').citation?.section]).toEqual([12, '§ 101216.3(a)']);
    expect([ratio(CHILDCARE_US_CA, 'school_age').childrenPerStaff, ratio(CHILDCARE_US_CA, 'school_age').maxGroupSize]).toEqual([14, 28]);
    const mixed = rulesOf(CHILDCARE_US_CA, 'mixed_age')[0]!;
    expect(mixed.method).toBe('youngest');
    expect(isVerified(mixed)).toBe(false); // needs verification for general centres
  });

  it('TX childcare: § 746.1601 ratio chart and § 746.1609 group-size chart, § 746.1603 core child', () => {
    const want: [string, number, number][] = [
      ['0_11m', 4, 10],
      ['12_17m', 5, 13],
      ['18_23m', 9, 18],
      ['2y', 11, 22],
      ['3y', 15, 30],
      ['4y', 18, 35],
      ['5y', 22, 35],
      ['6_8y', 26, 35],
      ['9_13y', 26, 35],
    ];
    for (const [g, r, max] of want) expect([g, ratio(CHILDCARE_US_TX, g).childrenPerStaff, ratio(CHILDCARE_US_TX, g).maxGroupSize]).toEqual([g, r, max]);
    expect(rulesOf(CHILDCARE_US_TX, 'mixed_age')[0]).toMatchObject({ method: 'core_child', citation: { section: '§ 746.1603' } });
  });

  it('NY childcare: 18 NYCRR 418-1.8(k)(2)–(8) ratios and group sizes; (l)(9)–(10) youngest child', () => {
    const want: [string, number, number, string][] = [
      ['6w_18m', 4, 8, '(k)(2)'],
      ['18_36m', 5, 12, '(k)(3)'],
      ['3y', 7, 18, '(k)(4)'],
      ['4y', 8, 21, '(k)(5)'],
      ['5y', 9, 24, '(k)(6)'],
      ['school_age', 10, 20, '(k)(7)'],
      ['10_12y', 15, 30, '(k)(8)'],
    ];
    for (const [g, r, max, sub] of want) {
      const rule = ratio(CHILDCARE_US_NY, g);
      expect([rule.childrenPerStaff, rule.maxGroupSize, rule.citation?.section]).toEqual([r, max, `§ 418-1.8${sub}`]);
    }
    expect(rulesOf(CHILDCARE_US_NY, 'mixed_age')[0]!.method).toBe('youngest');
  });

  it('CA labour: Lab. Code § 246 (1 per 30, day 90, use 40, balance 80, frontload 40); § 510(a) 8 h / 40 h', () => {
    expect(sick(LABOR_US_CA, 'ca-sick-accrual')).toMatchObject({ hoursPerUnit: 30, usableFromDay: 90, annualUseCap: 40, balanceCap: 80, carryoverMax: 'all', frontloadHours: 40 });
    expect(ot(LABOR_US_CA)).toMatchObject({ dailyHours: 8, weeklyHours: 40, citation: { section: '§ 510(a)' } });
  });

  it('WA: RCW 49.46.210(1)(a),(d),(j) 1 per 40, day 90 after start, carryover 40; RCW 49.46.130(1) 40 h week', () => {
    expect(sick(LABOR_US_WA, 'wa-sick-accrual')).toMatchObject({ hoursPerUnit: 40, usableFromDay: 91, carryoverMax: 40, citation: { publisher: 'official' } });
    expect(ot(LABOR_US_WA)).toMatchObject({ dailyHours: null, weeklyHours: 40 });
  });

  it('NYS: § 196-b 1 per 30; 40 h (5–99) and 56 h (100+); carryover needs verification; 12 NYCRR 142-2.2 40 h week', () => {
    expect(sick(LABOR_US_NY, 'nys-sick-5-99')).toMatchObject({ hoursPerUnit: 30, annualAccrualCap: 40, annualUseCap: 40, employerSize: { min: 5, max: 99 }, needsVerification: true });
    expect(sick(LABOR_US_NY, 'nys-sick-100')).toMatchObject({ hoursPerUnit: 30, annualAccrualCap: 56, annualUseCap: 56, employerSize: { min: 100 } });
    expect(sick(LABOR_US_NY, 'nys-sick-100').carryoverMax).toBeUndefined();
    expect(ot(LABOR_US_NY)).toMatchObject({ weeklyHours: 40, citation: { section: '§ 142-2.2' } });
  });

  it('NYC: DCWP FAQ 1 per 30; 40 / 56 a year, carryover 40 / 56, use 40 / 56', () => {
    expect(sick(LABOR_US_NY_NYC, 'nyc-sick-5-99')).toMatchObject({ hoursPerUnit: 30, annualAccrualCap: 40, carryoverMax: 40, annualUseCap: 40 });
    expect(sick(LABOR_US_NY_NYC, 'nyc-sick-100')).toMatchObject({ hoursPerUnit: 30, annualAccrualCap: 56, carryoverMax: 56, annualUseCap: 56 });
  });

  it('CO: C.R.S. § 8-13.3-403 1 per 30, 48 a year, carry 48, use 48; COMPS Rule 4.1.1 12 h day / 40 h week', () => {
    expect(sick(LABOR_US_CO, 'co-sick-accrual')).toMatchObject({ hoursPerUnit: 30, annualAccrualCap: 48, carryoverMax: 48, annualUseCap: 48, usableFromDay: null });
    expect(ot(LABOR_US_CO)).toMatchObject({ dailyHours: 12, weeklyHours: 40, citation: { section: 'Rule 4.1.1(A)–(B)' } });
  });

  it('work rules re-verified 2026-10-31: FLSA § 207(a)(1); CA § 510(a) bands, § 512(a) meals, wage order § 12 rest; WAC 296-126-092; COMPS 5.1/5.2; NY § 162', () => {
    expect(ot(LABOR_US_FEDERAL)).toMatchObject({ dailyHours: null, weeklyHours: 40, multiplier: 1.5, citation: { section: '§ 207(a)(1)' } });
    expect(rulesOf(LABOR_US_FEDERAL, 'meal_break')).toEqual([]);
    expect(rulesOf(LABOR_US_FEDERAL, 'rest_break')).toEqual([]);
    expect(ot(LABOR_US_CA)).toMatchObject({ multiplier: 1.5, doubleTimeDailyHours: 12, doubleTimeMultiplier: 2, seventhDay: true });
    const meal = (p: RulePack, id: string) => rulesOf(p, 'meal_break').find((r) => r.id === id)!;
    const rest = (p: RulePack) => rulesOf(p, 'rest_break')[0]!;
    expect(meal(LABOR_US_CA, 'ca-meal-1')).toMatchObject({ whenOverHours: 5, minutes: 30, nth: 1, startByHours: 5, citation: { section: '§ 512(a)' } });
    expect(meal(LABOR_US_CA, 'ca-meal-2')).toMatchObject({ whenOverHours: 10, minutes: 30, nth: 2 });
    expect(rest(LABOR_US_CA)).toMatchObject({ minutes: 10, perHours: 4, majorFraction: true, minShiftHours: 3.5 });
    expect(meal(LABOR_US_WA, 'wa-meal')).toMatchObject({ minutes: 30, startAfterHours: 2, startByHours: 5, citation: { section: 'WAC 296-126-092(1)', publisher: 'official' } });
    expect(rest(LABOR_US_WA)).toMatchObject({ minutes: 10, perHours: 4, majorFraction: false, citation: { section: 'WAC 296-126-092(4)' } });
    expect(meal(LABOR_US_CO, 'co-meal')).toMatchObject({ whenOverHours: 5, minutes: 30, citation: { section: 'Rule 5.1' } });
    expect(rest(LABOR_US_CO)).toMatchObject({ minutes: 10, perHours: 4, majorFraction: true, citation: { section: 'Rule 5.2' } });
    for (const p of [LABOR_US_NY, LABOR_US_NY_NYC]) {
      expect(meal(p, 'ny-meal-noon')).toMatchObject({ whenOverHours: 6, minutes: 30, window: { from: 660, to: 840 }, citation: { section: '§ 162(2)' } });
      expect(meal(p, 'ny-meal-evening')).toMatchObject({ minutes: 20, window: { from: 1020, to: 1140 }, shiftStartsBefore: 660, shiftEndsAfter: 1140, citation: { section: '§ 162(3)' } });
      expect(rulesOf(p, 'rest_break')).toEqual([]);
    }
  });

  it('the clinic pack is configuration only: every rule is the org’s policy, none claims to be law', () => {
    expect(CLINIC_TEMPLATE.rules.every((r) => r.basis === 'org_policy')).toBe(true);
    expect(CLINIC_TEMPLATE.labels?.demandUnit).toBe('bookings');
  });

  it('validation rejects uncited law rules and bad numbers', () => {
    const bad: RulePack = {
      ...CHILDCARE_US_CA,
      rules: [
        { id: 'x', label: 'x', kind: 'ratio', ageGroup: 'infant', childrenPerStaff: 0, basis: 'law' } as never,
        { id: 'x', label: 'y', kind: 'ratio', ageGroup: 'aliens', childrenPerStaff: 3, basis: 'org_policy' },
      ],
    };
    expect(validateRulePack(bad)).toEqual([
      'x: a law rule needs a citation or needsVerification',
      'x: childrenPerStaff must be > 0',
      'duplicate rule id x',
      'x: unknown age group aliens',
    ]);
  });
});
