import type { BeforeSendEvent } from '@vercel/analytics';

/** Consumer planning state lives in search/hash parameters. Analytics receives only
 * the public origin and route, never a reproducible plan or a policy URL. */
export function sanitizeAnalyticsUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.origin + url.pathname;
  } catch {
    return null;
  }
}

/** The legacy hosted trackers also read document.referrer internally. The meta
 * referrer policy protects outgoing requests, but cannot change a referrer that
 * was already supplied on arrival. Skip tracking rather than forward its inputs. */
export function isSafeAnalyticsReferrer(referrer: string): boolean {
  if (referrer === '') return true;
  try {
    const url = new URL(referrer);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}

export function analyticsBeforeSend(event: BeforeSendEvent): BeforeSendEvent | null {
  try {
    if (typeof document !== 'undefined' && !isSafeAnalyticsReferrer(document.referrer)) return null;
    if (event.type !== 'pageview' && event.type !== 'event') return null;
    const url = sanitizeAnalyticsUrl(event.url);
    // Rebuild the payload from an allowlist: a spread would forward any field a future
    // SDK version adds (route, path, properties) without this boundary noticing.
    return url ? { type: event.type, url } as BeforeSendEvent : null;
  } catch {
    return null;
  }
}
