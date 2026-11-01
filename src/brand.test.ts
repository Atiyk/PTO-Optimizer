import { describe, expect, it } from 'vitest';
import { FORMER_NAME, PRODUCT_NAME, PRODUCT_SHORT_NAME } from './brand';

// Redesign Phase 0: the product was renamed. Its former name may appear only in a
// "formerly Days Off" mention (and via FORMER_NAME in the one FAQ entry about the rename);
// everything else that names the product reads src/brand.ts. This scans the sources that
// produce user-facing output - the per-route HTML shells, public/, src/, the build scripts -
// so a stray literal is caught before the build. (The gate also greps dist/ after the build.)
// import.meta.glob (not node:fs) so the file type-checks under the browser tsconfig.
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
    expect(FORMER_NAME).toBe('Days Off');
  });

  it('never names the product by its former name outside a "formerly" mention', () => {
    const offenders: string[] = [];
    for (const [file, text] of Object.entries(SOURCES)) {
      for (const m of text.matchAll(/(formerly )?Days Off\b/g)) {
        if (!m[1]) offenders.push(`${file}: …${text.slice(Math.max(0, m.index - 30), m.index + 20)}…`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('has no link or mention of the separate teams product', () => {
    const offenders = Object.entries(SOURCES)
      .filter(([, text]) => /apps\/teams|Days Off for Teams|for Teams\b/.test(text))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });
});
