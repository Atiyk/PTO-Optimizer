/**
 * The one list of every real route this site builds, shared (no side effects - safe to
 * import from anywhere) between scripts/prerender.ts and scripts/build-seo-files.ts, so a
 * route can't exist in the sitemap but not be prerendered, or vice versa.
 */
export type ComponentKind = 'landing' | 'app' | 'sabbatical';

export interface Entry {
  /** Path relative to dist/ of the built HTML file to inject into. */
  file: string;
  /** Path this route is served at (no domain - joined with SITE_URL, Phase 1's one source
   * of truth for the origin, everywhere a full URL is actually needed). */
  path: string;
  /** Which top-level component this route mounts. */
  component: ComponentKind;
  /** Matches the inline `window.__PTO_COUNTRY_PRESET__` each entry's own HTML sets. */
  countryPreset?: string;
  /** Human-readable name for the BreadcrumbList's second item - undefined on routes with no
   * second breadcrumb level (the landing page, /pto, /sabbatical). */
  countryName?: string;
  /** sitemap.xml priority (scripts/build-seo-files.ts) - kept on the same entry as every
   * other per-route fact so the sitemap can never list a route this file doesn't know
   * about, or vice versa. */
  sitemapPriority: number;
}

// Site restructure: "/" is the landing page, the optimizer itself moved to /pto (same
// App.tsx component it always was), and /sabbatical is new - every country route below is
// untouched, since none of those links need to move.
export const ENTRIES: Entry[] = [
  { file: 'index.html', path: '/', component: 'landing', sitemapPriority: 1.0 },
  { file: 'pto/index.html', path: '/pto', component: 'app', sitemapPriority: 0.9 },
  { file: 'sabbatical/index.html', path: '/sabbatical', component: 'sabbatical', sitemapPriority: 0.9 },
  { file: 'uk/index.html', path: '/uk', component: 'app', countryPreset: 'GB', countryName: 'United Kingdom', sitemapPriority: 0.8 },
  { file: 'canada/index.html', path: '/canada', component: 'app', countryPreset: 'CA', countryName: 'Canada', sitemapPriority: 0.8 },
  { file: 'australia/index.html', path: '/australia', component: 'app', countryPreset: 'AU', countryName: 'Australia', sitemapPriority: 0.8 },
  { file: 'germany/index.html', path: '/germany', component: 'app', countryPreset: 'DE', countryName: 'Germany', sitemapPriority: 0.8 },
  { file: 'ireland/index.html', path: '/ireland', component: 'app', countryPreset: 'IE', countryName: 'Ireland', sitemapPriority: 0.8 },
  { file: 'india/index.html', path: '/india', component: 'app', countryPreset: 'IN', countryName: 'India', sitemapPriority: 0.8 },
];
