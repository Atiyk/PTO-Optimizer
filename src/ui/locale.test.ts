import { describe, it, expect } from 'vitest';
import { weekStartForCountry } from './locale';

describe('weekStartForCountry', () => {
  it('US, Canada, Japan start the week on Sunday', () => {
    expect(weekStartForCountry('US')).toBe(0);
    expect(weekStartForCountry('CA')).toBe(0);
    expect(weekStartForCountry('JP')).toBe(0);
  });

  it('Europe, UK, Australia start the week on Monday', () => {
    expect(weekStartForCountry('GB')).toBe(1);
    expect(weekStartForCountry('DE')).toBe(1);
    expect(weekStartForCountry('FR')).toBe(1);
    expect(weekStartForCountry('AU')).toBe(1);
  });

  it('defaults unmapped countries to Monday (ISO 8601)', () => {
    expect(weekStartForCountry('ZZ')).toBe(1);
  });
});
