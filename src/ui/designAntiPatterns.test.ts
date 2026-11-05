import { describe, expect, it } from 'vitest';

/**
 * Lightweight regression guard for decorative tropes in the consumer UI.
 * Rendered screenshot review and user testing are still required.
 */
const PUBLIC_UI: Record<string, string> = import.meta.glob(
  [
    '../index.css',
    './Landing.tsx',
    './SiteHeader.tsx',
    './Footer.tsx',
    './Logo.tsx',
    './App.tsx',
    './Glossary.tsx',
    '../../public/privacy.html',
    '../../public/terms.html',
    '../../public/404.html',
  ],
  { query: '?raw', import: 'default', eager: true },
);

describe('Consumer anti-pattern source checks', () => {
  it('scans the real consumer screens and legal pages', () => {
    expect(Object.keys(PUBLIC_UI).length).toBe(10);
    expect(PUBLIC_UI['../../public/privacy.html']).toContain('<h1>Your time off is personal.');
    expect(PUBLIC_UI['../../public/terms.html']).toContain('<h1>Terms of use</h1>');
  });

  it('does not introduce gradient orbs, dot grids, neon colors or decorative looping animation', () => {
    const gimmicks = /\bbg-gradient(?:-[\w-]+)?|\b(?:radial|linear)-gradient\s*\(|\bdot-grid\b|\bradial-orb\b|\banimate-(?:bounce|spin|pulse)\b|\b(?:bg|text|from|via|to)-(?:purple|violet|fuchsia|pink)-[\w\d-]+/gi;
    const offenders = Object.entries(PUBLIC_UI)
      .flatMap(([path, source]) => [...source.matchAll(gimmicks)]
        .map(match => path + ': ' + match[0]));
    expect(offenders).toEqual([]);
  });

  it('does not add generic icon packs, fake testimonials or imitation pricing', () => {
    const unnecessary = /(?:from\s+['"]lucide-react['"]|<Sparkles\b|<StarRating\b|<FakeTestimonial\b|<PricingTier\b|<TerminalWindow\b)/gi;
    const offenders = Object.entries(PUBLIC_UI)
      .flatMap(([path, source]) => [...source.matchAll(unnecessary)]
        .map(match => path + ': ' + match[0]));
    expect(offenders).toEqual([]);
  });

  it('avoids decorative accent-colored stripes on legal trust callouts', () => {
    for (const path of ['../../public/privacy.html', '../../public/terms.html']) {
      expect(PUBLIC_UI[path]).not.toMatch(/border-left:\s*4px\s+solid\s+var\(--accent\)/);
    }
  });

  it('keeps the real interactive preview and visible legal/help links', () => {
    expect(PUBLIC_UI['./Landing.tsx']).toContain('id="landing-budget-slider"');
    expect(PUBLIC_UI['./Landing.tsx']).toContain('type="date"');
    expect(PUBLIC_UI['./Footer.tsx']).toContain('href="/privacy.html"');
    expect(PUBLIC_UI['./Footer.tsx']).toContain('href="/terms.html"');
    expect(PUBLIC_UI['../../public/terms.html']).toContain('href="/privacy.html"');
  });
});
