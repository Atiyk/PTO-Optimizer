/**
 * Country landing pages (Phase 2B): static routes at /uk, /canada, /australia, /germany,
 * /ireland, /india, each a real pre-built HTML file (see the top-level <slug>/index.html
 * files) with its own crawlable <title>/meta description, setting
 * `window.__PTO_COUNTRY_PRESET__` before the app's script loads so the SAME app starts
 * with that country selected instead of the geolocated guess. No new app logic - each
 * route is a preset plus copy, per spec.
 */
export interface CountryPreset {
  /** URL path segment: /uk, /canada, etc. */
  slug: string;
  /** ISO country code fed into the solver and holiday lookup, same as the country selector. */
  code: string;
  /** One line of copy shown above the controls on that route, in place of the generic intro. */
  copy: string;
}

export const COUNTRY_PRESETS: CountryPreset[] = [
  { slug: 'uk', code: 'GB', copy: 'Plan your 2027 annual leave around UK bank holidays.' },
  { slug: 'canada', code: 'CA', copy: 'Plan your 2027 time off around Canadian statutory holidays.' },
  { slug: 'australia', code: 'AU', copy: 'Plan your 2027 annual leave around Australian public holidays.' },
  { slug: 'germany', code: 'DE', copy: 'Plan your 2027 Urlaub around German public holidays.' },
  { slug: 'ireland', code: 'IE', copy: 'Plan your 2027 annual leave around Irish public holidays.' },
  { slug: 'india', code: 'IN', copy: 'Plan your 2027 leave around Indian public holidays.' },
];

declare global {
  interface Window {
    __PTO_COUNTRY_PRESET__?: string;
  }
}

/** The active preset for this page load, if any - read once, same pattern as the URL-seeded
 * initial state elsewhere in useAppState. */
export function activeCountryPreset(): CountryPreset | undefined {
  if (typeof window === 'undefined' || !window.__PTO_COUNTRY_PRESET__) return undefined;
  return COUNTRY_PRESETS.find((p) => p.code === window.__PTO_COUNTRY_PRESET__);
}
