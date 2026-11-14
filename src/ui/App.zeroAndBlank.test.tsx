import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Holiday } from '@daysoff/engine/data/holidays';
import { App } from './App';
import { holidayLongWeekends, remainingHolidays } from './landingData';
import { SHARE_LINK_SENTENCE } from './shareLinkCopy';

const h = (date: string, name: string): Holiday => ({ date, nominalDate: date, name, countryCode: 'US', counties: null });
// Jan 1 2027 is a Friday, MLK (Jan 18) and Memorial Day (May 31) are Mondays: 3 long weekends.
const HOLIDAYS = [h('2027-01-01', 'New Year’s Day'), h('2027-01-18', 'Martin Luther King, Jr. Day'), h('2027-05-31', 'Memorial Day')];

vi.mock('../personal/consumerHolidays', async (original) => ({
  ...await original<typeof import('../personal/consumerHolidays')>(),
  getConsumerHolidaysWithStatus: async () => ({ holidays: HOLIDAYS, degraded: false }),
  getConsumerSubdivisionCandidates: async () => [],
}));

const base = '/pto?c=US&s=2027-01-01&e=2027-06-30&rv=0&w=0';

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

async function ready() {
  const summary = screen.getByRole('region', { name: 'Your plan' });
  await waitFor(() => expect(summary.getAttribute('data-plan-result')).toBe('ready'));
  return summary;
}

describe('/pto with 0 PTO days (F05)', () => {
  it('says there are no PTO days to spend and gives the landing page’s free long weekends fact', async () => {
    window.history.replaceState(null, '', `${base}&b=0`);
    render(<App />);
    const summary = await ready();
    // Same helper and inputs the landing page uses, so both pages give the same count.
    expect(holidayLongWeekends(remainingHolidays('2026-12-31', '2027-06-30', HOLIDAYS))).toHaveLength(3);
    expect(within(summary).getByRole('heading', { level: 1 }).textContent).toBe('No PTO days to spend');
    expect(within(summary).getByText(/Public holidays alone give you 3 long weekends in these dates\. The next is Jan 1 – 3, 2027, for New Year’s Day\./)).toBeTruthy();
    expect(within(summary).queryByText(/0 days off/)).toBeNull();
    expect(within(summary).queryByText('Days off per PTO day')).toBeNull();
    expect(within(summary).queryByRole('button', { name: 'Save this plan' })).toBeNull();
    expect(document.body.textContent).not.toMatch(/once the plan is solved/);
  });
});

describe('/pto with the PTO field blank (F06)', () => {
  it('labels the plan still shown as an example for the last number', async () => {
    window.history.replaceState(null, '', `${base}&b=15`);
    render(<App />);
    const summary = await ready();
    expect(within(summary).queryByText(/Example for 15 PTO days/)).toBeNull();
    fireEvent.change(screen.getByLabelText('PTO days available'), { target: { value: '' } });
    expect(within(summary).getByText('Example for 15 PTO days. Enter yours to see your plan.')).toBeTruthy();
    // R2: an example plan is not the user's own, so it can't be saved.
    for (const save of screen.queryAllByRole<HTMLButtonElement>('button', { name: 'Save this plan' })) expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('PTO days available'), { target: { value: '12' } });
    expect(within(summary).queryByText(/Example for/)).toBeNull();
  });
});

describe('/pto first screen (N1, N3, N2, F13)', () => {
  it('names the longest break under the result and jumps to its card', async () => {
    window.history.replaceState(null, '', `${base}&b=3&count=2`);
    render(<App />);
    const summary = await ready();
    const link = within(summary).getByRole('link', { name: /^Longest: / });
    const target = document.querySelector(link.getAttribute('href')!) as HTMLElement;
    expect(target).not.toBeNull();
    expect(target.tabIndex).toBe(-1);
    const start = target.getAttribute('data-break-start');
    const totals = [...document.querySelectorAll('li[data-break-start]')].map((li) => li.getAttribute('data-break-start'));
    expect(totals).toContain(start);
    // R3: the line carries the days off, not only the PTO cost.
    expect(link.textContent).toMatch(/^Longest: .+ · \d+ days off for \d+ PTO days?$/);
  });

  it('gives the Adjust plan target a focus landing spot', async () => {
    window.history.replaceState(null, '', `${base}&b=3`);
    render(<App />);
    await ready();
    expect(document.getElementById('plan-shape')?.getAttribute('tabindex')).toBe('-1');
  });

  it('uses the one shared sentence about plan links', async () => {
    window.history.replaceState(null, '', `${base}&b=3`);
    render(<App />);
    await ready();
    expect(screen.getByText(SHARE_LINK_SENTENCE)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/result may differ/);
  });

  it('describes a planning style preset in the slider’s words, not its number', async () => {
    window.history.replaceState(null, '', `${base}&b=3`);
    render(<App />);
    await ready();
    fireEvent.change(screen.getByLabelText('Planning style'), { target: { value: 'balanced' } });
    // R1: one short line naming the style, what it favors and the break count.
    const helper = screen.getByText(/^Balanced: /);
    expect(helper.textContent).toBe('Balanced: mostly days off, 3 breaks. Moving a slider switches to Custom.');
    expect(helper.textContent!.split(/\s+/).length).toBeLessThanOrEqual(12);
  });
});
