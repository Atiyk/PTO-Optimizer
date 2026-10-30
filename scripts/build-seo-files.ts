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
    ...ENTRIES.map((e) => ({ loc: `${SITE_URL}${e.path}`, changefreq: 'weekly', priority: e.sitemapPriority })),
    // /docs isn't one of prerender's React-mounted entries (it's a plain static page), but
    // it's a real crawlable route and was in the sitemap before this rewrite - kept here
    // explicitly rather than silently dropped.
    { loc: `${SITE_URL}/docs`, changefreq: 'monthly', priority: 0.5 },
  ];
  const body = urlEntries
    .map((u) => `  <url>\n    <loc>${u.loc}</loc>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority.toFixed(1)}</priority>\n  </url>`)
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

function rewriteDocsPage(): void {
  const filePath = resolve(distDir, 'docs', 'index.html');
  if (!existsSync(filePath)) throw new Error(`Expected ${filePath} to exist - did vite build copy public/docs first?`);
  const html = readFileSync(filePath, 'utf-8');
  writeFileSync(filePath, html.replaceAll('https://pto-optimizer.app', SITE_URL), 'utf-8');
}

function main(): void {
  writeFileSync(resolve(distDir, 'sitemap.xml'), buildSitemap(), 'utf-8');
  writeFileSync(resolve(distDir, 'robots.txt'), buildRobots(), 'utf-8');
  rewriteDataSources();
  rewriteDocsPage();
  console.log(`SEO files built for ${SITE_URL}: sitemap.xml, robots.txt, data-sources.json, docs/index.html`);
}

main();
