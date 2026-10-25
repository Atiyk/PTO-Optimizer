import { describe, it, expect } from 'vitest';
import { COUNTRIES, subdivisionLabel, SUBDIVISION_NAMES } from './countries';

describe('COUNTRIES (Phase 2: full Nager.Date list, not a hand-picked subset)', () => {
  it('has well over 100 countries, not the old 35-country subset', () => {
    expect(COUNTRIES.length).toBeGreaterThan(100);
  });

  it('every entry has a non-empty code and name', () => {
    for (const c of COUNTRIES) {
      expect(c.code.length).toBeGreaterThan(0);
      expect(c.name.length).toBeGreaterThan(0);
    }
  });

  it('codes are unique', () => {
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('still includes every country this app has a dedicated landing page for, except India', () => {
    // Surprising finding, not a Phase 2 regression: Nager.Date has NO holiday data for
    // India at all - not absent from this list by omission, genuinely unsupported (its own
    // AvailableCountries response has no "IN" entry, and PublicHolidays/2027/IN returns
    // 204 No Content). The app's own /india landing page has always shown a weekends-only
    // plan as a result - see the "no holidays at all" coverage below for why that's safe.
    const codes = new Set(COUNTRIES.map((c) => c.code));
    for (const code of ['US', 'GB', 'CA', 'AU', 'DE', 'IE']) {
      expect(codes.has(code)).toBe(true);
    }
    expect(codes.has('IN')).toBe(false);
  });

  it('includes countries well outside the old hand-picked subset (confirms the list actually expanded)', () => {
    const codes = new Set(COUNTRIES.map((c) => c.code));
    // None of these were in the old 35-country array.
    for (const code of ['AD', 'BB', 'BM', 'BA', 'CY']) {
      expect(codes.has(code)).toBe(true);
    }
  });
});

describe('subdivisionLabel', () => {
  it('returns the hand-named label for a code we have a friendly name for', () => {
    expect(subdivisionLabel('US-CA')).toBe('California');
    expect(subdivisionLabel('GB-SCT')).toBe('Scotland');
    expect(subdivisionLabel('AU-NSW')).toBe('New South Wales');
  });

  it('falls back to the code with its country prefix stripped when we have no hand-named label', () => {
    // Nager.Date's own `counties` values are bare codes with no name attached - any code not
    // in SUBDIVISION_NAMES (e.g. Germany's, which this app has no hand-named table for) must
    // still render as something usable, not crash or show blank.
    expect(subdivisionLabel('DE-BY')).toBe('BY');
    expect(subdivisionLabel('FR-75')).toBe('75');
  });

  it('returns the raw code unchanged if it has no dash at all', () => {
    expect(subdivisionLabel('WEIRD')).toBe('WEIRD');
  });

  it('SUBDIVISION_NAMES has no stale references to the old removed SUBDIVISIONS-by-country shape', () => {
    // Every key should look like "XX-YYY", a flat code, not a bare country code.
    for (const key of Object.keys(SUBDIVISION_NAMES)) {
      expect(key).toMatch(/^[A-Z]{2}-[A-Z0-9]+$/);
    }
  });
});
