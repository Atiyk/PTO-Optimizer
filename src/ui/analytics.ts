/**
 * Thin wrapper around Plausible (see index.html's <script data-domain=... src=.../script.js>
 * tag) - cookieless, no personal data, no consent banner required under GDPR/ePrivacy since
 * it sets no cookies and stores no cross-site identifiers (visitor counts use a rotating
 * daily salted hash of IP+user-agent, discarded after 24h, never written to disk tied to an
 * individual). Every event below passes only the bare event name, never a payload - no
 * inputs, no dates, no locations, no plan details. `window.plausible` is undefined when the
 * script hasn't loaded (local dev without network, the script blocked, or a unit test), so
 * every call is a no-op in that case rather than a crash.
 *
 * 'returned_with_saved_url' and 'team_days_used' (Phase 3 item 9) are instrumentation for a
 * future product decision, not product features themselves - see NOTES.md for what they're
 * meant to answer and why no payment infrastructure gets built before they do.
 */
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
  // Feature 1 Stage 4E - event names only, never a payload, same as every event above.
  // Listed on the privacy page (public/privacy.html) alongside the rest.
  | 'policy_tool_used'
  | 'policy_alert_action_clicked'
  | 'term_opened'
  | 'paragraph_decoded'
  | 'policy_questions_copied';

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
