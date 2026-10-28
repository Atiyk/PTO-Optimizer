/**
 * Phase 1: the one source of truth for this site's own canonical origin. Every build-time
 * consumer of the domain - vite.config.ts's HTML-interpolation plugin, scripts/prerender.ts,
 * scripts/build-seo-files.ts - calls this same function, so a future domain move is one env
 * var, not a grep-and-replace across nine HTML files, a sitemap, a robots.txt and a JSON
 * schema field.
 *
 * pto-optimizer.app does NOT currently resolve (checked from this sandbox: no DNS record at
 * all), so the default here is the real, live Vercel URL rather than the aspirational custom
 * domain - defaulting to a domain nothing can reach would make every generated canonical
 * link, og:image and sitemap entry wrong today. See PROGRESS.md / the Phase 1 PR for the
 * Vercel steps to move to a custom domain later, which then only need SITE_URL changed.
 *
 * This module is imported only by Node build scripts, never by client-bundled code
 * (src/ui/ExportBar.tsx's SSR fallback keeps its own tiny literal constant instead, in
 * src/ui/siteUrl.ts, specifically so `process.env` is never referenced from code Vite bundles
 * for the browser).
 */
export function getSiteUrl(): string {
  const fromEnv = process.env.SITE_URL?.trim();
  return fromEnv || 'https://pto-optimizer-seven.vercel.app';
}
