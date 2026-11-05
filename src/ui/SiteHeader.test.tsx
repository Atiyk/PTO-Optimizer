import { describe, it, expect, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { render, cleanup } from '@testing-library/react';
import { SiteHeader } from './SiteHeader';
import { Footer } from './Footer';

afterEach(cleanup);

describe('SiteHeader (redesign Phase 1)', () => {
  const html = renderToStaticMarkup(<SiteHeader active="pto" />);

  it('uses one strong Gapless wordmark with an accessible full product name', () => {
    expect(html).not.toContain('aria-label="Gapless PTO Optimizer, home"');
    // The wordmark is outlined type: one SVG named "Gapless" for assistive tech.
    expect(html).toMatch(/<svg[^>]*role="img"[^>]*aria-label="Gapless"[^>]*>\s*<title>Gapless<\/title>/);
    expect(html).toMatch(/>PTO Optimizer\s*<\/span>/);
  });

  it('derives the home link name from visible brand text and an unobtrusive home cue', () => {
    const { getByRole } = render(<SiteHeader active="pto" />);
    // JSDOM's accessible-name calculator concatenates nested flex spans without
    // the whitespace supplied by real browser layout. The Playwright header QA
    // and Lighthouse WCAG 2.5.3 gate assert the exact normalized name in Chromium.
    const home = getByRole('link', { name: /Gapless.*PTO Optimizer.*home/i });
    expect(home.getAttribute('href')).toBe('/');
    expect(home.hasAttribute('aria-label')).toBe(false);
    expect(home.querySelector('.sr-only')?.textContent?.trim()).toBe('home');
    expect(home.textContent).toContain('Gapless');
    expect(home.textContent).toContain('PTO Optimizer');
  });

  it('uses four flat destinations and one primary PTO action without nested categories', () => {
    for (const [label, href] of [
      ['Plan PTO', '/pto'],
      ['Sabbatical', '/sabbatical'],
      ['Family', '/family'],
      ['My PTO', '/policy'],
      ['Learn', '/glossary'],
    ]) {
      expect(html).toContain(`href="${href}"`);
      expect(html).toContain(`>${label}<`);
    }
    expect(html).toContain('aria-label="Explore"');
    expect(html).not.toContain('aria-label="Understand"');
    expect(html).toMatch(/>PTO Optimizer\s*<\/span>/);
    expect(html).not.toContain('>Sabbatical Planning<');
  });

  it('provides an accessible skip-to-main link before the navigation', () => {
    const html = renderToStaticMarkup(<SiteHeader active="pto" />);
    expect(html).toContain('href="#main-content"');
    expect(html).toContain('Skip to main content');
    expect(html).toContain('focus:not-sr-only');
    expect(html.indexOf('Skip to main content')).toBeLessThan(html.indexOf('aria-label="Explore"'));
  });

  it('the primary action is a link into the tool, not a submit', () => {
    expect(html).toMatch(/<a href="\/pto"[^>]*>Plan PTO<\/a>/);
    expect(html).not.toMatch(/type="submit"/);
  });

  it('marks the current page', () => {
    expect(html).toMatch(/href="\/pto"[^>]*aria-current="page"/);
  });

  it('does not waste header space on unavailable sign-in', () => {
    expect(html).not.toContain('data-slot="sign-in"');
  });

  it('provides visible keyboard focus and 44px+ phone tab-bar targets for every destination', () => {
    const { getByRole } = render(<SiteHeader active="pto" />);
    const tabs = getByRole('navigation', { name: 'Tools' });
    const links = [...tabs.querySelectorAll('a')];
    expect(links.map((l) => l.textContent?.trim())).toEqual(['Plan PTO', 'Sabbatical', 'Family', 'My PTO', 'Learn']);
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/pto', '/sabbatical', '/family', '/policy', '/glossary']);
    for (const link of links) {
      expect(link.className).toContain('min-h-14');
      expect(link.className).toContain('focus-visible:outline');
    }
    expect(links[0].getAttribute('aria-current')).toBe('page');
    expect(tabs.className).toContain('lg:hidden');
  });

  it('keeps every destination one tap away on phones, with no menu to open first', () => {
    const html = renderToStaticMarkup(<SiteHeader active="landing" />);
    expect(html).not.toContain('aria-expanded');
    expect(html).not.toMatch(/\shidden=""/);
  });
});

describe('Footer (redesign Phase 1)', () => {
  const html = renderToStaticMarkup(<Footer />);
  it('has Product / Resources / About columns and the D2 tool names', () => {
    for (const h of ['Explore', 'Resources', 'Help &amp; privacy']) expect(html).toContain(`>${h}</h2>`);
    for (const l of ['Plan PTO', 'Sabbatical', 'Family', 'My PTO', 'Learn', 'FAQ', 'Privacy', 'Terms of use']) expect(html).toContain(`>${l}<`);
  });
  it('links directly to the configured feedback address', () => {
    expect(html).toContain('mailto:atiykahmeed6310@gmail.com?subject=Gapless%20feedback');
    expect(html).toContain('Contact &amp; feedback');
    expect(html).not.toContain('formerly');
    expect(html).toContain('href="/terms.html"');
  });

  it('links to no external product', () => {
    const external = [...html.matchAll(/href="(https?:[^"]+)"/g)].map((m) => m[1]);
    expect(external).toEqual(['https://github.com/Atiyk/PTO-Optimizer/issues']);
  });
});
