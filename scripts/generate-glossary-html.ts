/**
 * Stage 3C: writes glossary/<id>/index.html for every term in src/content/glossary/terms.ts,
 * committed like the country routes (uk/index.html etc.) rather than regenerated on every
 * build - a deliberate choice: the committed-HTML-per-route pattern this repo already uses
 * elsewhere, and it keeps `vite build`/vite.config.ts simple (every entry it lists is a real
 * file on disk, same as every other route, with no build-time generation step in between).
 *
 * Run this manually after editing terms.ts (adding/removing/renaming a term) and commit the
 * result:
 *   npx tsx --tsconfig tsconfig.app.json scripts/generate-glossary-html.ts
 *
 * vite.config.ts's GLOSSARY_TERM_IDS list is read from the SAME terms.ts array, so a stale
 * or missing generated file fails the build loudly (ENOENT) rather than silently serving an
 * old page - if you add a term and forget to run this, `npm run build` will tell you.
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLOSSARY_TERMS } from '../src/content/glossary/terms.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function page(termTitle: string, description: string, canonicalPath: string): string {
  const title = `${escapeAttr(termTitle)} — %PRODUCT_NAME% Glossary`;
  const desc = escapeAttr(description);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta name="referrer" content="no-referrer" />
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="alternate icon" href="/favicon.ico" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#f4f4f0" />
    <link rel="preload" href="/fonts/archivo-latin-var.woff2" as="font" type="font/woff2" crossorigin />

    <title>${title}</title>
    <meta name="description" content="${desc}" />
    <link rel="canonical" href="%SITE_URL%${canonicalPath}" />

    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="%PRODUCT_NAME%" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${desc}" />
    <meta property="og:url" content="%SITE_URL%${canonicalPath}" />
    <meta property="og:image" content="%SITE_URL%/og-images/learn.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="A plain-English glossary definition." />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${desc}" />
    <meta name="twitter:image" content="%SITE_URL%/og-images/learn.png" />

    <script defer data-domain="%SITE_HOST%" src="https://plausible.io/js/script.manual.js"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/glossary-term-main.tsx"></script>
  </body>
</html>
`;
}

function main() {
  let written = 0;
  for (const term of GLOSSARY_TERMS) {
    const dir = resolve(projectRoot, 'glossary', term.id);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const filePath = resolve(dir, 'index.html');
    writeFileSync(filePath, page(term.term, term.short, `/glossary/${term.id}`), 'utf-8');
    written++;
  }
  console.log(`Generated ${written} glossary term pages in glossary/<id>/index.html.`);
}

main();
