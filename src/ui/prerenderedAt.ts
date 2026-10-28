/**
 * Phase 2 (staleness): the timestamp scripts/prerender.ts stamps onto every route's own
 * HTML, right next to its date-relative claims. The countdown/"N days away" numbers are
 * computed once, at build time - this says so, rather than silently going stale as a
 * static site ages between deploys (see PROGRESS.md for the daily-redeploy workflow that
 * keeps the drift small).
 */
declare global {
  interface Window {
    __PTO_PRERENDERED_AT__?: string;
  }
}

export function getPrerenderedAt(): string | undefined {
  return typeof window !== 'undefined' ? window.__PTO_PRERENDERED_AT__ : undefined;
}
