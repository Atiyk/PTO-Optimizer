import { historyWithPrivatePlanDraft } from './urlState';

/**
 * On-device hand-off from another page (e.g. My PTO's "Plan the days") to /pto.
 *
 * The navigable link carries only public planning keys plus `hx`, a random one-shot nonce.
 * The private part (e.g. manually planned days as blackouts) waits in this tab's
 * sessionStorage under that nonce. /pto consumes it once on load, strips `hx` from the
 * address bar and keeps the private inputs in the history entry's private draft, exactly
 * like private state opened from a legacy link. Nothing private reaches the URL, server
 * logs, analytics or a copied link. A link opened in another tab or device without the
 * stored entry simply plans without those private inputs.
 */
export const HANDOFF_PARAM = 'hx';
const STORAGE_PREFIX = 'gapless.handoff.v1.';
const MAX_AGE_MS = 30 * 60 * 1000;
const MAX_PRIVATE_LENGTH = 50_000;
const NONCE = /^[A-Za-z0-9_-]{1,64}$/;

function randomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function sessionStore(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.sessionStorage; } catch { return null; }
}

/** Returns `href` with a hand-off nonce, after storing `privateSearch` on this device.
 * Returns `href` unchanged when there is nothing private or storage is unavailable. */
export function storePlanHandoff(
  href: string, privateSearch: string, storage: Storage | null = sessionStore(),
  nonce: () => string = randomNonce, now: number = Date.now(),
): string {
  if (!privateSearch || !storage || privateSearch.length > MAX_PRIVATE_LENGTH) return href;
  try {
    const id = nonce();
    if (!NONCE.test(id)) return href;
    storage.setItem(STORAGE_PREFIX + id, JSON.stringify({ privateSearch, created: now }));
    const url = new URL(href, 'https://handoff.invalid');
    url.searchParams.set(HANDOFF_PARAM, id);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return href;
  }
}

/** For a search carrying `hx`: the search without it and the history state holding the
 * handed-over private inputs (consumed from storage). Null when there is no `hx`. */
export function adoptPlanHandoff(
  search: string, historyState: unknown, storage: Storage | null = sessionStore(), now: number = Date.now(),
): { search: string; historyState: Record<string, unknown> } | null {
  const params = new URLSearchParams(search);
  const id = params.get(HANDOFF_PARAM);
  if (id === null) return null;
  params.delete(HANDOFF_PARAM);
  const clean = params.toString();
  let privateSearch = '';
  if (storage && NONCE.test(id)) {
    try {
      const raw = storage.getItem(STORAGE_PREFIX + id);
      storage.removeItem(STORAGE_PREFIX + id);
      const entry: unknown = raw && raw.length <= MAX_PRIVATE_LENGTH + 100 ? JSON.parse(raw) : null;
      if (entry && typeof entry === 'object') {
        const { privateSearch: stored, created } = entry as Record<string, unknown>;
        if (typeof stored === 'string' && typeof created === 'number' && now - created >= 0 && now - created <= MAX_AGE_MS) privateSearch = stored;
      }
    } catch { /* A blocked or corrupt entry plans without the private inputs. */ }
  }
  const base = historyState !== null && typeof historyState === 'object' && !Array.isArray(historyState)
    ? historyState as Record<string, unknown> : {};
  return { search: clean, historyState: privateSearch ? historyWithPrivatePlanDraft(clean, base, privateSearch) : { ...base } };
}

/** /pto entry: apply a pending hand-off before the planner reads its URL. */
export function applyPlanHandoffOnLoad(): void {
  if (typeof window === 'undefined') return;
  try {
    const adopted = adoptPlanHandoff(window.location.search, window.history.state);
    if (!adopted) return;
    const url = new URL(window.location.href);
    url.search = adopted.search;
    window.history.replaceState(adopted.historyState, '', url);
  } catch { /* The planner still opens from the public link. */ }
}

/** Click handler for an in-app link whose private inputs should follow it on-device. */
export function handOffOnClick(href: string, privateSearch: string | undefined) {
  return (event: { currentTarget: HTMLAnchorElement }) => {
    if (privateSearch) event.currentTarget.href = storePlanHandoff(href, privateSearch);
  };
}
