import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from './Button';
import { copyText } from './requestText';
import { FEED_CALENDAR_NAME, MAX_FEED_QUERY_LENGTH } from '../autopilot/feed';
import { feedWorkloadAllowed } from '../autopilot/feedHandler';
import { planStateFromSearch } from '../autopilot/planFromSearch';
import { isValidISODate } from './urlState';
import { todayISO } from './today';
import { buildPublicPlanSearch, publicPlanOmissions } from './publicSharePrivacy';

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
 * F1: subscribe to a fixed plan snapshot. The feed re-solves its own saved
 * inputs on refresh, independently of later edits in the planner.
 */
export interface SubscribeFeedProps {
  planSearch: string;
  observedHolidayDates?: readonly string[];
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

const PLAN_DESCRIPTION = 'Subscribe to a fixed snapshot of this plan’s inputs as they are now. Your calendar app refreshes it with PTO days, holidays and “book by” reminders, recalculated from the refresh date.';
/** Issue 19: nothing is stored server-side, so later edits never reach a subscription. */
const planCaveat = (calendarName: string) => `Edits you make after subscribing are not included. To update, subscribe again, then remove the old “${calendarName}” calendar in your calendar app so the days don’t appear twice. Each event notes the day the snapshot was made. Anyone with the link can see the snapshot.`;

/** Mirrors the /api/feed bound so the page never offers a link the function will refuse. */
function tooLargeForFeed(query: string): boolean {
  const state = planStateFromSearch(query, todayISO());
  return isValidISODate(state.rangeStart) && isValidISODate(state.rangeEnd) && !feedWorkloadAllowed(state);
}

export function SubscribeFeed({ planSearch, observedHolidayDates, origin, path = '/api/feed', calendarName = FEED_CALENDAR_NAME, heading = 'Keep this plan in your calendar', description = PLAN_DESCRIPTION, caveat, idPrefix = 'subscribe-feed' }: SubscribeFeedProps) {
  // The links name this deployment's origin and the visitor's current plan, neither of
  // which the prerendered HTML knows, and React keeps server attributes on hydration - so
  // they render only after mount, never with a build-time host or plan baked in.
  const [mountedOrigin, setMountedOrigin] = useState<string | null>(null);
  useEffect(() => setMountedOrigin(window.location.origin), []);
  const resolvedOrigin = origin ?? mountedOrigin;
  // Subscription URLs leave this site. Only allowlisted plan fields, and observed
  // dates expressly selected for this specific snapshot, reach providers.
  const planFeed = path === '/api/feed';
  const omissions = planFeed ? publicPlanOmissions(planSearch) : null;
  const requiresChoice = Boolean(omissions?.calendar || omissions?.settings);
  const datesKey = observedHolidayDates?.join(',');
  const [choice, setChoice] = useState<{ mode: 'defaults' | 'dates' | null; source: string; dates: string | undefined }>(
    () => ({ mode: null, source: planSearch, dates: datesKey }),
  );
  const samePlan = choice.source === planSearch && choice.dates === datesKey;
  if (!samePlan) setChoice({ mode: null, source: planSearch, dates: datesKey });
  const sharingAllowed = !requiresChoice || (samePlan && choice.mode !== null);
  const shareObservedDates = samePlan && choice.mode === 'dates';
  // The plan feed records the day this link was made (`fc`), so its events can name it.
  const query = planFeed
    ? `${buildPublicPlanSearch(planSearch, shareObservedDates ? observedHolidayDates : undefined)}&fc=${todayISO()}`
    : planSearch.replace(/^\?/, '');
  const shownCaveat = caveat ?? (planFeed ? planCaveat(calendarName) : undefined);
  const links = resolvedOrigin && sharingAllowed ? feedLinks(resolvedOrigin, query, path, calendarName) : null;
  const tooLong = useMemo(() => query.length > MAX_FEED_QUERY_LENGTH || (planFeed && tooLargeForFeed(query)), [query, planFeed]);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <section aria-labelledby={`${idPrefix}-heading`} className="flex min-w-0 flex-col gap-3 border-t border-line pt-5">
      <h3 id={`${idPrefix}-heading`} className="text-xl font-bold leading-6 text-ink type-condensed">{heading}</h3>
      {tooLong ? (
        <p className="max-w-prose text-sm text-muted">This plan is too large for a calendar subscription. Download the .ics file instead.</p>
      ) : !sharingAllowed ? (
        <>
          <p className="max-w-prose text-sm text-muted">Choose the holiday assumptions for this snapshot. Private calendar names, scheduling details, and policy settings stay here, so the subscription may differ from your personal plan.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setChoice({ mode: 'defaults', source: planSearch, dates: datesKey })}>
              Use public holidays
            </Button>
            {observedHolidayDates !== undefined && (
              <Button variant="secondary" onClick={() => setChoice({ mode: 'dates', source: planSearch, dates: datesKey })}>
                Include observed holiday dates
              </Button>
            )}
          </div>
          {observedHolidayDates !== undefined && (
            <p className="max-w-prose text-xs text-muted">Only include these dates if you want them visible to anyone with the link and to your calendar provider.{datesKey ? ` Dates: ${observedHolidayDates.join(', ')}.` : ' No holidays are checked in this date range.'}</p>
          )}
        </>
      ) : !links ? null : (
        <>
          <p className="max-w-prose text-sm text-muted">{description}</p>
          {planFeed && <p className="max-w-prose text-xs text-muted">{shareObservedDates ? 'Uses your selected observed holiday dates, without their labels.' : 'Uses public holiday defaults.'}</p>}
          {shownCaveat && <p className="max-w-prose text-xs leading-5 text-muted">{shownCaveat}</p>}
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
