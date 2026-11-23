/**
 * Phase 1: sitemap.xml and robots.txt used to be static files committed under public/,
 * copied verbatim by Vite with the domain hardcoded inside - the exact same problem as the
 * HTML entries, just for files Vite's own transformIndexHtml plugin never touches (that
 * hook only runs on Rollup HTML entries, not arbitrary public/ files). Generated here
 * instead, at build time, from the SAME ENTRIES list and the SAME getSiteUrl() every other
 * build script reads, as part of the postbuild chain (after scripts/prerender.ts).
 *
 * public/data-sources.json's `$schema` field and public/docs/index.html's own example URLs
 * had the identical hardcoded-domain problem; both are plain string/JSON post-processing on
 * the already-copied dist/ files, for the same reason.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSiteUrl } from './siteUrl.ts';
import { ENTRIES } from './routes.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const distDir = resolve(projectRoot, 'dist');
const SITE_URL = getSiteUrl();

function buildSitemap(): string {
  const urlEntries = [
    ...ENTRIES.map((e) => ({ loc: `${SITE_URL}${e.path}`, changefreq: 'weekly', priority: e.sitemapPriority, lastmod: e.lastmod })),
    // /docs isn't one of prerender's React-mounted entries (it's a plain static page), but
    // it's a real crawlable route and was in the sitemap before this rewrite - kept here
    // explicitly rather than silently dropped.
    { loc: `${SITE_URL}/docs`, changefreq: 'monthly', priority: 0.5 },
    // Static public/ pages with their own canonical tags (rewritten below). vercel.json has
    // cleanUrls, so /privacy.html is served at /privacy.
    { loc: `${SITE_URL}/privacy`, changefreq: 'monthly', priority: 0.3 },
    { loc: `${SITE_URL}/terms`, changefreq: 'monthly', priority: 0.3 },
  ];
  const body = urlEntries
    .map((u: { loc: string; changefreq: string; priority: number; lastmod?: string }) => `  <url>\n    <loc>${u.loc}</loc>\n${u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>\n` : ''}    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority.toFixed(1)}</priority>\n  </url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

function buildRobots(): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;
}

function rewriteDataSources(): void {
  const filePath = resolve(distDir, 'data-sources.json');
  if (!existsSync(filePath)) throw new Error(`Expected ${filePath} to exist - did vite build copy public/ first?`);
  const data = JSON.parse(readFileSync(filePath, 'utf-8'));
  data.$schema = `${SITE_URL}/data-sources.json`;
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
}

/** public/ pages name the placeholder origin https://pto-optimizer.app in their canonical
 * tags and examples; the build writes the real site URL, as for every other page. */
function rewriteStaticPage(...segments: string[]): void {
  const filePath = resolve(distDir, ...segments);
  if (!existsSync(filePath)) throw new Error(`Expected ${filePath} to exist - did vite build copy public/ first?`);
  const html = readFileSync(filePath, 'utf-8');
  writeFileSync(filePath, html.replaceAll('https://pto-optimizer.app', SITE_URL), 'utf-8');
}

function rewriteDocsPage(): void {
  rewriteStaticPage('docs', 'index.html');
  rewriteStaticPage('privacy.html');
  rewriteStaticPage('terms.html');
}

function main(): void {
  writeFileSync(resolve(distDir, 'sitemap.xml'), buildSitemap(), 'utf-8');
  writeFileSync(resolve(distDir, 'robots.txt'), buildRobots(), 'utf-8');
  rewriteDataSources();
  rewriteDocsPage();
  console.log(`SEO files built for ${SITE_URL}: sitemap.xml, robots.txt, data-sources.json, docs/index.html, privacy.html, terms.html`);
}

main();
