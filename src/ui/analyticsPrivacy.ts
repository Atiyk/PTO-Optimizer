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

/** The only query keys analytics may ever see, in the order they are written back. */
const CAMPAIGN_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'] as const;
/** A short plain label: a letter first, then letters, digits, '_' or '-', 40 characters
 * at most. No '@', '.', '=', '%', spaces or non-ASCII, so an email, URL, decimal or
 * encoded payload cannot pass. */
const CAMPAIGN_VALUE = /^[a-z][a-z0-9_-]{0,39}$/;
/** Date-shaped or long digit runs could carry a leave date, an ID or a phone number. */
const CAMPAIGN_DIGITS = /\d{4}-\d{1,2}(?:-\d{1,2})?|\d{5,}/;

function campaignValue(params: URLSearchParams, key: string): string | null {
  const values = params.getAll(key);
  if (values.length !== 1) return null; // duplicates are ambiguous: drop them all
  const value = values[0].toLowerCase();
  return CAMPAIGN_VALUE.test(value) && !CAMPAIGN_DIGITS.test(value) ? value : null;
}

/** Plausible pageviews only: the sanitized route plus utm_source, utm_medium and
 * utm_campaign when each is a single short plain label (lowercased, so 'Reddit' and
 * 'reddit' are one source). Every other parameter, and the fragment, is dropped. Campaign
 * links are written by whoever shares Timebower, never by the planner, so a planning
 * value can only appear here if someone typed it into a utm tag; the pattern still
 * refuses dates, long numbers, decimals and email-like values. Custom events and Vercel
 * never receive these (Plausible attributes a session's source from its first pageview). */
export function sanitizeCampaignPageviewUrl(raw: string): string | null {
  const route = sanitizeAnalyticsUrl(raw);
  if (!route) return null;
  try {
    const params = new URL(raw).searchParams;
    const kept = new URLSearchParams();
    for (const key of CAMPAIGN_KEYS) {
      const value = campaignValue(params, key);
      if (value) kept.set(key, value);
    }
    const query = kept.toString();
    return query ? `${route}?${query}` : route;
  } catch {
    return route;
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
