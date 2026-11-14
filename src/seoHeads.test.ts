import { describe, expect, it } from 'vitest';

// P2 SEO audit: the static heads each route ships with (prerender.ts copies title and
// description into the WebApplication JSON-LD, so these strings are also the structured data).
const HEADS: Record<string, string> = import.meta.glob(
  ['../index.html', '../{pto,sabbatical,family,faq,data-sources,policy,glossary}/index.html'],
  { query: '?raw', import: 'default', eager: true },
);

function metas(html: string): { title: string; descriptions: string[] } {
  const flat = html.replace(/\s+/g, ' ');
  const title = /<title>([^<]*)<\/title>/.exec(flat)?.[1] ?? '';
  const descriptions = [...flat.matchAll(/(?:name|property)="(?:description|og:description|twitter:description)" content="([^"]*)"/g)].map((m) => m[1]);
  return { title, descriptions };
}

describe('route heads (P2 SEO)', () => {
  it('scans every main route head', () => {
    expect(Object.keys(HEADS)).toHaveLength(8);
  });

  it('uses sentence-case titles', () => {
    expect(metas(HEADS['../index.html']).title).toBe('%PRODUCT_NAME% &mdash; Plan and track your time off');
    expect(metas(HEADS['../family/index.html']).title).toBe('Family and school breaks &mdash; %PRODUCT_NAME%');
    expect(metas(HEADS['../sabbatical/index.html']).title).toBe('Sabbatical planning &mdash; %PRODUCT_NAME%');
    expect(metas(HEADS['../policy/index.html']).title).toBe('Your time-off policy, in plain English — %PRODUCT_NAME%');
  });

  it('describes each page without old product names or retired vocabulary', () => {
    for (const [file, html] of Object.entries(HEADS)) {
      const { descriptions } = metas(html);
      expect(descriptions.length, file).toBeGreaterThan(0);
      for (const d of descriptions) {
        expect(d, file).not.toMatch(/Gapless|PTO Optimizer|Sabbatical Planning|Days Off|time away|blackout dates/);
      }
    }
  });

  it('says what /data-sources now explains', () => {
    expect(metas(HEADS['../data-sources/index.html']).descriptions[0]).toBe(
      "Where Timebower's public holiday and travel data comes from, how it counts days off, and what stays in your browser.",
    );
  });
});
