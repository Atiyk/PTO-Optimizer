import { describe, expect, it } from 'vitest';
import { analyzeBalanceText, extractBalanceCandidates, parseAmount, type BalanceCandidate } from './balanceExtract';

const TODAY = '2026-11-04';

interface Case {
  name: string;
  text: string;
  unit?: 'days' | 'hours';
  /** Expected top candidate (subset match). Null = no candidates. */
  top: Partial<BalanceCandidate> | null;
  /** Values that must NOT appear among candidates. */
  absent?: number[];
  /** Values that must appear somewhere among candidates. */
  present?: number[];
}

const CASES: Case[] = [
  {
    name: 'inline vacation balance in hours',
    text: 'Vacation Balance 12.50 hrs',
    top: { value: 12.5, unit: 'hours', unitStated: true, kind: 'vacation', label: 'Vacation balance' },
  },
  {
    name: 'PTO available with colon and no unit (96 is read as hours)',
    text: 'PTO Available: 96.00',
    top: { value: 96, unit: 'hours', unitStated: false, kind: 'pto', label: 'PTO available' },
  },
  {
    name: 'annual leave remaining in days',
    text: 'Annual leave remaining 14.5 days',
    top: { value: 14.5, unit: 'days', kind: 'annual', label: 'Annual leave remaining' },
  },
  {
    name: 'small unitless number falls back to the page unit',
    text: 'Vacation available 9',
    unit: 'days',
    top: { value: 9, unit: 'days', unitStated: false },
  },
  {
    name: 'comma decimal',
    text: 'Urlaub Resturlaub verfügbar 12,5 Tage\nVacation remaining 12,5 days',
    top: { value: 12.5, unit: 'days' },
  },
  {
    name: 'thousands comma is not a decimal comma',
    text: 'Vacation balance 1,040 hours',
    top: { value: 1040, unit: 'hours' },
  },
  {
    name: 'European thousands and decimal',
    text: 'Vacation balance 1.040,50 hours',
    top: { value: 1040.5, unit: 'hours' },
  },
  {
    name: 'negative balance with a minus sign',
    text: 'PTO balance -3.5 days',
    top: { value: -3.5, unit: 'days' },
  },
  {
    name: 'accounting-style negative in parentheses',
    text: 'Vacation Bal (4.00) hrs',
    top: { value: -4, unit: 'hours' },
  },
  {
    name: 'trailing-minus negative (ADP style)',
    text: 'Vac Hrs Avail 6.00-',
    top: { value: -6, unit: 'hours' },
  },
  {
    name: 'sick leave only gives no candidates',
    text: 'Sick Leave Balance 40.00 hrs\nSick used 8.00',
    top: null,
  },
  {
    name: 'paid sick leave is not paid time off',
    text: 'Paid sick leave available 24 hours',
    top: null,
  },
  {
    name: 'ADP My Time Off: sick (PSL) beside PTO',
    text: 'CA FT Supplemental PSL 22: 80.00 hours\nPTO FTNE: 7.00 hours',
    top: { value: 7, unit: 'hours', kind: 'pto' },
    absent: [80, 22],
  },
  {
    name: 'vacation and sick on one line',
    text: 'Vacation 40.00 Sick 16.00 (hours available)',
    top: { value: 40, unit: 'hours', kind: 'vacation' },
    absent: [16],
  },
  {
    name: 'Paychex-style table: Accrued / Used / Available',
    text: 'Time Off     Accrued    Used    Available\nVacation     3.08       8.00    37.00\nSick         1.54       0.00    20.00',
    top: { value: 37, kind: 'vacation', label: 'Vacation available' },
    absent: [3.08, 8, 20, 1.54],
  },
  {
    name: 'BambooHR paystub table with YTD columns',
    text: [
      'Time Off Balances (hours)',
      'Category   Taken this period   Earned YTD   Taken YTD   Balance',
      'Vacation   8.00                 92.31        40.00       52.31',
      'Sick       0.00                 24.00        4.00        20.00',
    ].join('\n'),
    top: { value: 52.31, unit: 'hours', kind: 'vacation', label: 'Vacation balance' },
    absent: [92.31, 40, 20],
  },
  {
    name: 'Workday plan table with Beginning / Accrued / Paid / Ending',
    text: [
      'Balance as of 10/31/2026',
      'Time Off Plan   Beginning Year Balance   Accrued Year to Date   Time Off Paid Year to Date   Ending Period Balance',
      'Vacation Plan   10                       12.5                   8                            14.5',
    ].join('\n'),
    unit: 'days',
    top: { value: 14.5, kind: 'vacation', asOf: '2026-10-31', label: 'Vacation balance' },
    absent: [10, 12.5, 8],
  },
  {
    name: 'payslip earnings table vacation row is hours PAID, not a balance',
    text: [
      'Earnings     Rate     Hours    This Period    Year to Date',
      'Regular      25.00    72.00    1,800.00       39,600.00',
      'Vacation     25.00    8.00     200.00         1,000.00',
      '',
      'Vacation Hrs Avail 52.50',
    ].join('\n'),
    top: { value: 52.5, unit: 'hours', kind: 'vacation' },
    absent: [8, 200, 25],
  },
  {
    name: 'currency amounts are ignored',
    text: 'Vacation pay $1,200.00\nVacation balance 15 days',
    top: { value: 15, unit: 'days' },
    absent: [1200],
  },
  {
    name: 'as of date in US format',
    text: 'Vacation available 12.5 days as of 10/31/2026',
    top: { value: 12.5, asOf: '2026-10-31' },
  },
  {
    name: 'as of written with month name',
    text: 'PTO balance as of Oct 31, 2026\nAvailable 12.5 days',
    top: { value: 12.5, asOf: '2026-10-31' },
  },
  {
    name: 'period ending date',
    text: 'Period Ending: 10/31/2026    Pay Date: 11/06/2026\nVacation Balance 40.00 hrs',
    top: { value: 40, asOf: '2026-10-31' },
  },
  {
    name: 'pay date when nothing better is given',
    text: 'Pay Date 11/06/2026\nVacation Balance 40.00 hrs',
    top: { value: 40, asOf: '2026-11-06' },
  },
  {
    name: 'pay period range uses its end date',
    text: 'Pay period: 10/16/2026 - 10/31/2026\nPTO avail 61.5 hrs',
    top: { value: 61.5, asOf: '2026-10-31' },
  },
  {
    name: 'day-first dates on a UK payslip',
    text: 'Pay date 28/10/2026\nHoliday entitlement 28 days\nHoliday taken 12 days\nHoliday remaining 16 days',
    top: { value: 16, unit: 'days', asOf: '2026-10-28' },
    absent: [12],
  },
  {
    name: 'far-future dates are not used as as-of',
    text: 'Vacation balance 10 days\nPlan year ends 12/31/2030',
    top: { value: 10 },
  },
  {
    name: 'label above value (HR card layout)',
    text: 'Vacation\nAvailable\n12.5 days\nSick\nAvailable\n5 days',
    top: { value: 12.5, kind: 'vacation' },
    absent: [5],
  },
  {
    name: 'value before role word (BambooHR screen)',
    text: 'Vacation\n12.5 days available\n3 days scheduled',
    top: { value: 12.5, unit: 'days', kind: 'vacation', label: 'Vacation available' },
    absent: [3],
  },
  {
    name: 'used and available on one line prefers available',
    text: 'Vacation used 3 days, available 9.5 days',
    top: { value: 9.5 },
    absent: [3],
  },
  {
    name: 'OCR noisy spacing and glued units',
    text: 'Vacation   Balance   12.50hrs',
    top: { value: 12.5, unit: 'hours' },
  },
  {
    name: 'OCR letter-for-digit slips (O for 0, l for 1)',
    text: 'PTO Balance 4O.5 hrs\nVacation remaining l2.5 days',
    present: [40.5, 12.5],
    top: { unitStated: true },
  },
  {
    name: 'OCR split decimal',
    text: 'Vacation balance 12. 50 hours',
    top: { value: 12.5 },
  },
  {
    name: 'multiple leave types rank vacation over personal and floating',
    text: 'Floating holiday available 1 day\nPersonal days remaining 2 days\nVacation remaining 11 days',
    top: { value: 11, kind: 'vacation' },
    present: [1, 2],
  },
  {
    name: 'year in a label is not a balance',
    text: '2026 Vacation balance 18 days',
    top: { value: 18 },
    absent: [2026],
  },
  {
    name: 'no numbers at all',
    text: 'Welcome to your time off dashboard',
    top: null,
  },
  {
    name: 'empty text',
    text: '   ',
    top: null,
  },
  {
    name: 'accrued only falls back to accrued as a low-confidence candidate',
    text: 'Vacation accrued 40 hours',
    top: { value: 40, label: 'Vacation accrued' },
  },
  {
    name: 'implausible huge day count is dropped',
    text: 'Vacation balance 900 days',
    top: null,
  },
  {
    name: 'same value in This Period and To Date columns is shown once',
    text: 'Vac Hrs Avail 40.00 40.00',
    top: { value: 40 },
  },
  {
    name: 'accrued this period and YTD on an ADP line are not balances',
    text: 'Vac Accrued 3.08 37.00\nVac Avail 52.00',
    top: { value: 52 },
    absent: [3.08, 37],
  },
  {
    name: 'pipe-separated table from OCR',
    text: 'Plan | Beginning Balance | Used | Remaining\nPTO | 15 | 3 | 12',
    unit: 'days',
    top: { value: 12, kind: 'pto', label: 'PTO remaining' },
    absent: [15, 3],
  },
  {
    name: 'real OCR output: blank lines between table rows keep the table',
    text: [
      'ACME Corp - Earnings Statement',
      'Period Ending: 10/31/2026 Pay Date: 11/06/2026',
      'Earnings Rate Hours This Period Year to Date',
      'Regular 32.50 80.00 2,600.00     52,000.00',
      'Vacation 32.50 8.00 260.00     1,040.00',
      'Time Off Accrued Used Available',
      '',
      'Vacation 4.62      8.00 52.50',
      '',
      'Sick      1.85      0.00 24.00',
      '',
      'Floating Holiday   0.00   0.00   8.00',
    ].join('\n'),
    top: { value: 52.5, unit: 'hours', kind: 'vacation', asOf: '2026-10-31', label: 'Vacation available' },
    present: [8],
    absent: [4.62, 24, 260, 32.5, 0],
  },
  {
    name: 'a paragraph after a table ends it',
    text: 'Time Off   Accrued   Used   Available\nVacation  1  2  10 days\nPlease contact HR with any questions about this statement\nVacation 3 days',
    top: { value: 10, label: 'Vacation available' },
  },
  {
    name: 'leave balance with generic wording',
    text: 'Leave balance 7.5 days',
    top: { value: 7.5, kind: 'generic' },
  },
];

