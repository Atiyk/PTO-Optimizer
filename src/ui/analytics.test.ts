import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { ANALYTICS_EVENTS, isGenuineReturn, isShareLinkArrival, track, trackPageviewOnce, trackReturnOncePerSession, trackBreakAction, trackOnceInDocument, trackSharedLinkOpened, type AnalyticsEvent } from './analytics';
import analyticsSource from './analytics.ts?raw';
import privacyPage from '../../public/privacy.html?raw';

beforeEach(() => {
  window.history.replaceState(null, '', '/pto?b=17&s=2027-06-01&e=2027-12-31&eh=private-calendar#private-plan');
  vi.spyOn(document, 'referrer', 'get').mockReturnValue('');
});

afterEach(() => {
  delete window.plausible;
  window.localStorage.removeItem('timebower.analytics.breakActions.v1');
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
});

describe('break action milestones', () => {
  it('counts a received partner proposal once across planner remounts in a document', () => {
    const spy = vi.fn();
    window.plausible = spy;
    trackOnceInDocument('partner_share_opened');
    trackOnceInDocument('partner_share_opened');
    expect(spy).toHaveBeenCalledExactlyOnceWith('partner_share_opened', { url: window.location.origin + '/pto' });
  });

  it('reports the first success of each type and one second distinct action without plan data', () => {
    const spy = vi.fn();
    window.plausible = spy;
    trackBreakAction('saved');
    trackBreakAction('saved');
    trackBreakAction('exported');
    trackBreakAction('tracked');
    trackBreakAction('shared');
    const path = { url: window.location.origin + '/pto' };
    expect(spy.mock.calls).toEqual([
      ['first_break_saved', path],
      ['first_break_exported', path],
      ['second_meaningful_break_action', path],
      ['first_break_tracked', path],
      ['first_break_shared', path],
    ]);
  });

  it('does not consume a browser-local milestone when the referrer is private', () => {
    vi.mocked(Object.getOwnPropertyDescriptor(document, 'referrer')!.get!).mockReturnValue('https://example.test/?private=1');
    trackBreakAction('saved');
    expect(window.plausible).toBeUndefined();
    expect(window.localStorage.getItem('timebower.analytics.breakActions.v1')).toBeNull();
  });
});

describe('track', () => {
  it('queues only the safe route when the manual tracker has not loaded yet', () => {
    expect(window.plausible).toBeUndefined();
    expect(() => track('Solve completed')).not.toThrow();
    expect(window.plausible?.q).toEqual([
      ['Solve completed', { url: window.location.origin + '/pto' }],
    ]);
  });

  it('overrides the automatic URL without attaching any planning properties', () => {
    const spy = vi.fn();
    window.plausible = spy;
    track('ICS downloaded');
    expect(spy).toHaveBeenCalledExactlyOnceWith('ICS downloaded', { url: window.location.origin + '/pto' });
    expect(JSON.stringify(spy.mock.calls)).not.toContain('2027-06-01');
    expect(JSON.stringify(spy.mock.calls)).not.toContain('private-calendar');
  });

  it('keeps a pending queue independent of the global tracker that replaces it', () => {
    track('request_tracking_started');
    const queue = window.plausible!;
    const pending = queue.q!;
    const loadedTracker = vi.fn();
    window.plausible = loadedTracker;
    for (const args of pending) loadedTracker(...args);
    track('request_status_updated');
    expect(loadedTracker).toHaveBeenNthCalledWith(1, 'request_tracking_started', { url: window.location.origin + '/pto' });
    expect(loadedTracker).toHaveBeenNthCalledWith(2, 'request_status_updated', { url: window.location.origin + '/pto' });
    expect(window.plausible.q).toBeUndefined();
    expect(pending).toHaveLength(1);
  });

  it.each([
    'https://gapless.example/policy?balance=17&planned=2027-06-01',
    'https://gapless.example/pto#private-calendar',
    'not a valid referrer',
  ])('does not track through an unsafe incoming referrer: %s', (referrer) => {
    vi.spyOn(document, 'referrer', 'get').mockReturnValue(referrer);
    const spy = vi.fn();
    window.plausible = spy;
    track('balance_forecast_used');
    expect(spy).not.toHaveBeenCalled();
  });

  it('keeps tracking safe origin-only referrals', () => {
    vi.spyOn(document, 'referrer', 'get').mockReturnValue('https://search.example/');
    const spy = vi.fn();
    window.plausible = spy;
    track('portrait_image_exported');
    expect(spy).toHaveBeenCalledExactlyOnceWith('portrait_image_exported', { url: window.location.origin + '/pto' });
  });

  it('never throws even if window.plausible itself throws', () => {
    window.plausible = () => {
      throw new Error('blocked by an extension');
    };
    expect(() => track('Image copied')).not.toThrow();
  });
});

