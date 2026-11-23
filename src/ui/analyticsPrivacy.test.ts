import { afterEach, describe, expect, it, vi } from 'vitest';
import { ENTRIES } from '../../scripts/routes';
import glossaryTemplate from '../../scripts/generate-glossary-html.ts?raw';
import { analyticsBeforeSend, isSafeAnalyticsReferrer, sanitizeAnalyticsUrl, sanitizeCampaignPageviewUrl } from './analyticsPrivacy';

const htmlSources: Record<string, string> = import.meta.glob([
  '../../index.html',
  '../../{pto,sabbatical,family,faq,data-sources,policy,uk,canada,australia,germany,ireland,india}/index.html',
  '../../glossary/**/index.html',
  '../../2027/**/index.html',
], { query: '?raw', import: 'default', eager: true });
const entrySources: Record<string, string> = import.meta.glob(
  '../{main,landing-main,policy-main,sabbatical-main,family-main,faq-main,data-sources-main,glossary-main,glossary-term-main,guide-main}.tsx',
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

  it('forwards only the event type and sanitized URL, dropping any other field a future SDK adds', () => {
    vi.spyOn(document, 'referrer', 'get').mockReturnValue('');
    const event = {
      type: 'pageview' as const, url: 'https://gapless.example/pto?b=17&eh=private',
      path: '/pto?b=17&eh=private', route: '/pto?bo=2027-02-04', properties: { balance: 17 },
    };
    expect(analyticsBeforeSend(event)).toStrictEqual({ type: 'pageview', url: 'https://gapless.example/pto' });
    expect(analyticsBeforeSend({ type: 'mystery' as 'event', url: 'https://gapless.example/pto' })).toBeNull();
  });

  it('cancels malformed Vercel event URLs', () => {
    vi.spyOn(document, 'referrer', 'get').mockReturnValue('');
    expect(analyticsBeforeSend({ type: 'pageview', url: 'malformed' })).toBeNull();
  });
});

