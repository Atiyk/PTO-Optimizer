import { isSafeAnalyticsReferrer, sanitizeAnalyticsUrl, sanitizeCampaignPageviewUrl } from './analyticsPrivacy';

/** The public API accepts an event name only. Plausible's manual tracker receives a
 * sanitized route override because even bare custom events otherwise attach the
 * complete current URL. No PTO balances, dates, notes, statuses or policy properties
 * are attached. Consumer HTML disables automatic Plausible pageviews. */
export const ANALYTICS_EVENTS = [
  'quick_plan_engaged',
  'holiday_preference_customized',
  'meaningful_plan_interaction',
  'request_tracking_started',
  'request_status_updated',
  'balance_forecast_used',
  'expiration_alert_viewed',
  'expiration_alert_action_taken',
  'partner_share_generated',
  'partner_share_opened',
  'partner_proposal_generated',
  'family_source_applied',
  'family_coverage_priority_changed',
  'family_share_generated',
  'family_share_opened',
  'family_listed_coverage_confirmed',
  'first_break_saved',
  'first_break_tracked',
  'first_break_exported',
  'first_break_shared',
  'second_meaningful_break_action',
  'portrait_image_exported',
  'Solve completed',
  'ICS downloaded',
  'Image copied',
  'URL shared',
  'Overlap link opened',
  'returned_with_saved_url',
  // A visit that arrived through a public plan share link (sv=1) the app wrote. Name only.
  'shared_link_opened',
  // The person took a calendar-subscription action (opened a calendar app link or copied it).
  'feed_subscribed',
  // "Save this plan" (pins it in this browser for comparison). Event name only.
  'plan_saved',
  'team_days_used',
  // Feature 1 Stage 4E - event names only, plus the sanitized public route.
  // Listed on the privacy page (public/privacy.html) alongside the rest.
  'policy_tool_used',
  'policy_alert_action_clicked',
  'term_opened',
  'paragraph_decoded',
  'policy_questions_copied',
  // Funnel events (docs/growth/METRICS.md). Event names only, like every other entry.
  // A /2027/* guide page's call to action into the planner was used.
  'guide_plan_opened',
  // The company-holiday check (which public holidays you actually get off) was opened.
  'holiday_check_opened',
  // The homepage quick plan's "See the full plan" call to action was used.
  'landing_plan_opened',
  // Someone who opened a shared plan chose to plan with their own numbers.
  'shared_plan_made_own',
  // Manager-ready request text (or just the dates) was copied to the clipboard.
  'request_text_copied',
] as const;

/** The single source of truth for event names. public/privacy.html lists exactly these. */
export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

interface PlausibleOptions { url: string }
type PlausibleArguments = [eventName: string, options: PlausibleOptions];
type PlausibleTracker = ((...args: PlausibleArguments) => void) & { q?: PlausibleArguments[] };

declare global {
  interface Window {
    plausible?: PlausibleTracker;
  }
}

const pageviewDocuments = new WeakSet<Document>();
const eventsByDocument = new WeakMap<Document, Set<AnalyticsEvent>>();
const MAX_QUEUED_EVENTS = 100;

const arrivalHrefs = new WeakMap<Document, string>();

/** Remember this document's address as it arrived, before the page rewrites its own query
 * string (Policy, Landing and the planner all do, in effects that run before the pageview).
 * Called during PrivacyAnalytics' render; the first call per document wins. Only read back
 * through sanitizeCampaignPageviewUrl, so nothing beyond the allowlisted labels leaves. */
export function rememberArrivalUrl(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined' || arrivalHrefs.has(document)) return;
  arrivalHrefs.set(document, window.location.href);
}

/** The arrival address when it is the same public route as now, else the current one. */
function pageviewSourceHref(): string {
  const current = window.location.href;
  const arrival = arrivalHrefs.get(document);
  if (!arrival) return current;
  return sanitizeAnalyticsUrl(arrival) === sanitizeAnalyticsUrl(current) ? arrival : current;
}

