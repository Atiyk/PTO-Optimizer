import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { GuidePage } from './GuidePage';
import { GUIDES, guideFacts } from '../content/guides/guides2027';
import { findBannedVocabulary } from '../content/vocabulary';

afterEach(() => {
  cleanup();
  delete window.plausible;
  vi.restoreAllMocks();
});

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

describe('guide pages', () => {
  it.each(GUIDES.map((g) => [g.path, g] as const))('%s shows its computed plan and links it to /pto', (path, guide) => {
    const { container } = render(<GuidePage path={path} />);
    const f = guideFacts(guide);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(guide.h1);
    const primary = screen.getByRole('link', { name: /Open this plan in Timebower/ });
    expect(primary.getAttribute('href')).toBe(f.plans[0].href);
    expect(screen.getAllByRole('link', { name: /Open this (plan|version)/ }).map((a) => a.getAttribute('href'))).toEqual(f.plans.map((p) => p.href));
    expect(container.textContent).toContain(`${f.plans[0].daysOff} days off for ${f.plans[0].ptoUsed}`);
    for (const b of f.plans[0].breaks) expect(container.textContent).toContain(String(b.totalDaysOff));
    // No submit-style controls: every plan opens through a plain link.
    expect(container.querySelectorAll('button, form, input')).toHaveLength(0);
    expect(container.querySelector('a[href="/policy"]')).not.toBeNull();
    expect(container.querySelector('a[href="/pto"]')).not.toBeNull();
    expect(container.querySelector('a[href="/faq"]')).not.toBeNull();
    expect(container.querySelector('a[href="/data-sources"]')).not.toBeNull();
    expect(container.textContent).toMatch(/Last checked/);
  });

  it.each(GUIDES.map((g) => [g.path, g] as const))('%s has 400 to 900 words of copy', (path) => {
    const { container } = render(<GuidePage path={path} />);
    // The article: answer, plans and tables, explanations, FAQ, links (not the breadcrumb).
    const article = container.querySelector('main article')!;
    expect(words(article.textContent ?? '')).toBeGreaterThanOrEqual(400);
    expect(words(article.textContent ?? '')).toBeLessThanOrEqual(900);
  });

  it.each(GUIDES.map((g) => [g.path, g] as const))('%s uses the site vocabulary', (path, guide) => {
    const { container } = render(<GuidePage path={path} />);
    const text = container.querySelector('main')!.textContent ?? '';
    // The UK guide names "annual leave" once, as the UK word for PTO (a glossary alias).
    const allowed = guide.country === 'GB' ? ['annual leave'] : [];
    expect(findBannedVocabulary(text).filter((w) => !allowed.includes(w))).toEqual([]);
  });

  it('records a plan open with the event name only', () => {
    const spy = vi.fn();
    window.plausible = spy;
    window.history.replaceState(null, '', '/2027/10-pto-days');
    render(<GuidePage path="/2027/10-pto-days" />);
    const link = screen.getByRole('link', { name: /Open this plan in Timebower/ });
    link.addEventListener('click', (e) => e.preventDefault());
    fireEvent.click(link);
    expect(spy).toHaveBeenCalledWith('guide_plan_opened', { url: `${window.location.origin}/2027/10-pto-days` });
    window.history.replaceState(null, '', '/');
  });

  it('hydrates the prerendered markup without a mismatch', async () => {
    for (const guide of GUIDES) {
      const html = renderToString(<GuidePage path={guide.path} />);
      expect(html).toContain(guideFacts(guide).plans[0].href.replace(/&/g, '&amp;'));
      const host = document.createElement('div');
      host.innerHTML = html;
      document.body.appendChild(host);
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      const recoverable = vi.fn();
      let root!: ReturnType<typeof hydrateRoot>;
      await act(async () => { root = hydrateRoot(host, <GuidePage path={guide.path} />, { onRecoverableError: recoverable }); });
      expect(recoverable, guide.path).not.toHaveBeenCalled();
      expect(errors, guide.path).not.toHaveBeenCalled();
      act(() => root.unmount());
      host.remove();
      errors.mockRestore();
    }
  });

  it('shows a way back for an unknown path', () => {
    render(<GuidePage path="/2027/unknown" />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Guide not found');
  });
});
