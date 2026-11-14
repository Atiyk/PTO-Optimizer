import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

vi.mock('../personal/consumerHolidays', async (original) => ({
  ...await original<typeof import('../personal/consumerHolidays')>(),
  getConsumerHolidaysWithStatus: async () => ({
    holidays: [{ date: '2027-01-01', nominalDate: '2027-01-01', name: 'New Year’s Day', countryCode: 'US', counties: null }],
    degraded: false,
  }),
  getConsumerSubdivisionCandidates: async () => [],
}));

const scenario = '/pto?c=US&s=2027-01-01&e=2027-03-31&b=2&rv=0&w=0&count=2';
const originalMatchMedia = window.matchMedia;

/** A viewport `width` px wide with a mouse: min-width queries answer from it. */
function setViewport(width: number) {
  window.matchMedia = ((query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query);
    return {
      matches: min ? width >= Number(min[1]) : query.includes('hover'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    } as MediaQueryList;
  }) as typeof window.matchMedia;
}

const precedes = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

async function renderReady() {
  render(<App />);
  const summary = screen.getByRole('region', { name: 'Your plan' });
  await waitFor(() => expect(summary.getAttribute('data-plan-result')).toBe('ready'));
  const requests = screen.getByRole('region', { name: 'Requesting each break' });
  await waitFor(() => expect(requests.querySelector('li[data-break-start]')).toBeTruthy());
  return { summary, requests, firstCard: requests.querySelector('li[data-break-start]')! };
}

beforeEach(() => {
  window.history.replaceState(null, '', scenario);
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.matchMedia = originalMatchMedia;
  window.history.replaceState(null, '', '/');
});

describe('planner layout order (F02, F03)', () => {
  it('at desktop width puts the whole control rail, sliders included, before the first break card', async () => {
    setViewport(1440);
    const { firstCard } = await renderReady();
    const rail = screen.getByRole('complementary', { name: 'Plan settings' });
    const pto = within(rail).getByLabelText('PTO days available');
    expect(precedes(pto, firstCard)).toBe(true);
    const sliders = within(rail).getAllByRole('slider');
    expect(sliders.length).toBeGreaterThanOrEqual(3);
    for (const slider of sliders) expect(precedes(slider, firstCard)).toBe(true);
    expect(precedes(within(rail).getByRole('button', { name: 'More options' }), firstCard)).toBe(true);
    // Desktop keeps one save button (the headline's) and jumps to the rail.
    expect(screen.getAllByRole('button', { name: 'Save this plan' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Adjust plan' }).getAttribute('href')).toBe('#plan-controls');
  });

  it('on a phone keeps the inputs before the cards, the sliders after them, and save/export with the result', async () => {
    setViewport(375);
    const { summary, firstCard, requests } = await renderReady();
    const pto = screen.getByLabelText('PTO days available');
    expect(precedes(summary, pto)).toBe(true);
    expect(precedes(pto, firstCard)).toBe(true);
    const shape = document.getElementById('plan-shape')!;
    expect(within(shape).getByRole('slider', { name: /What matters more/ })).toBeTruthy();
    expect(precedes(requests, shape)).toBe(true);
    const jump = within(summary).getByRole('navigation', { name: 'On this page' });
    expect(within(jump).getByRole('link', { name: 'Adjust plan' }).getAttribute('href')).toBe('#plan-shape');
    expect(within(jump).getByRole('link', { name: 'Export and share' })).toBeTruthy();
    const save = within(jump).getByRole<HTMLButtonElement>('button', { name: 'Save this plan' });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    expect(await screen.findByRole('list', { name: 'Saved plans' })).toBeTruthy();
  });

  it('without a known width (the prerender) still puts the PTO input before the first break card', async () => {
    const { firstCard } = await renderReady();
    expect(precedes(screen.getByLabelText('PTO days available'), firstCard)).toBe(true);
  });
});

describe('planner request tracker link (F20)', () => {
  it('shows a short pointer to My PTO instead of the full tracker when nothing is tracked', async () => {
    await renderReady();
    const line = screen.getByRole('region', { name: 'My PTO requests' });
    expect(line.id).toBe('requests');
    expect(within(line).getByTestId('request-count').textContent).toMatch(/appear in My PTO/);
    expect(within(line).getByRole('link', { name: 'Open My PTO requests' }).getAttribute('href')).toBe('/policy#requests');
    expect(within(line).queryByRole('button')).toBeNull();
  });
});
