import { useEffect, useRef, useState } from 'react';
import { Button } from './Button';
import { copyText } from './requestText';
import { DEFAULT_SITE_HOST } from './siteUrl';
import { FEED_CALENDAR_NAME, MAX_FEED_QUERY_LENGTH } from '../autopilot/feed';

export interface FeedLinks {
  https: string;
  webcal: string;
  google: string;
  outlook: string;
}

/** The live feed's URLs for a plan's query string. Formats checked against published
 * subscribe links (Nov 2026): Google takes the webcal URL in `cid`; Outlook.com takes the
 * https URL in `url` plus a display `name`. */
export function feedLinks(origin: string, planSearch: string): FeedLinks {
  const query = planSearch.startsWith('?') ? planSearch.slice(1) : planSearch;
  const https = `${origin.replace(/\/$/, '')}/api/feed${query ? `?${query}` : ''}`;
  const webcal = https.replace(/^https?:\/\//, 'webcal://');
  return {
    https,
    webcal,
    google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`,
    outlook: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(https)}&name=${encodeURIComponent(FEED_CALENDAR_NAME)}`,
  };
}

/**
 * F1: subscribe to this plan as a live calendar. Nothing to submit: the links are always
 * the current plan's, and the feed re-solves from the same link on every refresh.
 */
export function SubscribeFeed({ planSearch, origin }: { planSearch: string; origin?: string }) {
  const resolvedOrigin = origin ?? (typeof window !== 'undefined' ? window.location.origin : `https://${DEFAULT_SITE_HOST}`);
  const links = feedLinks(resolvedOrigin, planSearch);
  const tooLong = planSearch.replace(/^\?/, '').length > MAX_FEED_QUERY_LENGTH;
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <section aria-labelledby="subscribe-feed-heading" className="flex min-w-0 flex-col gap-3 border-t border-line pt-5">
      <h3 id="subscribe-feed-heading" className="text-xl font-bold leading-6 text-ink type-condensed">Keep this plan in your calendar</h3>
      {tooLong ? (
        <p className="max-w-prose text-sm text-muted">This plan’s link is too long for a calendar subscription. Use “Add to calendar (.ics)” above instead.</p>
      ) : (
        <>
          <p className="max-w-prose text-sm text-muted">
            Subscribe once. Your calendar shows your PTO days, public holidays and a “book by” reminder before each break, and the
            holidays and book-by dates stay current. Editing the plan here gives a new link, so subscribe again after a change.
          </p>
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
            <label htmlFor="subscribe-feed-url" className="text-sm font-semibold text-ink">Or paste this link into any calendar app</label>
            <div className="flex min-w-0 flex-wrap gap-2 sm:flex-nowrap">
              <input
                id="subscribe-feed-url"
                type="url"
                readOnly
                value={links.https}
                onFocus={(event) => event.currentTarget.select()}
                className="h-11 w-full min-w-0 flex-1 rounded-[3px] border border-line-strong bg-surface px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
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
                {copyMessage ?? 'Copy link'}
              </Button>
            </div>
            <span className="sr-only" role="status">{copyMessage ?? ''}</span>
          </div>
        </>
      )}
    </section>
  );
}
