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
}

// Site restructure: `copy` (a per-route tagline) is gone - the text-economy rule is "no page
// has a subtitle under its h1 except the landing page," so /uk etc. no longer show one at
// all. The <title>/meta description in each route's own index.html, plus the country
// selector defaulting correctly via activeCountryPreset() below, already carry the
// distinctiveness these routes exist for.
export const COUNTRY_PRESETS: CountryPreset[] = [
  { slug: 'uk', code: 'GB' },
  { slug: 'canada', code: 'CA' },
  { slug: 'australia', code: 'AU' },
  { slug: 'germany', code: 'DE' },
  { slug: 'ireland', code: 'IE' },
  { slug: 'india', code: 'IN' },
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
