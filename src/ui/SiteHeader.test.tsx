import { describe, it, expect, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { SiteHeader } from './SiteHeader';
import { Footer } from './Footer';
import { PRODUCT_NAME, PRODUCT_SHORT_NAME } from '../brand';

afterEach(cleanup);

describe('SiteHeader (redesign Phase 1)', () => {
  const html = renderToStaticMarkup(<SiteHeader active="pto" />);

  it('shows the full and the short product name (CSS picks one by width, no layout shift)', () => {
    expect(html).toContain(PRODUCT_NAME);
    expect(html).toContain(PRODUCT_SHORT_NAME);
  });

  it('uses the D2 nav labels in two labelled groups, with routes unchanged', () => {
    for (const [label, href] of [
      ['Plan PTO', '/pto'],
      ['Sabbatical', '/sabbatical'],
      ['Your policy', '/policy'],
      ['Glossary', '/glossary'],
    ]) {
      expect(html).toContain(`href="${href}"`);
      expect(html).toContain(`>${label}<`);
    }
    expect(html).toContain('aria-label="Plan"');
    expect(html).toContain('aria-label="Understand"');
    expect(html).not.toContain('>PTO Optimizer<');
    expect(html).not.toContain('>Sabbatical Planning<');
  });

  it('provides an accessible skip-to-main link before the navigation', () => {
    const html = renderToStaticMarkup(<SiteHeader active="pto" />);
    expect(html).toContain('href="#main-content"');
    expect(html).toContain('Skip to main content');
    expect(html).toContain('focus:not-sr-only');
    expect(html.indexOf('Skip to main content')).toBeLessThan(html.indexOf('aria-label="Plan"'));
  });

  it('the primary action is a link into the tool, not a submit', () => {
    expect(html).toMatch(/<a href="\/pto"[^>]*>Plan my time off<\/a>/);
    expect(html).not.toMatch(/type="submit"/);
  });

  it('marks the current page', () => {
    expect(html).toMatch(/href="\/pto"[^>]*aria-current="page"/);
  });

  it('reserves a fixed slot for sign-in, empty and hidden from assistive tech', () => {
    expect(html).toMatch(/data-slot="sign-in" aria-hidden="true"/);
  });

  it('provides visible keyboard focus and 44px mobile navigation targets', () => {
    const { getByRole, getAllByRole } = render(<SiteHeader active="pto" />);
    const menu = getByRole('button', { name: 'Menu' });
    expect(menu.className).toContain('min-h-11');
    expect(menu.className).toContain('min-w-11');
    expect(menu.className).toContain('focus-visible:outline');
    fireEvent.click(menu);
    for (const label of ['Plan PTO', 'Sabbatical', 'Your policy', 'Glossary']) {
      const links = getAllByRole('link', { name: label });
      expect(links.length).toBe(2);
      for (const link of links) {
        expect(link.className).toContain('focus-visible:outline');
      }
      expect(links[1].className).toContain('min-h-11');
    }
    for (const link of getAllByRole('link', { name: 'Plan my time off' })) {
      expect(link.className).toContain('focus-visible:outline');
    }
  });

  it('collapses the groups into an accessible disclosure that starts closed', () => {
    const { getByRole, container } = render(<SiteHeader active="landing" />);
    const button = getByRole('button', { name: 'Menu' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    const panel = container.ownerDocument.getElementById(button.getAttribute('aria-controls')!)!;
    expect(panel.hasAttribute('hidden')).toBe(true);
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(panel.hasAttribute('hidden')).toBe(false);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button);
  });
});

describe('Footer (redesign Phase 1)', () => {
  const html = renderToStaticMarkup(<Footer />);
  it('has Product / Resources / About columns and the D2 tool names', () => {
    for (const h of ['Product', 'Resources', 'About']) expect(html).toContain(`>${h}</h2>`);
    for (const l of ['Plan PTO', 'Sabbatical', 'Your policy', 'Glossary', 'FAQ', 'Privacy']) expect(html).toContain(`>${l}<`);
  });
  it('links to no external product', () => {
    const external = [...html.matchAll(/href="(https?:[^"]+)"/g)].map((m) => m[1]);
    expect(external).toEqual(['https://github.com/Atiyk/PTO-Optimizer/issues']);
  });
});
