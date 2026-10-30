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
import { SABBATICAL_FAQ_ITEMS } from '../src/ui/sabbaticalFaqItems.ts';
import { GLOSSARY_TERMS } from '../src/content/glossary/terms.ts';
import { rawHolidaysToHolidays, type Holiday } from '@daysoff/engine/data/holidays';
import { getSiteUrl } from './siteUrl.ts';
import { ENTRIES, type Entry, type ComponentKind } from './routes.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const distDir = resolve(projectRoot, 'dist');
const publicHolidaysDir = resolve(projectRoot, 'public/holidays');
const SITE_URL = getSiteUrl();
/** The build date, stamped onto the HTML next to every date-relative claim it makes (the
 * countdown, "N days away", placement dates) - those numbers are computed once, here, and
 * go stale every day the site isn't rebuilt. See PROGRESS.md / the Phase 2 PR for the
 * GitHub Actions workflow that redeploys daily to keep this drift small. */
const PRERENDERED_AT = new Date().toISOString();

/**
 * Phase 2 (fixes K1): loads the SAME static files scripts/build-holidays.ts commits,
 * directly in Node, for the years this route's holiday-dependent UI actually needs -
 * 3 calendar years from "today" covers both the landing page's 12-month strip and
 * /sabbatical's ~18-month search window. Missing files (a country the last
 * build-holidays.ts run couldn't reach and had no prior committed copy for) are skipped
 * silently - that route's SSR falls back to an empty list for this phase, exactly the
 * pre-Phase-2 behavior, not a new failure mode.
 */
function loadStaticHolidaysForSsr(countryCode: string): Holiday[] {
  const currentYear = new Date().getUTCFullYear();
  const years = [currentYear, currentYear + 1, currentYear + 2];
  const raw = years.flatMap((year) => {
    const filePath = resolve(publicHolidaysDir, `${countryCode}-${year}.json`);
    if (!existsSync(filePath)) return [];
    try {
      return JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch {
      return [];
    }
  });
  return rawHolidaysToHolidays(raw);
}

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
  const title = decodeEntities(/<title>(.*?)<\/title>/s.exec(html)?.[1] ?? 'Days Off');
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

  const breadcrumbItems = [{ '@type': 'ListItem', position: 1, name: 'Days Off', item: `${SITE_URL}/` }];
  if (entry.countryName) {
    breadcrumbItems.push({ '@type': 'ListItem', position: 2, name: entry.countryName, item: meta.canonical });
  }
  const breadcrumbList = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbItems,
  };

  const result: object[] = [webApplication, breadcrumbList];

  // FAQPage for whichever FAQ array(s) that route actually renders - /faq shows both
  // tools' questions, so its own structured data combines both arrays rather than
  // picking one. The landing page and /data-sources have no FAQ section, so neither
  // gets this block at all.
  const faqItems =
    entry.component === 'app'
      ? FAQ_ITEMS
      : entry.component === 'sabbatical'
        ? SABBATICAL_FAQ_ITEMS
        : entry.component === 'faq'
          ? [...FAQ_ITEMS, ...SABBATICAL_FAQ_ITEMS]
          : null;
  if (faqItems) {
    result.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqItems.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer },
      })),
    });
  }

  // Stage 3C: DefinedTermSet for the index, DefinedTerm for each term page - built from the
  // SAME GLOSSARY_TERMS array the visible pages render, never a duplicated copy.
  if (entry.component === 'glossary') {
    result.push({
      '@context': 'https://schema.org',
      '@type': 'DefinedTermSet',
      name: 'Days Off Glossary',
      url: meta.canonical,
      hasDefinedTerm: GLOSSARY_TERMS.map((t) => ({
        '@type': 'DefinedTerm',
        name: t.term,
        url: `${SITE_URL}/glossary/${t.id}`,
      })),
    });
  }
  if (entry.component === 'glossary-term') {
    const term = GLOSSARY_TERMS.find((t) => t.id === entry.termId);
    if (term) {
      result.push({
        '@context': 'https://schema.org',
        '@type': 'DefinedTerm',
        name: term.term,
        description: term.long,
        url: meta.canonical,
        inDefinedTermSet: `${SITE_URL}/glossary`,
      });
    }
  }

  return result;
}

/** Node 25+ ships its own non-configurable `navigator` global (the Node runtime's, not a
 * browser's) - plain assignment throws "only a getter". defineProperty with
 * configurable:true overrides it the same way jsdom's own test environment does. */
