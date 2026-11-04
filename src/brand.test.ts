import { describe, expect, it } from 'vitest';
import { PRODUCT_NAME, PRODUCT_SHORT_NAME } from './brand';

// Scan consumer-facing sources for references to legacy branding. Plain descriptive text
// such as lowercase 'days off' is not a brand mention. Internal package names remain intact.
// import.meta.glob avoids Node-only filesystem imports in the browser tsconfig.
const SOURCES: Record<string, string> = import.meta.glob(
  [
    '../index.html',
    '../{pto,sabbatical,faq,data-sources,policy,uk,canada,australia,germany,ireland,india}/index.html',
    '../glossary/**/index.html',
    '../public/*.{html,txt,webmanifest}',
    '../public/docs/**/*.html',
    './**/*.{ts,tsx}',
    '!./**/*.test.{ts,tsx}',
    '!./brand.ts',
    '../scripts/{prerender,build-og-images,generate-glossary-html,build-seo-files}.ts',
  ],
  { query: '?raw', import: 'default', eager: true },
);

describe('brand', () => {
  it('scans the user-facing sources', () => {
    // Guards against a glob typo silently scanning nothing.
    expect(Object.keys(SOURCES).length).toBeGreaterThan(100);
    expect(Object.keys(SOURCES)).toContain('../index.html');
    expect(Object.keys(SOURCES)).toContain('../public/404.html');
  });


  it('defines the product name and its short form', () => {
    expect(PRODUCT_NAME).toBe('Gapless PTO Optimizer');
    expect(PRODUCT_SHORT_NAME).toBe('Gapless PTO');
  });

  it('does not display the legacy product name anywhere in consumer sources', () => {
    const offenders: string[] = [];
    for (const [file, text] of Object.entries(SOURCES)) {
      for (const m of text.matchAll(/Days Off\b/g)) {
        offenders.push(`${file}: …${text.slice(Math.max(0, m.index - 30), m.index + 20)}…`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('publishes an accessible privacy page and a real email support action', () => {
    const privacy = SOURCES['../public/privacy.html'];
    expect(privacy).toContain('Privacy at Gapless');
    expect(privacy).toContain('What stays in your browser');
    expect(privacy).toContain('What happens when you share a plan');
    expect(privacy).toContain('Vercel Web Analytics');
    expect(privacy).toContain('Plausible');
    expect(privacy).toContain('mailto:atiykahmeed6310@gmail.com?subject=Gapless%20feedback');
    expect(privacy).toContain('id="main-content"');
  });

  it('publishes plain-language terms with an accurate privacy link', () => {
    const terms = SOURCES['../public/terms.html'];
    expect(terms).toContain('<h1>Terms of use</h1>');
    expect(terms).toContain('Gapless does not provide legal, tax, financial, HR or employment advice.');
    expect(terms).toContain('href="/privacy.html"');
    expect(terms).toContain('mailto:atiykahmeed6310@gmail.com?subject=Gapless%20terms');
    expect(SOURCES['../public/privacy.html']).toContain('href="/terms.html"');
  });

  it('has no link or mention of the separate teams product', () => {
    const offenders = Object.entries(SOURCES)
      .filter(([, text]) => /apps\/teams|Days Off for Teams|for Teams\b/.test(text))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });
});
