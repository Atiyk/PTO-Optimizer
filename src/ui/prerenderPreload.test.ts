import { describe, expect, it } from 'vitest';
import { preloadScriptFor } from '../../scripts/prerenderPreload';

/**
 * F17: /sabbatical/ (and /family/) kept saying "Dates above as of <build date> — this page
 * recomputes live once it loads" after the app had loaded. The build-time stamp was
 * re-embedded in the shipped <head> script, so the live client read it too. The stamp
 * belongs to the Node prerender only; the shipped script must carry only the holiday data.
 */
describe('shipped preload script', () => {
  const holidays = [{ date: '2026-12-25', name: 'Christmas Day' }];

  it('embeds the prerendered holidays for the first paint', () => {
    const script = preloadScriptFor('US', holidays as never, [2026]);
    expect(script).toContain('window.__PTO_PRELOADED_HOLIDAYS__ = {"US":[{"date":"2026-12-25","name":"Christmas Day"}]}');
    expect(script).toContain('window.__PTO_PRELOADED_HOLIDAY_YEARS__ = {"US":[2026]}');
  });

  it('does not hand the build-time stamp to the live page', () => {
    expect(preloadScriptFor('US', holidays as never, [2026])).not.toContain('__PTO_PRERENDERED_AT__');
  });
});
