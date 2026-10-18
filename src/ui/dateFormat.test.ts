import { describe, it, expect } from 'vitest';
import { formatShort, formatLong, formatDateRange } from './dateFormat';

describe('dateFormat', () => {
  it('formatShort', () => {
    expect(formatShort('2026-10-24')).toBe('Oct 24');
  });

  it('formatLong', () => {
    expect(formatLong('2026-10-24')).toBe('October 24, 2026');
  });

  it('formatDateRange within the same year', () => {
    expect(formatDateRange('2026-10-24', '2026-11-01')).toBe('Oct 24 - Nov 1, 2026');
  });

  it('formatDateRange spanning a year boundary', () => {
    expect(formatDateRange('2026-12-28', '2027-01-03')).toBe('Dec 28, 2026 - Jan 3, 2027');
  });

  it('formatDateRange collapses to a single date when start equals end', () => {
    expect(formatDateRange('2026-10-24', '2026-10-24')).toBe('Oct 24, 2026');
  });

  it('never shifts the day across timezones - built from parsed integers, not a Date object', () => {
    // A regression guard: formatting must not route through new Date(iso) + toLocaleDateString.
    expect(formatShort('2026-01-01')).toBe('Jan 1');
    expect(formatShort('2026-12-31')).toBe('Dec 31');
  });
});
