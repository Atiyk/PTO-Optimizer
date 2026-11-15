import { describe, expect, it } from 'vitest';
import { cacheNames, DATA_CACHE, offlineShellFor, pageCacheKey, SHELL_PAGES, staleCaches, swStrategy, warmableUrls } from './swRouting';

const ORIGIN = 'https://timebower.example';
const get = (path: string, extra: { mode?: string; destination?: string; method?: string } = {}) =>
  swStrategy({ url: path.startsWith('http') ? path : ORIGIN + path, method: extra.method ?? 'GET', mode: extra.mode, destination: extra.destination }, ORIGIN);

describe('service worker routing (P3 PWA)', () => {
  it('serves page navigations network first, with or without a query', () => {
    expect(get('/', { mode: 'navigate', destination: 'document' })).toBe('page');
    expect(get('/?source=pwa', { mode: 'navigate', destination: 'document' })).toBe('page');
    expect(get('/pto?c=US&b=15&pv=2', { mode: 'navigate', destination: 'document' })).toBe('page');
    expect(get('/policy', { mode: 'navigate' })).toBe('page');
  });

  it('serves hashed build assets cache first', () => {
    expect(get('/assets/main-CoPJNKsA.js', { destination: 'script' })).toBe('immutable');
    expect(get('/assets/Footer-Csj-6r_e.css', { destination: 'style' })).toBe('immutable');
    expect(get('/assets/plannerComputation.worker-DIC1O9FZ.js', { destination: 'worker' })).toBe('immutable');
  });

  it('never caches the API, in any method', () => {
    expect(get('/api/feed?x=1')).toBe('bypass');
    expect(get('/api/account')).toBe('bypass');
    expect(get('/api/account', { method: 'POST' })).toBe('bypass');
    expect(get('/api')).toBe('bypass');
    // Even a navigation to an API URL goes straight to the network.
    expect(get('/api/feed', { mode: 'navigate' })).toBe('bypass');
  });

  it('never caches the OCR files, wherever they are served from', () => {
    expect(get('/ocr/worker.min.js')).toBe('bypass');
    expect(get('/ocr/core/tesseract-core-simd-lstm.wasm.js')).toBe('bypass');
    expect(get('/ocr/lang/eng.traineddata.gz')).toBe('bypass');
    expect(get('/assets/tesseract-core-simd-lstm.wasm-D4IWHdQk.js')).toBe('bypass');
    expect(get('/assets/worker.min-32WLk7pY.js')).toBe('bypass');
  });

  it('keeps holiday data stale-while-revalidate, and only real holiday files', () => {
    expect(get('/holidays/US-2027.json')).toBe('revalidate');
    expect(get('/holidays/GB-2026.json')).toBe('revalidate');
    expect(get('/holidays/../api/x.json')).not.toBe('revalidate');
    expect(get('/holidays/index.html')).toBe('bypass');
  });

  it('revalidates fonts, icons and the manifest', () => {
    expect(get('/fonts/archivo-latin-var.woff2')).toBe('revalidate');
    expect(get('/icons/icon-192.png')).toBe('revalidate');
    expect(get('/manifest.webmanifest')).toBe('revalidate');
    expect(get('/favicon.svg')).toBe('revalidate');
  });

  it('leaves other origins, analytics, the worker itself, writes and unknown files alone', () => {
    expect(get('https://plausible.io/js/script.manual.js')).toBe('bypass');
    expect(get('https://date.nager.at/api/v3/PublicHolidays/2030/US')).toBe('bypass');
    expect(get('/_vercel/insights/script.js')).toBe('bypass');
    expect(get('/sw.js')).toBe('bypass');
    expect(get('/assets/main.js', { method: 'POST' })).toBe('bypass');
    expect(get('/sitemap.xml')).toBe('bypass');
    expect(get('/og-images/landing.png')).toBe('bypass');
    expect(get('not a url')).toBe('bypass');
  });

  it('stores a page under its path, so one copy of /pto opens every saved plan link offline', () => {
    expect(pageCacheKey(`${ORIGIN}/pto?c=US&b=10`)).toBe(`${ORIGIN}/pto`);
    expect(pageCacheKey(`${ORIGIN}/pto/`)).toBe(`${ORIGIN}/pto`);
    expect(pageCacheKey(`${ORIGIN}/?source=pwa`)).toBe(`${ORIGIN}/`);
  });

  it('falls back to the right app shell offline', () => {
    expect(offlineShellFor(`${ORIGIN}/pto?c=US`)).toBe(`${ORIGIN}/pto`);
    expect(offlineShellFor(`${ORIGIN}/uk`)).toBe(`${ORIGIN}/pto`);
    expect(offlineShellFor(`${ORIGIN}/policy#requests`)).toBe(`${ORIGIN}/policy`);
    expect(offlineShellFor(`${ORIGIN}/faq`)).toBe(`${ORIGIN}/`);
    expect(offlineShellFor(`${ORIGIN}/?source=pwa`)).toBe(`${ORIGIN}/`);
    for (const shell of ['/', '/pto', '/policy']) expect(SHELL_PAGES).toContain(shell);
  });

  it('names caches per build and deletes only older Timebower caches, keeping holiday data', () => {
    const now = cacheNames('abc123');
    expect(now.pages).toBe('timebower-pages-abc123');
    expect(now.assets).toBe('timebower-assets-abc123');
    expect(now.data).toBe(DATA_CACHE);
    expect(staleCaches(['timebower-pages-old', 'timebower-assets-old', DATA_CACHE, now.pages, now.assets, 'someone-else'], 'abc123'))
      .toEqual(['timebower-pages-old', 'timebower-assets-old']);
  });

  it('warms only files the routing table would cache anyway', () => {
    expect(warmableUrls([
      `${ORIGIN}/assets/main-1.js`, `${ORIGIN}/assets/main-1.js`, `${ORIGIN}/holidays/US-2027.json`,
      `${ORIGIN}/api/feed`, `${ORIGIN}/ocr/worker.min.js`, 'https://plausible.io/api/event',
    ], ORIGIN)).toEqual([`${ORIGIN}/assets/main-1.js`, `${ORIGIN}/holidays/US-2027.json`]);
  });
});
