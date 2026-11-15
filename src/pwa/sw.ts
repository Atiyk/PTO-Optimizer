/**
 * P3 PWA: the hand-written service worker, built to /sw.js by scripts/serviceWorkerPlugin.ts
 * (production builds only). The routing table lives in ./swRouting.ts and is unit-tested.
 *
 * Two values are filled in at build time:
 *   BUILD_VERSION  a hash of this build's asset names; it names the caches, so each build
 *                  gets fresh ones and activate deletes the old ones.
 *   PRECACHE       this build's /assets/* files (OCR excluded), stored at install so the app
 *                  shell opens offline, plus SHELL_PAGES fetched from the network.
 *
 * Updates: a new worker installs alongside the old one and WAITS. The page shows "A new
 * version of Timebower is available. Reload" (src/pwa/registerServiceWorker.ts); Reload
 * posts SKIP_WAITING and the page reloads once the new worker takes control. Without that
 * tap it takes over when every Timebower tab has closed. Nobody is held on an old build
 * meanwhile: pages are network first, so an online visit always gets the newest HTML, and
 * that HTML's new hashed assets come from the network on a cache miss.
 */
import { cacheNames, offlineShellFor, pageCacheKey, SHELL_PAGES, staleCaches, swStrategy, warmableUrls } from './swRouting';

const BUILD_VERSION: string = '__TIMEBOWER_SW_VERSION__';
const PRECACHE: string[] = JSON.parse('__TIMEBOWER_SW_PRECACHE__') as string[];

// The DOM lib has no service worker types; these are the few members used here.
interface ExtendableEvent extends Event { waitUntil(promise: Promise<unknown>): void }
interface FetchEvent extends ExtendableEvent { request: Request; respondWith(response: Promise<Response>): void }
interface MessageEvent2 extends ExtendableEvent { data: unknown }
interface WorkerScope {
  location: Location;
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
  addEventListener(type: 'install' | 'activate', listener: (event: ExtendableEvent) => void): void;
  addEventListener(type: 'fetch', listener: (event: FetchEvent) => void): void;
  addEventListener(type: 'message', listener: (event: MessageEvent2) => void): void;
}
const worker = self as unknown as WorkerScope;
const ORIGIN = worker.location.origin;
const CACHES = cacheNames(BUILD_VERSION);

async function storePages(): Promise<void> {
  const cache = await caches.open(CACHES.pages);
  await Promise.all(SHELL_PAGES.map(async (path) => {
    const response = await fetch(path, { cache: 'no-cache', credentials: 'same-origin' });
    if (!response.ok || response.redirected) throw new Error(`Shell page ${path} could not be stored`);
    await cache.put(pageCacheKey(ORIGIN + path), response);
  }));
}

worker.addEventListener('install', (event) => {
  event.waitUntil(Promise.all([
    caches.open(CACHES.assets).then((cache) => cache.addAll(PRECACHE)),
    storePages(),
  ]));
});

worker.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const stale = staleCaches(await caches.keys(), BUILD_VERSION);
    await Promise.all(stale.map((name) => caches.delete(name)));
    await worker.clients.claim();
  })());
});

worker.addEventListener('message', (event) => {
  const data = event.data as { type?: string; urls?: unknown } | null;
  if (data?.type === 'SKIP_WAITING') {
    void worker.skipWaiting();
  } else if (data?.type === 'WARM' && Array.isArray(data.urls)) {
    // Files the page loaded before this worker controlled it (the first visit's lazy chunks
    // and holiday JSON), so a plan saved on that visit still opens offline.
    const urls = warmableUrls(data.urls.filter((url): url is string => typeof url === 'string').slice(0, 300), ORIGIN);
    event.waitUntil(Promise.all(urls.map(async (url) => {
      const name = new URL(url).pathname.startsWith('/assets/') ? CACHES.assets : CACHES.data;
      const cache = await caches.open(name);
      if (await cache.match(url)) return;
      try {
        const response = await fetch(url, { credentials: 'same-origin' });
        if (response.ok) await cache.put(url, response);
      } catch { /* offline: nothing to store */ }
    })));
  }
});

async function page(request: Request): Promise<Response> {
  const cache = await caches.open(CACHES.pages);
  const key = pageCacheKey(request.url);
  try {
    const response = await fetch(request);
    // Only a real page is stored; a redirect or error page never replaces the shell.
    if (response.ok && response.type === 'basic' && !response.redirected) await cache.put(key, response.clone());
    return response;
  } catch (error) {
    const stored = await cache.match(key) ?? await cache.match(offlineShellFor(request.url));
    if (stored) return stored;
    throw error;
  }
}

async function immutable(request: Request): Promise<Response> {
  const cache = await caches.open(CACHES.assets);
  const stored = await cache.match(request);
  if (stored) return stored;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
  return response;
}

async function revalidate(request: Request, event: FetchEvent): Promise<Response> {
  const cache = await caches.open(CACHES.data);
  const stored = await cache.match(request);
  const network = fetch(request).then(async (response) => {
    if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
    return response;
  });
  if (stored) {
    event.waitUntil(network.catch(() => undefined));
    return stored;
  }
  return network;
}

worker.addEventListener('fetch', (event) => {
  const { request } = event;
  const strategy = swStrategy({ url: request.url, method: request.method, mode: request.mode, destination: request.destination }, ORIGIN);
  if (strategy === 'bypass') return;
  if (strategy === 'page') event.respondWith(page(request));
  else if (strategy === 'immutable') event.respondWith(immutable(request));
  else event.respondWith(revalidate(request, event));
});
