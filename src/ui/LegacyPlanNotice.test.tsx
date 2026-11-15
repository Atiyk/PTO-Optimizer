import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { LegacyPlanNotice, isLegacyPlanSearch, todaysPlanHref } from './LegacyPlanNotice';
import { FRESH_VISIT_RESERVE_DAYS } from './urlState';

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

const LEGACY = '?c=GB&sd=GB-SCT&b=18&s=2027-01-01&e=2027-12-31&w=40&count=5&ac=1&am=2';

describe('LegacyPlanNotice', () => {
  it('tells a legacy link apart from version-2 links and fresh visits', () => {
    expect(isLegacyPlanSearch(LEGACY)).toBe(true);
    expect(isLegacyPlanSearch('?c=US&b=15&s=2027-01-01&e=2027-12-31&pv=2&ps=balanced')).toBe(false);
    expect(isLegacyPlanSearch('')).toBe(false);
    expect(isLegacyPlanSearch('?c=US')).toBe(false);
  });

  it('links to the same country, region, budget and range with fresh-visit defaults only', () => {
    const href = new URL(todaysPlanHref(LEGACY, '/pto'), 'https://x.test');
    expect(href.pathname).toBe('/pto');
    expect(Object.fromEntries(href.searchParams)).toEqual({
      c: 'GB', sd: 'GB-SCT', b: '18', s: '2027-01-01', e: '2027-12-31',
      rv: String(FRESH_VISIT_RESERVE_DAYS), pv: '2', ps: 'balanced', mb: '3', w: '30', count: '3',
    });
    expect(todaysPlanHref('?b=5', 'javascript:alert(1)')).toMatch(/^\/pto\?/);
  });

  it('shows the quiet notice for a legacy arrival, reading the address bar itself', () => {
    window.history.replaceState(null, '', `/uk${LEGACY}`);
    render(<LegacyPlanNotice />);
    expect(screen.getByTestId('legacy-plan-notice').textContent).toBe('This plan was made with an older version of Timebower. See today’s recommended plan');
    const link = screen.getByRole('link', { name: 'See today’s recommended plan' });
    expect(link.getAttribute('href')).toMatch(/^\/uk\?c=GB&sd=GB-SCT&b=18&s=2027-01-01&e=2027-12-31&rv=\d+&pv=2&ps=balanced/);
    expect(document.querySelector('button, form')).toBeNull();
  });

  it('renders nothing for version-2 links, fresh visits and the static prerender', () => {
    render(<LegacyPlanNotice search="?c=US&b=15&pv=2&ps=balanced" />);
    expect(screen.queryByTestId('legacy-plan-notice')).toBeNull();
    cleanup();
    render(<LegacyPlanNotice search="" />);
    expect(screen.queryByTestId('legacy-plan-notice')).toBeNull();
    window.history.replaceState(null, '', `/pto${LEGACY}`);
    expect(renderToString(<LegacyPlanNotice />)).toBe('');
  });
});
