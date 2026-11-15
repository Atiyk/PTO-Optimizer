import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from './Button';
import { copyText } from './requestText';
import { FEED_CALENDAR_NAME, MAX_FEED_QUERY_LENGTH } from '../autopilot/feed';
import { feedWorkloadAllowed } from '../autopilot/feedHandler';
import { planStateFromSearch } from '../autopilot/planFromSearch';
import { isValidISODate } from './urlState';
import { todayISO } from './today';
import { buildPublicPlanSearch, publicPlanOmissions } from './publicSharePrivacy';
import type { Break } from '@daysoff/engine/solver/types';
import { buildPlanFeedV2Search } from '../autopilot/feedV2';
import { track } from './analytics';

export interface FeedLinks {
  https: string;
  webcal: string;
  google: string;
  outlook: string;
}

/** The subscription feed's URLs for a plan's query string. Formats checked against published
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
 * F1: subscribe to a snapshot of the plan's dates. Later edits in the planner never reach
 * it. When the plan's breaks are passed in, the link carries those dates only (format 2,
 * src/autopilot/feedV2.ts): no PTO budget, balance or policy setting leaves the device and
 * the server never re-solves. Without them it falls back to the public share format.
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
  /** The plan on screen. With both, the plan feed link carries only these dates (format 2). */
  breaks?: readonly Pick<Break, 'start' | 'end' | 'days' | 'ptoCost'>[];
  isPtoDay?: (iso: string) => boolean;
}

const PLAN_DESCRIPTION = 'Add this plan’s PTO days, holidays and request-by reminders to your calendar app. Shows the dates as of today; subscribe again after changes.';
/** F16: the update mechanics sit behind a "How updates work" disclosure, one short block each. */
const planUpdateNotes = (calendarName: string, datesOnly: boolean) => [
  datesOnly
    ? 'The subscription holds this plan’s dates as they are today. It does not change when you edit the plan.'
    : 'The subscription holds a fixed snapshot of this plan’s shared settings as they are today. It does not change when you edit the plan.',
  'Edits you make after subscribing are not included.',
  `To update, subscribe again, then remove the old “${calendarName}” calendar so days don’t appear twice.`,
  'Each event notes the day the snapshot was made.',
  datesOnly
    ? 'The link holds your break dates, country, region, date range and work week. It holds no PTO balance or policy settings.'
    : 'The link holds the plan settings shown in a shared plan link.',
];
/** Issue 19: nothing is stored server-side, so later edits never reach a subscription. */
const PLAN_PRIVACY = 'Anyone with the link can see these dates.';
const DAY_MS = 86_400_000;
const MAX_FEED_RANGE_DAYS_V2 = 3 * 366;

/** Format 2 has no solver cost; only the plan range is bounded (feedV2.ts). */
function rangeTooLong(query: string): boolean {
  const params = new URLSearchParams(query);
  const start = params.get('s');
  const end = params.get('e');
  if (!start || !end) return false;
  const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS + 1;
  return !(days >= 1 && days <= MAX_FEED_RANGE_DAYS_V2);
}

/** Mirrors the /api/feed bound so the page never offers a link the function will refuse. */
function tooLargeForFeed(query: string): boolean {
  const state = planStateFromSearch(query, todayISO());
  return isValidISODate(state.rangeStart) && isValidISODate(state.rangeEnd) && !feedWorkloadAllowed(state);
}

export function SubscribeFeed({ planSearch, observedHolidayDates, origin, path = '/api/feed', calendarName = FEED_CALENDAR_NAME, heading = 'Keep this plan in your calendar', description = PLAN_DESCRIPTION, caveat, idPrefix = 'subscribe-feed', breaks, isPtoDay }: SubscribeFeedProps) {
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
  const datesOnly = planFeed && breaks !== undefined && isPtoDay !== undefined;
  const publicSearch = planFeed ? buildPublicPlanSearch(planSearch, shareObservedDates ? observedHolidayDates : undefined) : '';
  const query = datesOnly
    ? buildPlanFeedV2Search({ publicSearch, breaks, isPtoDay, createdOn: todayISO() })
    : planFeed
      ? `${publicSearch}&fc=${todayISO()}`
      : planSearch.replace(/^\?/, '');
  const shownCaveat = caveat ?? (planFeed ? PLAN_PRIVACY : undefined);
  const links = resolvedOrigin && sharingAllowed ? feedLinks(resolvedOrigin, query, path, calendarName) : null;
  const tooLong = useMemo(() => query.length > MAX_FEED_QUERY_LENGTH || (datesOnly ? rangeTooLong(query) : planFeed && tooLargeForFeed(query)), [query, planFeed, datesOnly]);
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
          <p className="max-w-prose text-sm text-muted">{datesOnly
            ? 'Choose which holidays the subscription uses. Your PTO dates come from this plan; holiday names and policy settings stay here.'
            : 'Choose which holidays the subscription uses. Your calendar names, scheduling details and policy settings stay here, so it can differ from your plan.'}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setChoice({ mode: 'defaults', source: planSearch, dates: datesKey })}>
              Use public holidays
            </Button>
            {observedHolidayDates !== undefined && (
              <Button variant="secondary" onClick={() => setChoice({ mode: 'dates', source: planSearch, dates: datesKey })}>
                Use my holiday dates
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
          {(planFeed || shownCaveat) && (
            <p className="max-w-prose text-xs leading-5 text-muted">
              {planFeed && (shareObservedDates ? 'Uses your holiday dates, without their names. ' : 'Uses public holidays. ')}
              {shownCaveat}
            </p>
          )}
          {planFeed && caveat === undefined && (
            <details className="text-sm">
              <summary className="min-h-11 cursor-pointer py-3 font-semibold text-ink">How updates work</summary>
              <div className="flex max-w-prose flex-col gap-2 text-muted">
                {planUpdateNotes(calendarName, datesOnly).map((note) => <p key={note}>{note}</p>)}
              </div>
            </details>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" href={links.webcal} onClick={() => track('feed_subscribed')}>Apple Calendar</Button>
            <Button variant="secondary" href={links.google} target="_blank" rel="noopener noreferrer" onClick={() => track('feed_subscribed')}>
              Google Calendar<span className="sr-only"> (opens in a new tab)</span>
            </Button>
            <Button variant="secondary" href={links.outlook} target="_blank" rel="noopener noreferrer" onClick={() => track('feed_subscribed')}>
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
                  if (ok) track('feed_subscribed');
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
