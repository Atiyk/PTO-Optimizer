import { describe, expect, it } from 'vitest';
import { monthsElapsed } from './dateUtils';

describe('monthsElapsed', () => {
  it('counts full months by day of month', () => {
    expect(monthsElapsed('2026-01-15', '2026-02-14')).toBe(0);
    expect(monthsElapsed('2026-01-15', '2026-02-15')).toBe(1);
    expect(monthsElapsed('2026-03-10', '2026-01-10')).toBe(0);
  });

  it('treats the last day of a shorter month as a full month from the 29th-31st', () => {
    expect(monthsElapsed('2026-10-31', '2026-11-30')).toBe(1);
    expect(monthsElapsed('2026-01-31', '2026-02-28')).toBe(1);
    expect(monthsElapsed('2026-01-31', '2026-03-30')).toBe(1);
    expect(monthsElapsed('2026-01-31', '2026-03-31')).toBe(2);
    expect(monthsElapsed('2028-01-30', '2028-02-29')).toBe(1);
    expect(monthsElapsed('2026-01-30', '2026-02-27')).toBe(0);
  });
});
