import { describe, it, expect, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { render, cleanup } from '@testing-library/react';
import { SiteHeader } from './SiteHeader';
import { Footer } from './Footer';

afterEach(cleanup);

describe('SiteHeader (2026-11 information architecture)', () => {
  const html = renderToStaticMarkup(<SiteHeader active="pto" />);

  it('uses one Gapless lockup whose accessible name keeps the full product name', () => {
    expect(html).not.toContain('aria-label="Gapless PTO Optimizer, home"');
    expect(html).toMatch(/>Gapless\s*<\/span>/);
    expect(html).toMatch(/>PTO Optimizer\s*<\/span>/);
  });

  it('derives the home link name from visible brand text and an unobtrusive home cue', () => {
    const { getByRole } = render(<SiteHeader active="pto" />);
    const home = getByRole('link', { name: /Gapless.*PTO Optimizer.*home/i });
    expect(home.getAttribute('href')).toBe('/');
    expect(home.hasAttribute('aria-label')).toBe(false);
    expect(home.querySelector('.sr-only')?.textContent?.trim()).toBe('home');
  });

  it('has three destinations: Plan, My PTO, Learn', () => {
    const { getByRole } = render(<SiteHeader active="landing" />);
    const main = getByRole('navigation', { name: 'Main' });
    expect([...main.querySelectorAll('a')].map((a) => [a.textContent?.trim(), a.getAttribute('href')])).toEqual([
      ['Plan', '/pto'], ['My PTO', '/policy'], ['Learn', '/glossary'],
    ]);
  });

  it('shows the three ways to plan on every planning route, and marks the current one', () => {
    for (const [route, label] of [['pto', 'Time off'], ['family', 'Family'], ['sabbatical', 'Sabbatical']] as const) {
      const { getByRole } = render(<SiteHeader active={route} />);
      const modes = getByRole('navigation', { name: 'Ways to plan' });
      expect([...modes.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(['/pto', '/family', '/sabbatical']);
      expect(modes.querySelector('[aria-current="page"]')?.textContent).toBe(label);
      // "Plan" stays the current destination for all three.
      expect(getByRole('navigation', { name: 'Main' }).querySelector('[aria-current="page"]')?.textContent).toBe('Plan');
      cleanup();
    }
  });

  it('does not show the planning modes off the planning routes', () => {
    for (const route of ['landing', 'policy', 'glossary', 'other'] as const) {
      expect(renderToStaticMarkup(<SiteHeader active={route} />)).not.toContain('Ways to plan');
    }
  });

  it('provides an accessible skip-to-main link before the navigation', () => {
    expect(html).toContain('href="#main-content"');
    expect(html).toContain('Skip to main content');
    expect(html).toContain('focus:not-sr-only');
    expect(html.indexOf('Skip to main content')).toBeLessThan(html.indexOf('aria-label="Main"'));
  });

  it('has no submit-style control', () => {
    expect(html).not.toMatch(/type="submit"/);
    expect(html).not.toContain('data-slot="sign-in"');
  });

  it('gives the phone tab bar three 56px targets with visible focus', () => {
    const { getByRole } = render(<SiteHeader active="family" />);
    const tabs = getByRole('navigation', { name: 'Tools' });
    const links = [...tabs.querySelectorAll('a')];
    expect(links.map((l) => l.textContent?.trim())).toEqual(['Plan', 'My PTO', 'Learn']);
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/pto', '/policy', '/glossary']);
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
    for (const l of ['Plan time off', 'Plan around school breaks', 'Plan a sabbatical', 'My PTO', 'Learn', 'FAQ', 'Privacy', 'Terms of use']) expect(html).toContain(`>${l}<`);
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