function setGlobal(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

/** The jsdom default navigator.language ("en-US") is what src/ui/geo.ts's
 * geolocateCountry() resolves to 'US' from - true for every entry with no countryPreset
 * (landing, /pto, /sabbatical), so that's the country whose holidays those routes need
 * preloaded for prerendering. */
const SSR_DEFAULT_COUNTRY = 'US';

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
  const ssrCountry = countryPreset ?? SSR_DEFAULT_COUNTRY;
  (win as unknown as { __PTO_PRELOADED_HOLIDAYS__?: Record<string, Holiday[]> }).__PTO_PRELOADED_HOLIDAYS__ = {
    [ssrCountry]: loadStaticHolidaysForSsr(ssrCountry),
  };
  (win as unknown as { __PTO_PRERENDERED_AT__?: string }).__PTO_PRERENDERED_AT__ = PRERENDERED_AT;
  // Stage 5G fix (Feature 1, PR-C): the Travel/Efficiency scores rendered blank ("—") in
  // every prerendered /pto page. Root cause: useAppState.ts deliberately computes them in a
  // useEffect, deferred past first paint (a real Phase 5 performance fix - computing them
  // synchronously on every input change made a full-year calendar feel frozen on a real
  // click). renderToString runs no effects at all, so the deferred computation never ran -
  // the prerendered snapshot always showed the pre-effect "null" state. This flag, set ONLY
  // here (never present in the deployed HTML's own script, so a real visitor's browser never
  // sees it), lets useAppState.ts compute them synchronously just for this one-time Node
  // render - a one-off blocking cost that's irrelevant outside a live browser click, and
  // never present for a real user's actual interaction.
  (win as unknown as { __PTO_SSR__?: boolean }).__PTO_SSR__ = true;
}

// A window must exist BEFORE these are even imported, in case anything in their import
// chains touches `window` at module-evaluation time rather than inside a function - using
// the first entry's own URL/preset rather than a placeholder, so that if it DOES matter,
// the very first render is still correct.
installWindow(`${SITE_URL}${ENTRIES[0].path}`, ENTRIES[0].countryPreset);
const { App } = await import('../src/ui/App.tsx');
const { Landing } = await import('../src/ui/Landing.tsx');
const { Sabbatical } = await import('../src/ui/Sabbatical.tsx');
const { FaqPage } = await import('../src/ui/FaqPage.tsx');
const { DataSources } = await import('../src/ui/DataSources.tsx');
const { Policy } = await import('../src/ui/Policy.tsx');
const { Glossary } = await import('../src/ui/Glossary.tsx');
const { GlossaryTermPage } = await import('../src/ui/GlossaryTermPage.tsx');

/** glossary-term is the one component that needs a per-entry prop (which term), so it's
 * rendered via a small wrapper function rather than through the no-props COMPONENTS map
 * every other route shares. */
function renderEntry(entry: Entry): string {
  if (entry.component === 'glossary-term') {
    return renderToString(React.createElement(GlossaryTermPage, { termId: entry.termId ?? '' }));
  }
  const COMPONENTS: Record<Exclude<ComponentKind, 'glossary-term'>, React.ComponentType> = {
    app: App,
    landing: Landing,
    sabbatical: Sabbatical,
    faq: FaqPage,
    dataSources: DataSources,
    policy: Policy,
    glossary: Glossary,
  };
  return renderToString(React.createElement(COMPONENTS[entry.component]));
}

async function prerenderEntry(entry: Entry): Promise<{ file: string; bytesInjected: number }> {
  const url = `${SITE_URL}${entry.path}`;
  // Re-installed per entry (not reused from the bootstrap above) - window/navigator differ
  // per route (different URL, different country preset), and activeCountryPreset() /
  // geolocateCountry() read them fresh on every call rather than caching at module scope.
  installWindow(url, entry.countryPreset);

  const html = renderEntry(entry);

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

  const meta = extractMeta(original, url);
  const jsonLdScripts = buildJsonLd(entry, meta)
    .map((obj) => `    <script type="application/ld+json">${JSON.stringify(obj)}</script>`)
    .join('\n');

  // The exact same data just used for this render's initial state (via
  // getPreloadedHolidays), re-embedded here so the real browser's FIRST paint - before
  // hydration, before any fetch effect runs - starts from the identical snapshot instead
  // of an empty list. Must run before the module script at the end of <body>, so <head>
  // (same injection point as the JSON-LD above) is the right place.
  const ssrCountry = entry.countryPreset ?? SSR_DEFAULT_COUNTRY;
  const preloadedHolidays = loadStaticHolidaysForSsr(ssrCountry);
  const preloadScript = `    <script>window.__PTO_PRELOADED_HOLIDAYS__ = ${JSON.stringify({ [ssrCountry]: preloadedHolidays })}; window.__PTO_PRERENDERED_AT__ = ${JSON.stringify(PRERENDERED_AT)};</script>`;

  const headMarker = '</head>';
  if (!withRoot.includes(headMarker)) {
    throw new Error(`${entry.file}: no </head> found - can't inject structured data.`);
  }
  const injected = withRoot.replace(headMarker, `${preloadScript}\n${jsonLdScripts}\n  </head>`);
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
