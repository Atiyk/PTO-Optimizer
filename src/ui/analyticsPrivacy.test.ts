import { afterEach, describe, expect, it, vi } from 'vitest';
import { ENTRIES } from '../../scripts/routes';
import glossaryTemplate from '../../scripts/generate-glossary-html.ts?raw';
import { analyticsBeforeSend, isSafeAnalyticsReferrer, sanitizeAnalyticsUrl } from './analyticsPrivacy';

const htmlSources: Record<string, string> = import.meta.glob([
  '../../index.html',
  '../../{pto,sabbatical,family,faq,data-sources,policy,uk,canada,australia,germany,ireland,india}/index.html',
  '../../glossary/**/index.html',
], { query: '?raw', import: 'default', eager: true });
const entrySources: Record<string, string> = import.meta.glob(
  '../{main,landing-main,policy-main,sabbatical-main,family-main,faq-main,data-sources-main,glossary-main,glossary-term-main}.tsx',
  { query: '?raw', import: 'default', eager: true },
);

afterEach(() => { vi.restoreAllMocks(); });

describe('analytics URL boundary', () => {
  it('removes the complete query and fragment from planning and policy URLs', () => {
    expect(sanitizeAnalyticsUrl('https://gapless.example/pto?b=17&s=2027-06-01&eh=private#partner-dates')).toBe('https://gapless.example/pto');
    expect(sanitizeAnalyticsUrl('https://gapless.example/policy?balance=17&note=private#forecast')).toBe('https://gapless.example/policy');
    expect(sanitizeAnalyticsUrl('https://gapless.example/glossary/pto')).toBe('https://gapless.example/glossary/pto');
  });

  it.each(['not a URL', '/pto?b=17', 'javascript:alert(1)', 'data:text/plain,private', 'https://secret:password@gapless.example/pto'])('fails closed for unsupported URLs: %s', (url) => {
    expect(sanitizeAnalyticsUrl(url)).toBeNull();
  });

  it('allows no referrer and ordinary origin-only referrals', () => {
    expect(isSafeAnalyticsReferrer('')).toBe(true);
    expect(isSafeAnalyticsReferrer('https://search.example/')).toBe(true);
  });

  it.each(['https://gapless.example/pto?b=17', 'https://gapless.example/#private', '/relative', 'malformed', 'https://secret:password@example.com/'])('fails closed for unsafe referrers: %s', (referrer) => {
    expect(isSafeAnalyticsReferrer(referrer)).toBe(false);
  });

  it.each(['pageview', 'event'] as const)('sanitizes Vercel %s URLs before transport', (type) => {
    vi.spyOn(document, 'referrer', 'get').mockReturnValue('https://search.example/');
    expect(analyticsBeforeSend({ type, url: 'https://gapless.example/policy?balance=17&leave=2027-06-01#private' })).toEqual({
      type, url: 'https://gapless.example/policy',
    });
  });

  it.each(['https://gapless.example/pto?b=17', 'https://other.example/#private', 'not a URL'])('cancels Vercel capture for an unsafe incoming referrer: %s', (referrer) => {
    vi.spyOn(document, 'referrer', 'get').mockReturnValue(referrer);
    expect(analyticsBeforeSend({ type: 'pageview', url: 'https://gapless.example/pto?b=17' })).toBeNull();
    expect(analyticsBeforeSend({ type: 'event', url: 'https://gapless.example/pto?b=17' })).toBeNull();
  });

  it('cancels malformed Vercel event URLs', () => {
    vi.spyOn(document, 'referrer', 'get').mockReturnValue('');
    expect(analyticsBeforeSend({ type: 'pageview', url: 'malformed' })).toBeNull();
  });
});

describe('consumer route privacy configuration', () => {
  it('uses manual Plausible tracking and an early referrer policy on every published app entry', () => {
    for (const entry of ENTRIES) {
      const html = htmlSources[`../../${entry.file}`];
      expect(html, entry.file).toContain('src="https://plausible.io/js/script.manual.js"');
      expect(html, entry.file).not.toContain('src="https://plausible.io/js/script.js"');
      const policy = html.indexOf('<meta name="referrer" content="no-referrer" />');
      expect(policy, entry.file).toBeGreaterThan(html.indexOf('<head>'));
      expect(policy, entry.file).toBeLessThan(html.indexOf('<script'));
    }
  });

  it('keeps the glossary generator and all consumer mounts behind the same boundary', () => {
    expect(glossaryTemplate).toContain('src="https://plausible.io/js/script.manual.js"');
    expect(glossaryTemplate).toContain('<meta name="referrer" content="no-referrer" />');
    for (const entry of ['main', 'landing-main', 'policy-main', 'sabbatical-main', 'family-main', 'faq-main', 'data-sources-main', 'glossary-main', 'glossary-term-main']) {
      const source = entrySources[`../${entry}.tsx`];
      expect(source, entry).toContain('<PrivacyAnalytics />');
      expect(source, entry).not.toContain("from '@vercel/analytics/react'");
    }
  });
});
