import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { track } from './analytics';

beforeEach(() => {
  window.history.replaceState(null, '', '/pto?b=17&s=2027-06-01&e=2027-12-31&eh=private-calendar#private-plan');
  vi.spyOn(document, 'referrer', 'get').mockReturnValue('');
});

afterEach(() => {
  delete window.plausible;
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
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