describe('share-link arrivals and subscriptions', () => {
  it('counts a visit from a public share link once per document, with only the event name and route', () => {
    const spy = vi.fn();
    window.plausible = spy;
    const shared = '?sv=1&c=US&s=2027-01-01&e=2027-12-31&b=17&er=4&hf=abc';
    expect(isShareLinkArrival(shared)).toBe(true);
    trackSharedLinkOpened(shared);
    trackSharedLinkOpened(shared);
    expect(spy).toHaveBeenCalledExactlyOnceWith('shared_link_opened', { url: window.location.origin + '/pto' });
  });

  it('does not count a fresh visit, a saved private link or a partner link as a share-link arrival', () => {
    for (const search of ['', '?c=US&s=2027-01-01&b=17', '?pp=abc', '?sv=2']) expect(isShareLinkArrival(search)).toBe(false);
  });
});

describe('campaign attribution', () => {
  it('adds only allowlisted utm labels to the Plausible pageview, never to custom events', () => {
    window.history.replaceState(null, '', '/2027/us?utm_source=Reddit&utm_medium=social&utm_campaign=launch&utm_term=pto&b=15&s=2027-06-01#private');
    const spy = vi.fn();
    window.plausible = spy;
    trackPageviewOnce();
    track('guide_plan_opened');
    const route = window.location.origin + '/2027/us';
    expect(spy.mock.calls).toEqual([
      ['pageview', { url: `${route}?utm_source=reddit&utm_medium=social&utm_campaign=launch` }],
      ['guide_plan_opened', { url: route }],
    ]);
  });

  it('still suppresses a campaign pageview behind an unsafe incoming referrer', () => {
    window.history.replaceState(null, '', '/?utm_source=newsletter');
    vi.spyOn(document, 'referrer', 'get').mockReturnValue('https://mail.example/read?id=person@example.com');
    const spy = vi.fn();
    window.plausible = spy;
    trackPageviewOnce();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('event catalog', () => {
  it('declares the funnel events other surfaces call, and keeps every name in the runtime list', () => {
    const list = analyticsSource.slice(analyticsSource.indexOf('export const ANALYTICS_EVENTS'), analyticsSource.indexOf('] as const;'));
    const names = [...list.matchAll(/^\s*'([^']+)',/gm)].map((match) => match[1]);
    expect([...ANALYTICS_EVENTS].sort()).toEqual([...names].sort());
    for (const name of ['guide_plan_opened', 'holiday_check_opened', 'landing_plan_opened', 'shared_plan_made_own', 'request_text_copied']) {
      expect(ANALYTICS_EVENTS).toContain(name);
    }
    expect(new Set(ANALYTICS_EVENTS).size).toBe(ANALYTICS_EVENTS.length);
  });

  it('lists exactly the declared events on the privacy page', () => {
    const section = privacyPage.slice(privacyPage.indexOf('<section id="analytics"'));
    const list = section.slice(section.indexOf('<ul>'), section.indexOf('</ul>'));
    expect(section.indexOf('<ul>')).toBeLessThan(section.indexOf('</section>'));
    const listed = [...list.matchAll(/<code>([^<]+)<\/code>/g)].map((match) => match[1]);
    expect([...listed].sort()).toEqual([...ANALYTICS_EVENTS].sort());
  });
});

describe('event payload privacy', () => {
  it('sends no event properties, so a balance or date can never ride along', () => {
    const spy = vi.fn();
    window.plausible = spy;
    const events: AnalyticsEvent[] = ['Solve completed', 'URL shared', 'ICS downloaded', 'returned_with_saved_url', 'holiday_preference_customized', 'shared_link_opened', 'feed_subscribed'];
    for (const event of events) track(event);
    expect(spy).toHaveBeenCalledTimes(events.length);
    for (const [name, options] of spy.mock.calls) {
      expect(Object.keys(options)).toEqual(['url']);
      expect(options.url).toBe(window.location.origin + '/pto');
      expect(`${name} ${JSON.stringify(options)}`).not.toMatch(/b=|17|2027|private/);
    }
  });

  it('keeps event names free of digits and the public API free of a props argument', () => {
    const names: readonly string[] = ANALYTICS_EVENTS;
    expect(names).toContain('shared_link_opened');
    expect(names).toContain('feed_subscribed');
    for (const name of names) expect(name, name).not.toMatch(/\d/);
    expect(analyticsSource).toMatch(/export function track\(event: AnalyticsEvent\): void/);
    expect(analyticsSource).toMatch(/window\.plausible\(event, \{ url \}\)/);
    // A future `track(event, props)` would have to change these lines and fail here.
    expect(track.length).toBe(1);
  });
});

describe('returned_with_saved_url: genuine returns only (baseline item 15)', () => {
  afterEach(() => { window.sessionStorage.clear(); });

  it('ignores homepage CTAs, share links, hand-offs and partner links', () => {
    expect(isGenuineReturn('?c=US&b=15&s=2026-11-14&e=2027-11-13&pv=2&lp=1', false)).toBe(false);
    expect(isGenuineReturn('?sv=1&c=US&b=15&s=2027-01-01&e=2027-12-31', false)).toBe(false);
    expect(isGenuineReturn('?c=US&b=15&s=2027-01-01&hx=abc', false)).toBe(false);
    expect(isGenuineReturn('?pp=xyz&s=2027-01-01&b=3', false)).toBe(false);
    expect(isGenuineReturn('', false)).toBe(false);
  });

  it('does not count a reload or later page in the same tab session as a return (regression)', () => {
    const spy = vi.fn();
    window.plausible = spy;
    // First planner document of the tab: a fresh visit, nothing saved yet.
    trackReturnOncePerSession('', false);
    // The person saves a plan, reloads (the address bar now holds s and b) or goes to
    // another page and back. Same visit: never a return.
    trackReturnOncePerSession('?c=US&b=15&s=2027-01-01&e=2027-12-31', false);
    trackReturnOncePerSession('', true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('counts a kept private plan link, or any visit with a saved plan, once per session', () => {
    expect(isGenuineReturn('?c=US&b=15&s=2027-01-01&e=2027-12-31', false)).toBe(true);
    expect(isGenuineReturn('', true)).toBe(true);
    const spy = vi.fn();
    window.plausible = spy;
    trackReturnOncePerSession('?c=US&b=15&s=2027-01-01&e=2027-12-31', false);
    trackReturnOncePerSession('', true);
    expect(spy).toHaveBeenCalledExactlyOnceWith('returned_with_saved_url', { url: window.location.origin + '/pto' });
  });

  it('a share-link arrival counts as shared_link_opened and not as a return', () => {
    const spy = vi.fn();
    window.plausible = spy;
    const shared = '?sv=1&c=US&b=15&s=2027-01-01&e=2027-12-31';
    trackReturnOncePerSession(shared, false);
    expect(spy).not.toHaveBeenCalled();
    expect(isShareLinkArrival(shared)).toBe(true); // counted once per document by trackSharedLinkOpened (tested above)
  });

  it('plan_saved is an event name with no properties', () => {
    const spy = vi.fn();
    window.plausible = spy;
    track('plan_saved');
    expect(spy).toHaveBeenCalledExactlyOnceWith('plan_saved', { url: window.location.origin + '/pto' });
  });
});
