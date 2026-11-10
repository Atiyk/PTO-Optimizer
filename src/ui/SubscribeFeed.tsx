import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from './Button';
import { copyText } from './requestText';
import { FEED_CALENDAR_NAME, MAX_FEED_QUERY_LENGTH } from '../autopilot/feed';
import { feedWorkloadAllowed } from '../autopilot/feedHandler';
import { planStateFromSearch } from '../autopilot/planFromSearch';
import { isValidISODate } from './urlState';
import { employerLabelsWouldBeShared } from './publicSharePrivacy';

export interface FeedLinks {
  https: string;
  webcal: string;
  google: string;
  outlook: string;
}

/** The live feed's URLs for a plan's query string. Formats checked against published
 * subscribe links (Nov 2026): Google takes the webcal URL in `cid`; Outlook.com takes the
 * https URL in `url` plus a display `name`. */
export function feedLinks(origin: string, planSearch: string, path = '/api/feed', calendarName = FEED_CALENDAR_NAME): FeedLinks {
  const query = planSearch.startsWith('?') ? planSearch.slice(1) : planSearch;
  const https = `${origin.replace(/\/$/, '')}${path}${query ? `?${query}` : ''}`;
  const webcal = https.replace(/^https?:\/\//, 'webcal://');
  return {
    https,
    webcal,
    google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`,
    outlook: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(https)}&name=${encodeURIComponent(calendarName)}`,
  };
}

/**
 * F1: subscribe to this plan as a live calendar. Nothing to submit: the links are always
 * the current plan's, and the feed re-solves from the same link on every refresh.
 */
export interface SubscribeFeedProps {
  planSearch: string;
  origin?: string;
  /** Feed endpoint; the expiry watch feed uses '/api/watch'. */
  path?: string;
  calendarName?: string;
  heading?: string;
  description?: string;
  /** Small print under the description: when to resubscribe, who can see the link. */
  caveat?: string;
  /** Unique per page when more than one subscribe block renders. */
  idPrefix?: string;
}

const PLAN_DESCRIPTION = 'Subscribe once to see your PTO days, holidays and a “book by” reminder before each break, rebuilt from this link when your calendar refreshes (usually within a day).';
const PLAN_CAVEAT = 'After editing the plan, subscribe again. Anyone with the link can see the plan.';

/** Mirrors the /api/feed bound so the page never offers a link the function will refuse. */
function tooLargeForFeed(query: string): boolean {
  const state = planStateFromSearch(query, new Date().toISOString().slice(0, 10));
  return isValidISODate(state.rangeStart) && isValidISODate(state.rangeEnd) && !feedWorkloadAllowed(state);
}

export function SubscribeFeed({ planSearch, origin, path = '/api/feed', calendarName = FEED_CALENDAR_NAME, heading = 'Keep this plan in your calendar', description = PLAN_DESCRIPTION, caveat = PLAN_CAVEAT, idPrefix = 'subscribe-feed' }: SubscribeFeedProps) {
  // The links name this deployment's origin and the visitor's current plan, neither of
  // which the prerendered HTML knows, and React keeps server attributes on hydration - so
  // they render only after mount, never with a build-time host or plan baked in.
  const [mountedOrigin, setMountedOrigin] = useState<string | null>(null);
  useEffect(() => setMountedOrigin(window.location.origin), []);
  const resolvedOrigin = origin ?? mountedOrigin;
  // Subscription URLs leave this site (Apple, Google, Outlook or a copied feed).
  // Do not even render private calendar names into those hrefs until informed consent.
  // Consent belongs to the exact plan query: editing inputs resets the gate.
  const [consentedQuery, setConsentedQuery] = useState<string | null>(null);
  const privateCalendar = employerLabelsWouldBeShared(planSearch);
  const sharingAllowed = !privateCalendar || consentedQuery === planSearch;
  const links = resolvedOrigin && sharingAllowed ? feedLinks(resolvedOrigin, planSearch, path, calendarName) : null;
  const query = planSearch.replace(/^\?/, '');
  const tooLong = useMemo(() => query.length > MAX_FEED_QUERY_LENGTH || (path === '/api/feed' && tooLargeForFeed(query)), [query, path]);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <section aria-labelledby={`${idPrefix}-heading`} className="flex min-w-0 flex-col gap-3 border-t border-line pt-5">
      <h3 id={`${idPrefix}-heading`} className="text-xl font-bold leading-6 text-ink type-condensed">{heading}</h3>
      {tooLong ? (
        <p className="max-w-prose text-sm text-muted">This plan is too large for a calendar subscription. Download the .ics file instead.</p>
      ) : privateCalendar && !sharingAllowed ? (
        <>
          <p className="max-w-prose text-sm text-muted">Calendar subscription links include your custom employer holiday names and exclusions so the dates remain accurate. Apple, Google, Outlook, or anyone with the link may see them. Nothing is shared unless you choose to include them.</p>
          <Button variant="secondary" onClick={() => setConsentedQuery(planSearch)}>
            Include employer calendar details in subscription links
          </Button>
        </>
      ) : !links ? null : (
        <>
          <p className="max-w-prose text-sm text-muted">{description}</p>
          {caveat && <p className="max-w-prose text-xs leading-5 text-muted">{caveat}</p>}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" href={links.webcal}>Apple Calendar</Button>
            <Button variant="secondary" href={links.google} target="_blank" rel="noopener noreferrer">
              Google Calendar<span className="sr-only"> (opens in a new tab)</span>
            </Button>
            <Button variant="secondary" href={links.outlook} target="_blank" rel="noopener noreferrer">
              Outlook<span className="sr-only"> (opens in a new tab)</span>
            </Button>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor={`${idPrefix}-url`} className="text-sm font-semibold text-ink">Or paste this link into any calendar app</label>
            <div className="flex min-w-0 flex-wrap gap-2">
              <input
                id={`${idPrefix}-url`}
                type="url"
                readOnly
                value={links.https}
                onFocus={(event) => event.currentTarget.select()}
                className="h-11 w-full min-w-0 basis-full rounded-[6px] border border-line-strong bg-surface px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
              />
              <Button
                variant="secondary"
                onClick={async () => {
                  const ok = await copyText(links.https);
                  setCopyMessage(ok ? 'Link copied' : "Couldn't copy — select the link instead");
                  clearTimeout(timer.current);
                  timer.current = setTimeout(() => setCopyMessage(null), 2500);
                }}
              >
                {copyMessage ?? 'Copy calendar link'}
              </Button>
            </div>
            <span className="sr-only" role="status">{copyMessage ?? ''}</span>
          </div>
        </>
      )}
    </section>
  );
}
