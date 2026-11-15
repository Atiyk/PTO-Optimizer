import { captureInstallPrompt } from './installOffer';

/**
 * P3 PWA: registers /sw.js (built by scripts/serviceWorkerPlugin.ts) on every consumer page.
 *   - production builds only: never in the dev server or in tests (the worker file only exists
 *     in a build, and a dev worker would cache files that change on every save);
 *   - after the page's `load` event, so it never competes with the first paint;
 *   - the update flow is described in src/pwa/sw.ts: a waiting new version shows one quiet
 *     "A new version of Timebower is available. Reload" line; Reload switches and reloads.
 */
export interface RegistrationEnv {
  prod: boolean;
  mode: string;
  hasServiceWorker: boolean;
  secure: boolean;
}

export function currentRegistrationEnv(): RegistrationEnv {
  return {
    prod: import.meta.env.PROD,
    mode: import.meta.env.MODE,
    hasServiceWorker: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
    secure: typeof window !== 'undefined' && window.isSecureContext === true,
  };
}

export function shouldRegisterServiceWorker(env: RegistrationEnv): boolean {
  return env.prod && env.mode !== 'test' && env.mode !== 'development' && env.hasServiceWorker && env.secure;
}

const UPDATE_ID = 'timebower-update-available';

/** One quiet line at the bottom of the page. Plain DOM, so every page gets it without React. */
export function showUpdateNotice(waiting: ServiceWorker, doc: Document = document): void {
  if (doc.getElementById(UPDATE_ID)) return;
  const bar = doc.createElement('div');
  bar.id = UPDATE_ID;
  bar.setAttribute('role', 'status');
  bar.className = 'fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-[10px] border border-line bg-surface px-4 py-2 text-[15px] text-ink shadow-sm';
  const text = doc.createElement('span');
  text.textContent = 'A new version of Timebower is available.';
  const actions = doc.createElement('span');
  actions.className = 'flex items-center gap-1';
  const reload = doc.createElement('button');
  reload.type = 'button';
  reload.textContent = 'Reload';
  reload.className = 'min-h-11 px-2 font-semibold text-accent underline underline-offset-[0.22em]';
  reload.addEventListener('click', () => {
    reload.disabled = true;
    waiting.postMessage({ type: 'SKIP_WAITING' });
  });
  const close = doc.createElement('button');
  close.type = 'button';
  close.setAttribute('aria-label', 'Not now');
  close.textContent = '×';
  close.className = 'flex h-11 w-11 items-center justify-center text-lg text-muted';
  close.addEventListener('click', () => bar.remove());
  actions.append(reload, close);
  bar.append(text, actions);
  doc.body.append(bar);
}

/** Same-origin files this page loaded before the worker controlled it. */
function loadedUrls(): string[] {
  try {
    return performance.getEntriesByType('resource').map((entry) => entry.name);
  } catch {
    return [];
  }
}

function watchForUpdates(registration: ServiceWorkerRegistration): void {
  const container = navigator.serviceWorker;
  // Only an update replaces a controller; the very first install needs no prompt.
  const offer = (worker: ServiceWorker | null) => { if (worker && container.controller) showUpdateNotice(worker); };
  offer(registration.waiting);
  registration.addEventListener('updatefound', () => {
    const installing = registration.installing;
    installing?.addEventListener('statechange', () => { if (installing.state === 'installed') offer(installing); });
  });
  let reloading = false;
  container.addEventListener('controllerchange', () => {
    // Reload only when this page asked for the switch (Reload), never on a first install.
    if (reloading || !document.getElementById(UPDATE_ID)) return;
    reloading = true;
    window.location.reload();
  });
}

export function registerServiceWorker(env: RegistrationEnv = currentRegistrationEnv()): boolean {
  captureInstallPrompt();
  if (!shouldRegisterServiceWorker(env)) return false;
  const start = () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((registration) => {
        watchForUpdates(registration);
        return navigator.serviceWorker.ready;
      })
      .then((registration) => registration.active?.postMessage({ type: 'WARM', urls: loadedUrls() }))
      .catch(() => { /* no worker: the site works exactly as before */ });
  };
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
  return true;
}
