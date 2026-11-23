import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { PlanGuidePage } from './PlanGuidePage';
import { PLAN_GUIDES, planGuideFacts } from '../content/planGuides/planGuides2027';
import { findBannedVocabulary } from '../content/vocabulary';

afterEach(() => {
  cleanup();
  delete window.plausible;
  vi.restoreAllMocks();
});

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

describe('guide pages', () => {
  it.each(PLAN_GUIDES.map((g) => [g.path, g] as const))('%s shows its computed plan and links it to /pto', (path, guide) => {
    const { container } = render(<PlanGuidePage path={path} />);
    const f = planGuideFacts(guide);
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
    // Joined to the /guides section: breadcrumb, the index, the overview and related guides.
    for (const href of ['/guides', '/guides/maximize-pto-2027', '/guides/summer-2027-long-weekends', '/guides/thanksgiving-christmas-2027-pto', '/guides/how-to-ask-for-time-off']) {
      expect(container.querySelector(`a[href="${href}"]`), href).not.toBeNull();
    }
    expect(container.querySelector('a[href^="/2027"]')).toBeNull();
  });

  it.each(PLAN_GUIDES.map((g) => [g.path, g] as const))('%s has 400 to 900 words of copy', (path) => {
    const { container } = render(<PlanGuidePage path={path} />);
    // The article: answer, plans and tables, explanations, FAQ, links (not the breadcrumb).
    const article = container.querySelector('main article')!;
    expect(words(article.textContent ?? '')).toBeGreaterThanOrEqual(400);
    expect(words(article.textContent ?? '')).toBeLessThanOrEqual(900);
  });

  it.each(PLAN_GUIDES.map((g) => [g.path, g] as const))('%s uses the site vocabulary', (path, guide) => {
    const { container } = render(<PlanGuidePage path={path} />);
    const text = container.querySelector('main')!.textContent ?? '';
    // The UK guide names "annual leave" once, as the UK word for PTO (a glossary alias).
    const allowed = guide.country === 'GB' ? ['annual leave'] : [];
    expect(findBannedVocabulary(text).filter((w) => !allowed.includes(w))).toEqual([]);
  });

  it('records a plan open with the event name only', () => {
    const spy = vi.fn();
    window.plausible = spy;
    window.history.replaceState(null, '', '/guides/10-pto-days-2027');
    render(<PlanGuidePage path="/guides/10-pto-days-2027" />);
    const link = screen.getByRole('link', { name: /Open this plan in Timebower/ });
    link.addEventListener('click', (e) => e.preventDefault());
    fireEvent.click(link);
    expect(spy).toHaveBeenCalledWith('guide_plan_opened', { url: `${window.location.origin}/guides/10-pto-days-2027` });
    window.history.replaceState(null, '', '/');
  });

  it('hydrates the prerendered markup without a mismatch', async () => {
    for (const guide of PLAN_GUIDES) {
      const html = renderToString(<PlanGuidePage path={guide.path} />);
      expect(html).toContain(planGuideFacts(guide).plans[0].href.replace(/&/g, '&amp;'));
      const host = document.createElement('div');
      host.innerHTML = html;
      document.body.appendChild(host);
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      const recoverable = vi.fn();
      let root!: ReturnType<typeof hydrateRoot>;
      await act(async () => { root = hydrateRoot(host, <PlanGuidePage path={guide.path} />, { onRecoverableError: recoverable }); });
      expect(recoverable, guide.path).not.toHaveBeenCalled();
      expect(errors, guide.path).not.toHaveBeenCalled();
      act(() => root.unmount());
      host.remove();
      errors.mockRestore();
    }
  });

  it('shows a way back for an unknown path', () => {
    render(<PlanGuidePage path="/guides/unknown-2027" />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Guide not found');
  });
});
