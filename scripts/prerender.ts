/**
 * Post-build prerender step (Phase 1). Run with: npm run build (postbuild hook) or
 * directly via `tsx scripts/prerender.ts` after `vite build` has produced dist/.
 *
 * BUG FOUND: every route shipped `<body><div id="root"></div></body>` - confirmed with
 * curl against the live production URL, not devtools (devtools shows the post-hydration
 * DOM and hides exactly this problem). The entire app, including the FAQ text and all body
 * copy, was invisible to any crawler that doesn't execute JavaScript. Confirmed on both `/`
 * and `/uk` before this script existed.
 *
 * FIX: this is a plain Node build step, no server and no framework switch, as specced -
 * vite-react-ssg/vite-plugin-ssg are built around a single entry + client-side router,
 * which doesn't match this app's actual shape (7 independent static HTML entries, country
 * selection driven by a `window.__PTO_COUNTRY_PRESET__` global set inline before the
 * shared bundle loads - see countryPresets.ts). A small custom script that mirrors that
 * same mechanism is the more surgical fix for this specific architecture, not a deviation
 * from the spirit of the instruction ("a build step on a static site").
 *
 * For each of the 7 built HTML files, this: spins up a real jsdom window (already a
 * project dependency, used by vitest) so every `window`/`document`/`navigator` access the
 * app already defensively guards against (see useAppState's `typeof window === 'undefined'`
 * branch, useHasHover's and geo.ts's try/catch around matchMedia/navigator) resolves the
 * same way it would in a real browser; sets window.__PTO_COUNTRY_PRESET__ exactly as that
 * route's own HTML does; renders <App/> with react-dom/server's renderToString; and splices
 * the result into that file's empty #root div. No useEffect runs during renderToString (the
 * holiday fetch included), so the snapshot shows the app's deterministic initial state, not
 * a live solve - that's sufficient and correct for what Phase 1 is actually for: static
 * text (headline, FAQ, footer, labels) being present in the initial HTML for a crawler that
 * doesn't execute JS. The client re-renders over this on hydration exactly as before.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { ITEMS as FAQ_ITEMS } from '../src/ui/FAQ.tsx';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const distDir = resolve(projectRoot, 'dist');

interface Entry {
  /** Path relative to dist/ of the built HTML file to inject into. */
  file: string;
  /** URL this route is served at, for window.location inside the render. */
  url: string;
  /** Matches the inline `window.__PTO_COUNTRY_PRESET__` each entry's own HTML sets. */
  countryPreset?: string;
  /** Human-readable name for the BreadcrumbList's second item - undefined on the root route,
   * which has no second breadcrumb level. */
  countryName?: string;
}

const ENTRIES: Entry[] = [
  { file: 'index.html', url: 'https://pto-optimizer.app/' },
  { file: 'uk/index.html', url: 'https://pto-optimizer.app/uk', countryPreset: 'GB', countryName: 'United Kingdom' },
  { file: 'canada/index.html', url: 'https://pto-optimizer.app/canada', countryPreset: 'CA', countryName: 'Canada' },
  { file: 'australia/index.html', url: 'https://pto-optimizer.app/australia', countryPreset: 'AU', countryName: 'Australia' },
  { file: 'germany/index.html', url: 'https://pto-optimizer.app/germany', countryPreset: 'DE', countryName: 'Germany' },
  { file: 'ireland/index.html', url: 'https://pto-optimizer.app/ireland', countryPreset: 'IE', countryName: 'Ireland' },
  { file: 'india/index.html', url: 'https://pto-optimizer.app/india', countryPreset: 'IN', countryName: 'India' },
];

/** Decodes the small, fixed set of HTML entities this project's own <title>/<meta> tags
 * actually use - JSON-LD is JSON text, not HTML, so "UK Bank Holidays 2027 &mdash; PTO
 * Optimizer" must become a real em dash, not ship the literal entity string. */
function decodeEntities(s: string): string {
  return s
    .replace(/&mdash;/g, '—')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractMeta(html: string, fallbackUrl: string): { title: string; description: string; canonical: string } {
  const title = decodeEntities(/<title>(.*?)<\/title>/s.exec(html)?.[1] ?? 'PTO Optimizer');
  const description = decodeEntities(/<meta\s+name="description"\s+content="([^"]*)"/s.exec(html)?.[1] ?? '');
  const canonical = /<link rel="canonical" href="([^"]*)"/.exec(html)?.[1] ?? fallbackUrl;
  return { title, description, canonical };
}