describe('campaign attribution boundary (Plausible pageviews only)', () => {
  const base = 'https://timebower.example/2027/uk-bank-holidays';

  it('keeps only utm_source, utm_medium and utm_campaign, in a fixed order, lowercased', () => {
    expect(sanitizeCampaignPageviewUrl(`${base}?utm_campaign=Spring_Launch&b=15&utm_medium=Social&utm_source=Reddit#private`))
      .toBe(`${base}?utm_source=reddit&utm_medium=social&utm_campaign=spring_launch`);
    expect(sanitizeCampaignPageviewUrl(`${base}?utm_source=newsletter`)).toBe(`${base}?utm_source=newsletter`);
    expect(sanitizeCampaignPageviewUrl(`${base}?utm_source=hn&utm_medium=post-2027`)).toBe(`${base}?utm_source=hn&utm_medium=post-2027`);
  });

  it('returns the plain route when there is nothing safe to keep', () => {
    expect(sanitizeCampaignPageviewUrl(`${base}`)).toBe(base);
    expect(sanitizeCampaignPageviewUrl(`${base}?b=15&s=2027-06-01&e=2027-12-31&eh=private`)).toBe(base);
    expect(sanitizeCampaignPageviewUrl('https://timebower.example/pto?sv=1&b=15&utm_x=1')).toBe('https://timebower.example/pto');
  });

  it.each([
    ['utm_term', 'utm_term=pto+balance'],
    ['utm_content', 'utm_content=button'],
    ['ref', 'ref=producthunt'],
    ['source', 'source=newsletter'],
    ['gclid', 'gclid=abc123'],
    ['fbclid', 'fbclid=IwAR0abc'],
    ['upper-case key', 'UTM_SOURCE=reddit'],
    ['mixed-case key', 'Utm_Source=reddit'],
    ['bracketed key', 'utm_source[]=reddit'],
    ['padded key', 'utm_source%20=reddit'],
  ])('drops parameters outside the allowlist: %s', (_label, query) => {
    expect(sanitizeCampaignPageviewUrl(`${base}?${query}`)).toBe(base);
  });

  it.each([
    ['an email address', 'person@example.com'],
    ['an encoded email address', 'person%40example.com'],
    ['an ISO date', '2027-06-01'],
    ['a date with a letter prefix', 'x2027-06-01'],
    ['a compact date', 'leave20270601'],
    ['a balance', '15'],
    ['a decimal balance', '17.5'],
    ['a long number', 'id1234567'],
    ['a phone number', '5551234567'],
    ['a value with spaces', 'my plan'],
    ['an empty value', ''],
    ['a leading separator', '-reddit'],
    ['a leading underscore', '_reddit'],
    ['base64 padding', 'am9obkBleGFtcGxlLmNvbQ=='],
    ['a URL', 'https://evil.example/?b=15'],
    ['a nested query', 'reddit&b=15'.replace('&', '%26')],
    ['a fragment', 'reddit%23private'],
    ['unicode', 'r%C3%A9ddit'],
    ['a percent-encoded control char', 'reddit%00'],
    ['an overlong value', 'a'.repeat(41)],
  ])('drops a value that is not a short plain label: %s', (_label, value) => {
    expect(sanitizeCampaignPageviewUrl(`${base}?utm_source=${value}`)).toBe(base);
    expect(sanitizeCampaignPageviewUrl(`${base}?utm_source=reddit&utm_campaign=${value}`)).toBe(`${base}?utm_source=reddit`);
  });

  it('accepts a 40-character label and decodes harmless percent-encoding before checking', () => {
    expect(sanitizeCampaignPageviewUrl(`${base}?utm_campaign=${'a'.repeat(40)}`)).toBe(`${base}?utm_campaign=${'a'.repeat(40)}`);
    expect(sanitizeCampaignPageviewUrl(`${base}?utm_source=%72eddit`)).toBe(`${base}?utm_source=reddit`);
  });

  it('matches the naming examples in docs/growth/METRICS.md', () => {
    expect(sanitizeCampaignPageviewUrl(`${base}?utm_source=reddit&utm_medium=social&utm_campaign=pto_2027_guide`))
      .toBe(`${base}?utm_source=reddit&utm_medium=social&utm_campaign=pto_2027_guide`);
    expect(sanitizeCampaignPageviewUrl(`${base}?utm_campaign=guide-2027-01`)).toBe(base);
  });

  it('drops a key that appears more than once rather than guess which value is meant', () => {
    expect(sanitizeCampaignPageviewUrl(`${base}?utm_source=reddit&utm_source=hn&utm_medium=social`)).toBe(`${base}?utm_medium=social`);
    expect(sanitizeCampaignPageviewUrl(`${base}?utm_source=reddit&utm_source=reddit`)).toBe(base);
  });

  it.each(['not a URL', '/pto?utm_source=reddit', 'javascript:alert(1)?utm_source=x', 'https://secret:password@timebower.example/?utm_source=reddit'])('fails closed like the plain sanitizer: %s', (url) => {
    expect(sanitizeCampaignPageviewUrl(url)).toBeNull();
  });

  it('never adds campaign parameters to the Vercel payload', () => {
    vi.spyOn(document, 'referrer', 'get').mockReturnValue('');
    expect(analyticsBeforeSend({ type: 'pageview', url: `${base}?utm_source=reddit&utm_medium=social` }))
      .toStrictEqual({ type: 'pageview', url: base });
  });

  it('keeps the plain sanitizer origin+path only, even with campaign parameters', () => {
    expect(sanitizeAnalyticsUrl(`${base}?utm_source=reddit`)).toBe(base);
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
    for (const entry of ['main', 'landing-main', 'policy-main', 'sabbatical-main', 'family-main', 'faq-main', 'data-sources-main', 'glossary-main', 'glossary-term-main', 'guide-main']) {
      const source = entrySources[`../${entry}.tsx`];
      expect(source, entry).toContain('<PrivacyAnalytics />');
      expect(source, entry).not.toContain("from '@vercel/analytics/react'");
    }
  });
});
