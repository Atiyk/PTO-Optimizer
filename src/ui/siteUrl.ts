/**
 * Client-safe counterpart to scripts/siteUrl.ts. This file IS bundled for the browser
 * (imported from ExportBar.tsx), so it must never touch `process.env` - Vite does not
 * polyfill `process` for client code, and referencing it would throw at runtime. Used only
 * as the SSR fallback before `window` exists (see ExportBar.tsx); once hydrated, the real
 * `window.location.host` always wins. Kept in sync with scripts/siteUrl.ts's own default by
 * convention - that script is the actual place a future domain change happens, since it
 * drives every generated static file (HTML meta, sitemap, robots.txt, JSON-LD).
 */
export const DEFAULT_SITE_HOST = 'pto-optimizer-seven.vercel.app';