describe('extractBalanceCandidates (table)', () => {
  it.each(CASES)('$name', ({ text, unit, top, absent, present }) => {
    const candidates = extractBalanceCandidates(text, { today: TODAY, unit });
    if (top === null) {
      expect(candidates).toEqual([]);
    } else {
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates[0]).toMatchObject(top);
    }
    const values = candidates.map((c) => c.value);
    for (const v of absent ?? []) expect(values).not.toContain(v);
    for (const v of present ?? []) expect(values).toContain(v);
    // Always sorted by confidence and bounded.
    for (let i = 1; i < candidates.length; i++) expect(candidates[i - 1].confidence).toBeGreaterThanOrEqual(candidates[i].confidence);
    expect(candidates.length).toBeLessThanOrEqual(6);
  });
});

describe('analyzeBalanceText reasons', () => {
  it.each([
    ['', 'empty'],
    ['Your balances are shown below', 'no-numbers'],
    ['Sick leave available 24 hours', 'only-other-leave'],
    ['Employee ID 4512 Dept 12 Net pay $1,200.00', 'no-balance'],
  ])('%j -> %s', (text, reason) => {
    expect(analyzeBalanceText(text, { today: TODAY })).toEqual({ candidates: [], reason });
  });
});

describe('candidate details', () => {
  it('keeps the trimmed source line', () => {
    const [c] = extractBalanceCandidates('   Vacation    Balance   12.50 hrs   ', { today: TODAY });
    expect(c.sourceLine).toBe('Vacation Balance 12.50 hrs');
  });

  it('is deterministic', () => {
    const text = CASES.map((c) => c.text).join('\n\n');
    expect(extractBalanceCandidates(text, { today: TODAY })).toEqual(extractBalanceCandidates(text, { today: TODAY }));
  });

  it('a yearless as-of date means the most recent one', () => {
    const [c] = extractBalanceCandidates('Vacation balance as of Dec 15: 10 days', { today: TODAY });
    expect(c.asOf).toBe('2025-12-15');
  });

  it('stated balance outranks an unlabelled vacation number', () => {
    const c = extractBalanceCandidates('Vacation 8.00\nVacation balance 30.00 hrs', { today: TODAY });
    expect(c[0].value).toBe(30);
  });
});

describe('parseAmount', () => {
  it.each([
    ['12.50', 12.5], ['12,5', 12.5], ['12,50', 12.5], ['1,234', 1234], ['1,234.50', 1234.5],
    ['1.234,50', 1234.5], ['(3.50)', -3.5], ['3.50-', -3.5], ['-2', -2], ['−2', -2], ['abc', null], ['1.2.3', null],
  ])('%s -> %s', (raw, value) => {
    expect(parseAmount(raw)).toBe(value);
  });
});
