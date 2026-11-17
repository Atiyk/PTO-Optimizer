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

  it('on a phone reads result, one primary action, breaks, PTO dates, then the adjustments', async () => {
    setViewport(375);
    const { summary, firstCard, requests } = await renderReady();
    const dates = screen.getByRole('region', { name: 'PTO dates to request' });
    const actions = screen.getByRole('region', { name: 'Use this plan' });
    const pto = screen.getByLabelText('PTO days available');
    // The primary action sits right under the headline, inside the first screen.
    expect(precedes(screen.getByRole('heading', { level: 1 }), actions)).toBe(true);
    expect(precedes(actions, firstCard)).toBe(true);
    expect(precedes(firstCard, dates)).toBe(true);
    expect(precedes(dates, pto)).toBe(true);
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

  it('when both saved-plan slots are full, guides users to removal instead of silently downloading', async () => {
    setViewport(375);
    await renderReady();
    fireEvent.click(screen.getByRole('button', { name: 'Keep this plan' }));
    await waitFor(() => expect(screen.getByText('1 of 2 plans saved on this device.')).toBeTruthy());
    const balance = screen.getByLabelText('PTO days available');
    fireEvent.change(balance, { target: { value: '3' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Keep this plan' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Keep this plan' }));
    await waitFor(() => expect(screen.getByText('2 of 2 plans saved on this device.')).toBeTruthy());
    fireEvent.change(balance, { target: { value: '4' } });
    const manage = await screen.findByRole('button', { name: 'Manage saved plans' });
    expect(screen.getByText('Two plans saved. Remove one before keeping this plan.')).toBeTruthy();
    fireEvent.click(manage);
    const remove = screen.getByRole('button', { name: 'Remove saved plan 1' });
    expect(document.activeElement).toBe(remove);
    fireEvent.click(remove);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Keep this plan' })).toBeTruthy());
  });

  it('without a known width (the prerender) uses the phone order: the primary action, then breaks, then the inputs', async () => {
    const { firstCard } = await renderReady();
    const actions = screen.getByRole('region', { name: 'Use this plan' });
    expect(precedes(actions, firstCard)).toBe(true);
    expect(precedes(firstCard, screen.getByLabelText('PTO days available'))).toBe(true);
  });

  it('on a phone opens "More" for someone arriving with a partner link, so the joint dates show', async () => {
    setViewport(375);
    window.history.replaceState(null, '', `${scenario}&pp=1:c:20270215~20270219:-`);
    await renderReady();
    const more = document.querySelector('details#more-actions')!;
    await waitFor(() => expect(more.hasAttribute('open')).toBe(true));
    expect(within(more as HTMLElement).getByRole('region', { name: 'Partner vacation planner' })).toBeTruthy();
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
    // Phones build the month grids only once they are opened.
    expect(document.getElementById('day-2027-03-10')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show month details' }));
    await waitFor(() => expect(document.getElementById('day-2027-03-10')).toBeTruthy());
    expect(document.getElementById('day-2027-03-10')!.closest('[data-collapsed-month="true"]')).toBeNull();
    expect(screen.getByRole('button', { name: /Show all \d+ months/ })).toBeTruthy();
  });
});