/**
 * Structured data (Phase 5): WebApplication so a crawler/agent can tell this is a free,
 * no-signup tool rather than an article; BreadcrumbList for the root->country relationship;
 * FAQPage built from FAQ.tsx's own exported ITEMS array, not a duplicated copy, so the
 * structured data can never drift from the six questions a visitor actually sees.
 */
function buildJsonLd(entry: Entry, meta: { title: string; description: string; canonical: string }): object[] {
  const webApplication = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: meta.title,
    url: meta.canonical,
    description: meta.description,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Any (web browser)',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  };

  const breadcrumbItems = [{ '@type': 'ListItem', position: 1, name: 'PTO Optimizer', item: 'https://pto-optimizer.app/' }];
  if (entry.countryName) {
    breadcrumbItems.push({ '@type': 'ListItem', position: 2, name: entry.countryName, item: meta.canonical });
  }
  const breadcrumbList = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbItems,
  };

  const faqPage = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_ITEMS.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };

  return [webApplication, breadcrumbList, faqPage];
}

/** Node 25+ ships its own non-configurable `navigator` global (the Node runtime's, not a
 * browser's) - plain assignment throws "only a getter". defineProperty with
 * configurable:true overrides it the same way jsdom's own test environment does. */
function setGlobal(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

function installWindow(url: string, countryPreset?: string): void {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url });
  const win = dom.window as unknown as typeof globalThis;
  setGlobal('window', win);
  setGlobal('document', win.document);
  setGlobal('navigator', win.navigator);
  setGlobal('location', win.location);
  if (countryPreset) {
    (win as unknown as { __PTO_COUNTRY_PRESET__?: string }).__PTO_COUNTRY_PRESET__ = countryPreset;
  }
}

// A window must exist BEFORE App is even imported, in case anything in its import chain
// touches `window` at module-evaluation time rather than inside a function - using the
// first entry's own URL/preset rather than a placeholder, so that if it DOES matter, the
// very first render is still correct.
installWindow(ENTRIES[0].url, ENTRIES[0].countryPreset);
const { App } = await import('../src/ui/App.tsx');

async function prerenderEntry(entry: Entry): Promise<{ file: string; bytesInjected: number }> {
  // Re-installed per entry (not reused from the bootstrap above) - window/navigator differ
  // per route (different URL, different country preset), and activeCountryPreset() /
  // geolocateCountry() read them fresh on every call rather than caching at module scope.
  installWindow(entry.url, entry.countryPreset);

  const html = renderToString(React.createElement(App));

  const filePath = resolve(distDir, entry.file);
  if (!existsSync(filePath)) {
    throw new Error(`Expected built file not found: ${filePath} - did vite build run first?`);
  }
  const original = readFileSync(filePath, 'utf-8');
  const marker = '<div id="root"></div>';
  if (!original.includes(marker)) {
    throw new Error(`${entry.file}: expected marker ${JSON.stringify(marker)} not found - was it already prerendered, or did the shell HTML change?`);
  }
  const withRoot = original.replace(marker, `<div id="root">${html}</div>`);

  const meta = extractMeta(original, entry.url);
  const jsonLdScripts = buildJsonLd(entry, meta)
    .map((obj) => `    <script type="application/ld+json">${JSON.stringify(obj)}</script>`)
    .join('\n');
  const headMarker = '</head>';
  if (!withRoot.includes(headMarker)) {
    throw new Error(`${entry.file}: no </head> found - can't inject structured data.`);
  }
  const injected = withRoot.replace(headMarker, `${jsonLdScripts}\n  </head>`);
  writeFileSync(filePath, injected, 'utf-8');

  return { file: entry.file, bytesInjected: html.length };
}

async function main() {
  console.log(`Prerendering ${ENTRIES.length} routes into ${distDir}...`);
  for (const entry of ENTRIES) {
    const { file, bytesInjected } = await prerenderEntry(entry);
    console.log(`  ${file}: injected ${bytesInjected} bytes of static markup`);
  }
  console.log('Prerender complete.');
}

main().catch((err) => {
  console.error('Prerender failed:', err);
  process.exit(1);
});