function send(event: AnalyticsEvent | 'pageview'): boolean {
  try {
    if (typeof window === 'undefined' || typeof document === 'undefined') return false;
    if (!isSafeAnalyticsReferrer(document.referrer)) return false;
    // Only the pageview may carry allowlisted campaign labels (utm_source/medium/campaign):
    // Plausible attributes the whole session from it. Custom events get the bare route.
    const url = event === 'pageview'
      ? sanitizeCampaignPageviewUrl(pageviewSourceHref())
      : sanitizeAnalyticsUrl(window.location.href);
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

export function trackOnceInDocument(event: AnalyticsEvent): void {
  if (typeof document === 'undefined') return;
  const tracked = eventsByDocument.get(document) ?? new Set<AnalyticsEvent>();
  if (tracked.has(event) || !send(event)) return;
  tracked.add(event);
  eventsByDocument.set(document, tracked);
}

const BREAK_MILESTONE_KEY = 'timebower.analytics.breakActions.v1';
const firstBreakEvent = {
  saved: 'first_break_saved',
  tracked: 'first_break_tracked',
  exported: 'first_break_exported',
  shared: 'first_break_shared',
} satisfies Record<string, AnalyticsEvent>;

/** A browser-local milestone, with neither an identifier nor action data in the event. */
export function trackBreakAction(action: keyof typeof firstBreakEvent): void {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(BREAK_MILESTONE_KEY) ?? '[]');
    const previous = new Set(Array.isArray(raw) ? raw.filter(value =>
      typeof value === 'string' && Object.hasOwn(firstBreakEvent, value),
    ) : []);
    if (previous.has(action) || !send(firstBreakEvent[action])) return;
    previous.add(action);
    window.localStorage.setItem(BREAK_MILESTONE_KEY, JSON.stringify([...previous]));
    if (previous.size === 2) send('second_meaningful_break_action');
  } catch {
    // Blocked storage must not break or gate the product action.
  }
}

/** True for a /pto query string written by "Copy plan link" (public share format,
 * src/ui/shareFormat.ts): it carries the version marker `sv=1`. Reads nothing else. */
export function isShareLinkArrival(search: string): boolean {
  try {
    return new URLSearchParams(search).get('sv') === '1';
  } catch {
    return false;
  }
}

/** Fires 'shared_link_opened' once per document for a share-link arrival. No properties:
 * never the balance, dates, employer data or the link itself. */
export function trackSharedLinkOpened(search: string): void {
  if (isShareLinkArrival(search)) trackOnceInDocument('shared_link_opened');
}

const RETURN_SESSION_KEY = 'timebower.analytics.returned.v1';
/** Keys that mark an arrival as something other than a person reopening their own plan. */
const NOT_A_RETURN = ['lp', 'sv', 'hx', 'pp', 'ov', 'od'];

/**
 * A genuine return: a private /pto link with a plan in it (s and b) that is not a homepage
 * CTA (lp), a share link (sv), an on-device hand-off (hx) or a partner link; or any visit
 * while a saved plan exists in this browser.
 */
export function isGenuineReturn(search: string, savedPlanPresent: boolean): boolean {
  let params: URLSearchParams;
  try { params = new URLSearchParams(search); } catch { return false; }
  if (NOT_A_RETURN.some((key) => params.has(key))) return false;
  return (params.has('s') && params.has('b')) || savedPlanPresent;
}

/**
 * 'returned_with_saved_url' at most once per tab session, and only when the FIRST planner
 * document of that tab session is a genuine return. The planner writes s and b into the
 * address bar and "Save this plan" adds a saved plan, so without this a reload, or leaving
 * /pto and coming back in the same visit, looked like a return (regression-tested).
 * The sessionStorage flag holds no identifier: '0' = this visit started fresh, '1' = counted.
 */
export function trackReturnOncePerSession(search: string, savedPlanPresent: boolean): void {
  try {
    if (window.sessionStorage.getItem(RETURN_SESSION_KEY) !== null) return;
    const counted = isGenuineReturn(search, savedPlanPresent) && send('returned_with_saved_url');
    window.sessionStorage.setItem(RETURN_SESSION_KEY, counted ? '1' : '0');
  } catch {
    if (isGenuineReturn(search, savedPlanPresent)) trackOnceInDocument('returned_with_saved_url');
  }
}

/** StrictMode, re-renders, input edits and repeated mounts must not add pageviews. */
export function trackPageviewOnce(): void {
  if (typeof document === 'undefined' || pageviewDocuments.has(document)) return;
  if (send('pageview')) pageviewDocuments.add(document);
}
