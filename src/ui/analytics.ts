import { isSafeAnalyticsReferrer, sanitizeAnalyticsUrl } from './analyticsPrivacy';

/** The public API accepts an event name only. Plausible's manual tracker receives a
 * sanitized route override because even bare custom events otherwise attach the
 * complete current URL. No PTO balances, dates, notes, statuses or policy properties
 * are attached. Consumer HTML disables automatic Plausible pageviews. */
export type AnalyticsEvent =
  | 'quick_plan_engaged'
  | 'holiday_preference_customized'
  | 'meaningful_plan_interaction'
  | 'request_tracking_started'
  | 'request_status_updated'
  | 'balance_forecast_used'
  | 'expiration_alert_viewed'
  | 'expiration_alert_action_taken'
  | 'partner_share_generated'
  | 'partner_share_opened'
  | 'portrait_image_exported'
  | 'Solve completed'
  | 'ICS downloaded'
  | 'Image copied'
  | 'URL shared'
  | 'Overlap link opened'
  | 'returned_with_saved_url'
  | 'team_days_used'
  // Feature 1 Stage 4E - event names only, plus the sanitized public route.
  // Listed on the privacy page (public/privacy.html) alongside the rest.
  | 'policy_tool_used'
  | 'policy_alert_action_clicked'
  | 'term_opened'
  | 'paragraph_decoded'
  | 'policy_questions_copied';

interface PlausibleOptions { url: string }
type PlausibleArguments = [eventName: string, options: PlausibleOptions];
type PlausibleTracker = ((...args: PlausibleArguments) => void) & { q?: PlausibleArguments[] };

declare global {
  interface Window {
    plausible?: PlausibleTracker;
  }
}

const pageviewDocuments = new WeakSet<Document>();
const MAX_QUEUED_EVENTS = 100;

function send(event: AnalyticsEvent | 'pageview'): boolean {
  try {
    if (typeof window === 'undefined' || typeof document === 'undefined') return false;
    if (!isSafeAnalyticsReferrer(document.referrer)) return false;
    const url = sanitizeAnalyticsUrl(window.location.href);
    if (!url) return false;
    if (!window.plausible) {
      // Capture this array in the closure. The hosted tracker consumes .q and
      // replaces window.plausible; the queue must not reference that new global.
      const pending: PlausibleArguments[] = [];
      const queue: PlausibleTracker = (...args) => {
        if (pending.length < MAX_QUEUED_EVENTS) pending.push(args);
      };
      queue.q = pending;
      window.plausible = queue;
    }
    window.plausible(event, { url });
    return true;
  } catch {
    // analytics must never break the app
    return false;
  }
}

export function track(event: AnalyticsEvent): void { send(event); }

/** StrictMode, re-renders, input edits and repeated mounts must not add pageviews. */
export function trackPageviewOnce(): void {
  if (typeof document === 'undefined' || pageviewDocuments.has(document)) return;
  if (send('pageview')) pageviewDocuments.add(document);
}
