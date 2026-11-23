/**
 * The static HTML shell of a guide page (head tags + empty #root), shared by
 * scripts/generate-guide-html.ts (writes it) and guideHeads.test.ts (checks the committed
 * files still match). %SITE_URL%, %SITE_HOST% and %PRODUCT_NAME% are filled in by
 * vite.config.ts's siteUrlHtmlPlugin, exactly as on every other page.
 */
import { guideFacts, type Guide } from './guides2027';

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** dist-relative / repo-relative file for a guide path: "/2027/x" -> "2027/x/index.html". */
export function guideHtmlFile(guide: Pick<Guide, 'path'>): string {
  return `${guide.path.replace(/^\//, '')}/index.html`;
}

export function guideHeadHtml(guide: Guide): string {
  const title = `${escapeAttr(guide.title)} &mdash; %PRODUCT_NAME%`;
  const desc = escapeAttr(guide.description(guideFacts(guide)));
  const url = `%SITE_URL%${guide.path}`;
  return `<!doctype html>
<html lang="${guide.country === 'GB' ? 'en-GB' : 'en'}">
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
    <link rel="canonical" href="${url}" />

    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="%PRODUCT_NAME%" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${desc}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="%SITE_URL%/og-images/learn.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="A Timebower guide to planning time off." />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${desc}" />
    <meta name="twitter:image" content="%SITE_URL%/og-images/learn.png" />

    <script defer data-domain="%SITE_HOST%" src="https://plausible.io/js/script.manual.js"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/guide-main.tsx"></script>
  </body>
</html>
`;
}
