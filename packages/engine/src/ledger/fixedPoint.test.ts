import { describe, expect, it } from 'vitest';
import { sumAmounts, toUnits } from './fixedPoint';

describe('fixed-point ledger sums', () => {
  it('sums float-unfriendly amounts exactly', () => {
    // 0.1 + 0.2 = 0.30000000000000004 in floats; exactly 0.3 here.
    expect(sumAmounts([0.1, 0.2])).toBe(0.3);
  });
  it('accepts numeric strings as returned by Postgres numeric columns', () => {
    expect(sumAmounts(['1.5000', '-0.2500', '3'])).toBe(4.25);
  });
  it('rejects non-finite amounts', () => {
    expect(() => toUnits('abc')).toThrow(RangeError);
  });
  it('empty ledger sums to zero', () => {
    expect(sumAmounts([])).toBe(0);
  });
});
