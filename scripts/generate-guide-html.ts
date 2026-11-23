/**
 * Writes guides/index.html and guides/<id>/index.html for every guide in
 * src/content/guides/index.ts, committed like the glossary pages (see
 * scripts/generate-glossary-html.ts for why). Run it after adding, removing or retitling a
 * guide, and commit the result:
 *   npx tsx --tsconfig tsconfig.app.json scripts/generate-guide-html.ts
 *
 * vite.config.ts and scripts/routes.ts read the same GUIDES array, so a missing page fails
 * the build, and guides.test.ts fails when a committed page's title or description is stale.
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GUIDES } from '../src/content/guides/index.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function page(metaTitle: string, description: string, canonicalPath: string, script: string, ogType: string, ogAlt: string): string {
  const title = `${escapeAttr(metaTitle)} — %PRODUCT_NAME%`;
  const desc = escapeAttr(description);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta name="referrer" content="no-referrer" />
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="alternate icon" href="/favicon.ico" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <meta name="apple-mobile-web-app-title" content="%PRODUCT_NAME%" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#f8fafc" />
    <link rel="preload" href="/fonts/archivo-latin-var.woff2" as="font" type="font/woff2" crossorigin />

    <title>${title}</title>
    <meta name="description" content="${desc}" />
    <link rel="canonical" href="%SITE_URL%${canonicalPath}" />

    <meta property="og:type" content="${ogType}" />
    <meta property="og:site_name" content="%PRODUCT_NAME%" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${desc}" />
    <meta property="og:url" content="%SITE_URL%${canonicalPath}" />
    <meta property="og:image" content="%SITE_URL%/og-images/learn.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${escapeAttr(ogAlt)}" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${desc}" />
    <meta name="twitter:image" content="%SITE_URL%/og-images/learn.png" />

    <script defer data-domain="%SITE_HOST%" src="https://plausible.io/js/script.manual.js"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="${script}"></script>
  </body>
</html>
`;
}

function write(relDir: string, html: string) {
  const dir = resolve(projectRoot, relDir);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'index.html'), html, 'utf-8');
}

function main() {
  write('guides', page(
    'PTO guides: 2027 US holidays and how to plan time off',
    'The 2027 US holiday dates, the PTO days to book around them, and plain-English guides to accrual, carryover and asking for time off.',
    '/guides', '/src/guides-main.tsx', 'website', 'A list of PTO planning guides.',
  ));
  for (const guide of GUIDES) {
    write(`guides/${guide.id}`, page(guide.metaTitle, guide.description, `/guides/${guide.id}`, '/src/guide-main.tsx', 'article', guide.title));
  }
  console.log(`Generated guides/index.html and ${GUIDES.length} guide pages in guides/<id>/index.html.`);
}

main();
