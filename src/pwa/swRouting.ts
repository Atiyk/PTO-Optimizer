/**
 * P3 PWA: which caching strategy the service worker uses for one request. Pure, so the
 * routing table is unit-tested without a browser (src/pwa/swRouting.test.ts); src/pwa/sw.ts
 * is the only runtime caller.
 *
 *   bypass      the worker does not answer, so the browser goes to the network exactly as if
 *               there were no worker (API calls, OCR files, analytics, other origins, POSTs)
 *   page        network first, so an online visitor always gets the newest HTML; offline,
 *               the last copy of that page, then the app shell for that kind of page
 *   immutable   cache first: /assets/* names carry a content hash and never change
 *   revalidate  stale-while-revalidate: holiday JSON, fonts and icons may be a visit old
 */
export type SwStrategy = 'bypass' | 'page' | 'immutable' | 'revalidate';

export interface SwRequestInfo {
  url: string;
  method: string;
  /** Request.mode: 'navigate' for a top-level page load. */
  mode?: string;
  /** Request.destination: 'document' for a page. */
  destination?: string;
}

/** OCR (photo reading) is about 17 MB, loaded on demand: never cached by the worker. */
const OCR_ASSET = /^\/assets\/(tesseract[^/]*|worker\.min[^/]*)$/;
const STATIC_FILES = ['/favicon.svg', '/favicon.ico', '/apple-touch-icon.png', '/manifest.webmanifest'];

export function swStrategy(request: SwRequestInfo, origin: string): SwStrategy {
  if (request.method !== 'GET') return 'bypass';
  let url: URL;
  try { url = new URL(request.url); } catch { return 'bypass'; }
  if (url.origin !== origin) return 'bypass';
  const path = url.pathname;
  if (path === '/api' || path.startsWith('/api/')) return 'bypass';
  if (path.startsWith('/ocr/') || OCR_ASSET.test(path)) return 'bypass';
  if (path.startsWith('/_vercel/') || path === '/sw.js') return 'bypass';
  if (request.mode === 'navigate' || request.destination === 'document') return 'page';
  if (path.startsWith('/assets/')) return 'immutable';
  if (/^\/holidays\/[A-Z]{2}-\d{4}\.json$/.test(path)) return 'revalidate';
  if (path.startsWith('/fonts/') || path.startsWith('/icons/') || STATIC_FILES.includes(path)) return 'revalidate';
  return 'bypass';
}

/** Pages stored at install, so the app opens offline even on a page not visited online. */
export const SHELL_PAGES = ['/', '/pto', '/policy'] as const;

/** Country routes load the planner bundle, like /pto. */
const PLANNER_PATHS = ['/pto', '/uk', '/canada', '/australia', '/germany', '/ireland', '/india'];

function cleanPath(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}

/**
 * A page's cache key is its path only. A saved plan link differs only in its query, which
 * the app reads itself, so one stored /pto serves every /pto?... offline.
 */
export function pageCacheKey(url: string): string {
  const parsed = new URL(url);
  return parsed.origin + cleanPath(parsed.pathname);
}

/** The stored shell to show offline when this exact page was never stored. */
export function offlineShellFor(url: string): string {
  const parsed = new URL(url);
  const path = cleanPath(parsed.pathname);
  if (PLANNER_PATHS.includes(path)) return parsed.origin + '/pto';
  if (path === '/policy') return parsed.origin + '/policy';
  return parsed.origin + '/';
}

/**
 * Pages and assets are versioned per build, so activate can drop everything an older build
 * stored. Holiday data is not tied to a build: it keeps one stable cache, so a saved plan's
 * holidays stay available offline across updates.
 */
export const CACHE_PREFIX = 'timebower-';
export const DATA_CACHE = `${CACHE_PREFIX}data-v1`;
export function cacheNames(version: string): { pages: string; assets: string; data: string } {
  return { pages: `${CACHE_PREFIX}pages-${version}`, assets: `${CACHE_PREFIX}assets-${version}`, data: DATA_CACHE };
}
export function staleCaches(existing: readonly string[], version: string): string[] {
  const keep = new Set(Object.values(cacheNames(version)));
  return existing.filter((name) => name.startsWith(CACHE_PREFIX) && !keep.has(name));
}

/** URLs a page may ask the worker to store (what it already loaded before the worker took
 * over): only same-origin files this routing table would cache anyway. */
export function warmableUrls(urls: readonly string[], origin: string): string[] {
  return [...new Set(urls)].filter((url) => {
    const strategy = swStrategy({ url, method: 'GET' }, origin);
    return strategy === 'immutable' || strategy === 'revalidate';
  });
}
