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
    const goals = within(rail).getByRole('group', { name: 'What do you want from your PTO?' });
    expect(precedes(goals, firstCard)).toBe(true);
    const more = within(rail).getByRole('button', { name: 'More options' });
    expect(precedes(more, firstCard)).toBe(true);
    // The two fine-tuning sliders live under More options, still in the rail.
    fireEvent.click(more);
    const sliders = within(rail).getAllByRole('slider');
    expect(sliders.length).toBeGreaterThanOrEqual(2);
    for (const slider of sliders) expect(precedes(slider, firstCard)).toBe(true);
    // Desktop keeps one save button (the visual primary beside the jump links) and jumps to the rail.
    expect(screen.getAllByRole('button', { name: 'Keep this plan' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Save this plan' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Keep this plan' }).className).toMatch(/bg-accent/);
    expect(screen.getByRole('link', { name: 'Adjust plan' }).getAttribute('href')).toBe('#plan-controls');
    // Export keeps its own section on a desktop, with every action.
    expect(screen.getByRole('heading', { name: 'Take it with you' })).toBeTruthy();
  });

  it('on a phone reads result, breaks, PTO dates, one primary action, then the adjustments', async () => {
    setViewport(375);
    const { summary, firstCard, requests } = await renderReady();
    const dates = screen.getByRole('region', { name: 'PTO dates to request' });
    const actions = screen.getByRole('region', { name: 'Use this plan' });
    const pto = screen.getByLabelText('PTO days available');
    expect(precedes(summary, firstCard)).toBe(true);
    expect(precedes(firstCard, dates)).toBe(true);
    expect(precedes(dates, actions)).toBe(true);
    expect(precedes(actions, pto)).toBe(true);
    const shape = document.getElementById('plan-shape')!;
    expect(within(shape).getByRole('group', { name: 'What do you want from your PTO?' })).toBeTruthy();
    expect(precedes(requests, shape)).toBe(true);
    // One primary action, not four equal buttons; everything else sits in "More".
    expect(within(summary).queryByRole('navigation', { name: 'On this page' })).toBeNull();
    const primary = within(actions).getAllByRole<HTMLButtonElement>('button').filter((b) => b.hasAttribute('data-primary-action'));
    expect(primary).toHaveLength(1);
    expect(primary[0].textContent).toBe('Keep this plan');
    const more = actions.querySelector('details#more-actions')!;
    expect(more.hasAttribute('open')).toBe(false);
    for (const name of ['Download once (.ics)', 'Copy plan as image', 'Copy plan link', 'Plan with a partner']) {
      expect(within(more as HTMLElement).getByRole('button', { name })).toBeTruthy();
    }
    expect(primary[0].disabled).toBe(false);
    fireEvent.click(primary[0]);
    expect(await screen.findByRole('list', { name: 'Saved plans' })).toBeTruthy();
    // Kept: the save confirmation (Add to calendar, Back up) takes the button's place.
    expect(within(actions).getByTestId('save-confirmation')).toBeTruthy();
    expect(within(actions).getByRole('button', { name: 'Add to calendar' })).toBeTruthy();
    expect(actions.querySelector('[data-primary-action]')).toBeNull();
  });

  it('without a known width (the prerender) uses the phone order: breaks, then the primary action, then the inputs', async () => {
    const { firstCard } = await renderReady();
    const actions = screen.getByRole('region', { name: 'Use this plan' });
    expect(precedes(firstCard, actions)).toBe(true);
    expect(precedes(actions, screen.getByLabelText('PTO days available'))).toBe(true);
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

describe('phone calendar keeps the months the person changed (F11)', () => {
  it('keeps a month with a day they cannot take off in view, and collapses an untouched one', async () => {
    setViewport(375);
    window.history.replaceState(null, '', `${scenario}&bo=2027-03-10`);
    await renderReady();
    await waitFor(() => expect(document.getElementById('day-2027-03-10')).toBeTruthy());
    expect(document.getElementById('day-2027-03-10')!.closest('[data-collapsed-month="true"]')).toBeNull();
    expect(screen.getByRole('button', { name: /Show all \d+ months/ })).toBeTruthy();
  });
});

