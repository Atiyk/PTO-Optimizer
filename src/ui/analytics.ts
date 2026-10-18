/**
 * Thin wrapper around Plausible (see index.html's <script data-domain=... src=.../script.js>
 * tag) - cookieless, no personal data, no consent banner required under GDPR/ePrivacy since
 * it sets no cookies and stores no cross-site identifiers (visitor counts use a rotating
 * daily salted hash of IP+user-agent, discarded after 24h, never written to disk tied to an
 * individual). Exactly six events are tracked, per spec, and nothing else: no inputs, no
 * dates, no locations, no plan details - every call below passes only the bare event name,
 * never a payload. `window.plausible` is undefined when the script hasn't loaded (local dev
 * without network, the script blocked, or a unit test), so every call is a no-op in that
 * case rather than a crash.
 */
export type AnalyticsEvent =
  | 'Solve completed'
  | 'ICS downloaded'
  | 'Image copied'
  | 'URL shared'
  | 'Overlap link opened';

declare global {
  interface Window {
    plausible?: (eventName: string) => void;
  }
}

export function track(event: AnalyticsEvent): void {
  try {
    window.plausible?.(event);
  } catch {
    // analytics must never break the app
  }
}
