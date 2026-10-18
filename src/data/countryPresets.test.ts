import { describe, it, expect, afterEach } from 'vitest';
import { activeCountryPreset, COUNTRY_PRESETS } from './countryPresets';

afterEach(() => {
  delete window.__PTO_COUNTRY_PRESET__;
});

describe('countryPresets', () => {
  it('has exactly the six spec\'d country routes, each with a distinct slug and code', () => {
    expect(COUNTRY_PRESETS.map((p) => p.slug).sort()).toEqual(
      ['australia', 'canada', 'germany', 'india', 'ireland', 'uk'].sort(),
    );
    const codes = COUNTRY_PRESETS.map((p) => p.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('returns undefined when no preset global is set', () => {
    expect(activeCountryPreset()).toBeUndefined();
  });

  it('resolves the matching preset once the global is set', () => {
    window.__PTO_COUNTRY_PRESET__ = 'GB';
    expect(activeCountryPreset()?.slug).toBe('uk');
  });

  it('returns undefined for an unrecognised code rather than throwing', () => {
    window.__PTO_COUNTRY_PRESET__ = 'ZZ';
    expect(() => activeCountryPreset()).not.toThrow();
    expect(activeCountryPreset()).toBeUndefined();
  });
});
