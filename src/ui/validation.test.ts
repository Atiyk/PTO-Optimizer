import { describe, it, expect } from 'vitest';
import { validateInputs } from './validation';

function valid() {
  return { rangeStart: '2026-01-01', rangeEnd: '2026-12-31', budget: 15, expiryEnabled: false, expiryDate: '2026-12-31' };
}

describe('validateInputs', () => {
  it('returns no issues for well-formed input', () => {
    expect(validateInputs(valid())).toEqual([]);
  });

  it('flags end before start', () => {
    const issues = validateInputs({ ...valid(), rangeStart: '2026-06-01', rangeEnd: '2026-01-01' });
    expect(issues).toContain('End date is before the start date.');
  });

  it('flags a negative budget', () => {
    const issues = validateInputs({ ...valid(), budget: -5 });
    expect(issues).toContain("PTO days available can't be negative.");
  });

  it('flags an absurdly large budget, but not a merely generous one', () => {
    expect(validateInputs({ ...valid(), budget: 60 })).toEqual([]); // generous but real
    expect(validateInputs({ ...valid(), budget: 400 })).toEqual([]); // still technically fine
    const issues = validateInputs({ ...valid(), budget: 99999 });
    expect(issues.some((i) => i.includes('99999'))).toBe(true);
  });

  it('flags an expiry date outside the selected range', () => {
    const before = validateInputs({ ...valid(), expiryEnabled: true, expiryDate: '2025-12-01' });
    expect(before).toContain('Expiry date is outside the selected date range.');
    const after = validateInputs({ ...valid(), expiryEnabled: true, expiryDate: '2027-01-15' });
    expect(after).toContain('Expiry date is outside the selected date range.');
  });

  it('does not flag expiry when it is disabled, even if the stored date is stale from a previous range', () => {
    const issues = validateInputs({ ...valid(), expiryEnabled: false, expiryDate: '1999-01-01' });
    expect(issues).toEqual([]);
  });

  it('an expiry date within range is fine', () => {
    const issues = validateInputs({ ...valid(), expiryEnabled: true, expiryDate: '2026-06-15' });
    expect(issues).toEqual([]);
  });

  it('reports every issue at once, not just the first', () => {
    const issues = validateInputs({
      rangeStart: '2026-06-01',
      rangeEnd: '2026-01-01',
      budget: -5,
      expiryEnabled: true,
      expiryDate: '2026-06-15',
    });
    expect(issues.length).toBeGreaterThanOrEqual(2);
  });

  it('does not pile on an inverted-range-specific expiry complaint when the range itself is already invalid', () => {
    // rangeEnd < rangeStart makes "is expiry inside the range" meaningless - don't report a
    // second, confusing issue about a range that's already flagged as wrong.
    const issues = validateInputs({
      rangeStart: '2026-06-01',
      rangeEnd: '2026-01-01',
      budget: 15,
      expiryEnabled: true,
      expiryDate: '2026-03-01',
    });
    expect(issues).toEqual(['End date is before the start date.']);
  });
});


describe('untrusted calendar range bounds', () => {
  it('rejects windows that could create an unbounded calendar while allowing future years', () => {
    const base = { budget: 15, expiryEnabled: false, expiryDate: '' };
    expect(validateInputs({ ...base, rangeStart: '0100-01-01', rangeEnd: '9999-12-31' })).toContain('Choose a planning window of ten years or less.');
    expect(validateInputs({ ...base, rangeStart: '2050-01-01', rangeEnd: '2050-12-31' })).toEqual([]);
    expect(validateInputs({ ...base, rangeStart: '2028-02-29', rangeEnd: '2038-02-28' })).toEqual([]);
  });
});
