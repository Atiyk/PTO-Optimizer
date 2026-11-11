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

const scenario = '/pto?c=US&s=2027-01-01&e=2027-01-04&b=1&rv=0&w=0&count=1';

beforeEach(() => {
  window.history.replaceState(null, '', scenario);
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

describe('planner result actions', () => {
  it('puts one set of request cards immediately after the result and exposes the PTO date', async () => {
    render(<App />);
    const summary = screen.getByRole('region', { name: 'Your plan' });
    await waitFor(() => expect(summary.getAttribute('data-plan-result')).toBe('ready'));

    const requests = screen.getByRole('region', { name: 'Requesting each break' });
    expect(summary.nextElementSibling?.contains(requests)).toBe(true);
    const [card] = within(requests).getAllByRole('listitem');
    expect(card.getAttribute('data-break-pto')).toBe('1');
    expect(within(card).getByText('1 working day: Mon Jan 4')).toBeTruthy();
    expect(within(card).getByRole('button', { name: 'Track this PTO request' })).toBeTruthy();
    expect(within(card).getByRole('button', { name: 'Export this break (.ics)' })).toBeTruthy();
    expect(within(summary).getByRole('link', { name: 'Export and share' }).getAttribute('href')).toBe('#take-it-heading');
  });

  it('opens the work week from the planning assumptions URL', async () => {
    window.history.replaceState(null, '', `${scenario}#planning-assumptions`);
    render(<App />);
    const workWeek = await screen.findByRole('heading', { name: 'Work week' });
    expect(document.activeElement).toBe(workWeek);
    expect(screen.getByRole('heading', { name: "My employer's holidays" })).toBeTruthy();
  });

  it('restores the tracked card state from the same browser without offering a duplicate', async () => {
    const first = render(<App />);
    const track = await screen.findByRole('button', { name: 'Track this PTO request' });
    const card = track.closest('li')!;
    const [start, end] = [card.getAttribute('data-break-start'), card.getAttribute('data-break-end')];
    fireEvent.click(track);
    // The break stays in the results as a committed entry, with its confirmation on the card.
    const cards = () => screen.getByRole('region', { name: 'Requesting each break' });
    const committed = await within(cards()).findByTestId('committed-entry');
    expect(committed.getAttribute('data-committed-start')).toBe(start);
    expect(committed.getAttribute('data-committed-end')).toBe(end);
    expect(document.activeElement).toBe(within(committed).getByRole('link', { name: 'See My PTO requests' }));
    expect(within(committed).getByText('Tracked · planned')).toBeTruthy();
    expect(within(committed).getByText('1 PTO day')).toBeTruthy();
    expect(within(committed).getByRole('status').textContent).toBe('PTO request tracked in this browser.');
    expect(within(committed).getByRole('link', { name: 'See My PTO requests' }).getAttribute('href')).toBe('#requests');
    first.unmount();
    render(<App />);
    // Tentative time off: already off and its PTO reserved once, so it is not recommended
    // or offered for tracking again, but it remains visible with its label.
    const summary = await screen.findByTestId('tracked-requests-summary');
    expect(summary.textContent).toBe('Includes 0 approved days off · 1 tentative, 1 reserved from the budget.');
    await waitFor(() => expect(screen.getByRole('region', { name: 'Your plan' }).getAttribute('data-plan-result')).not.toBe('pending'));
    const restored = within(cards()).getByTestId('committed-entry');
    expect(within(restored).getByText('Tracked · planned')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Track this PTO request' })).toBeNull();
    const tracker = screen.getByRole('region', { name: 'My PTO requests' });
    expect(within(tracker).getByRole<HTMLSelectElement>('combobox', { name: /^Status for request / }).value).toBe('planned');
    // Approving keeps it visible with the approved label and the same reserved budget.
    fireEvent.change(within(tracker).getByRole('combobox', { name: /^Status for request / }), { target: { value: 'approved' } });
    expect(within(within(cards()).getByTestId('committed-entry')).getByText('Approved')).toBeTruthy();
    expect(screen.getByTestId('tracked-requests-summary').textContent).toBe('Includes 1 approved day off · 0 tentative, 1 reserved from the budget.');
  });

  it('keeps new recommendations clear of a tracked break shown beside them', async () => {
    window.history.replaceState(null, '', '/pto?c=US&s=2027-01-01&e=2027-02-28&b=6&rv=0&w=0&count=2');
    localStorage.setItem('gapless.personal.requests.v1', JSON.stringify({ version: 1, requests: [{
      id: 'held', start: '2027-01-04', end: '2027-01-08', ptoDates: ['2027-01-04', '2027-01-05', '2027-01-06', '2027-01-07', '2027-01-08'], ptoDays: 5,
      status: 'requested', note: '', createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
    }] }));
    render(<App />);
    const summary = screen.getByRole('region', { name: 'Your plan' });
    await waitFor(() => expect(summary.getAttribute('data-plan-result')).toBe('ready'));
    const cards = screen.getByRole('region', { name: 'Requesting each break' });
    const committed = within(cards).getByTestId('committed-entry');
    expect(within(committed).getByText('Tracked · requested')).toBeTruthy();
    expect(within(committed).getByText('5 PTO days')).toBeTruthy();
    const recommended = cards.querySelectorAll('li[data-break-start]');
    expect(recommended.length).toBeGreaterThan(0);
    let spent = 0;
    for (const card of recommended) {
      const start = card.getAttribute('data-break-start')!;
      const end = card.getAttribute('data-break-end')!;
      expect(end < '2027-01-04' || start > '2027-01-08').toBe(true);
      spent += Number(card.getAttribute('data-break-pto'));
    }
    // 6 entered - 5 reserved once for the tentative request.
    expect(spent).toBeLessThanOrEqual(1);
  });

  it('saves a break as Considering and restores its saved state on a new visit', async () => {
    const first = render(<App />);
    const save = await screen.findByRole('button', { name: 'Save break' });
    fireEvent.click(save);
    const requests = screen.getByRole('region', { name: 'Requesting each break' });
    await within(requests).findByText('Saved', { exact: true });
    const tracker = screen.getByRole('region', { name: 'My PTO requests' });
    const status = within(tracker).getByRole<HTMLSelectElement>('combobox', { name: /^Status for request / });
    expect(status.value).toBe('considering');
    expect(within(tracker).getAllByRole('article')).toHaveLength(1);

    first.unmount();
    render(<App />);
    const restoredCards = screen.getByRole('region', { name: 'Requesting each break' });
    await within(restoredCards).findByText('Saved', { exact: true });
    expect(within(restoredCards).queryByRole('button', { name: 'Save break' })).toBeNull();
  });

  it('offers the same saved plan after reload from the saved plans anchor', async () => {
    const first = render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Save this plan' }));
    const saved = await screen.findByRole('list', { name: 'Saved plans' });
    expect(saved.closest('#saved-plans')).toBeTruthy();
    expect(within(saved).getByRole('button', { name: 'Restore' })).toBeTruthy();
    first.unmount();
    render(<App />);
    expect(await screen.findByRole('list', { name: 'Saved plans' })).toBeTruthy();
  });

  it('explains a link with no working days and keeps planning live on Monday to Friday (Issue 10)', async () => {
    window.history.replaceState(null, '', `${scenario}&ww=0000000`);
    render(<App />);
    const notice = screen.getByText(/This link’s work week had no working days/);
    expect(notice.getAttribute('role')).toBe('status');
    const summary = screen.getByRole('region', { name: 'Your plan' });
    await waitFor(() => expect(summary.getAttribute('data-plan-result')).toBe('ready'));
    expect(screen.queryByText('Choose at least one working day each week.')).toBeNull();
    await waitFor(() => expect(new URLSearchParams(window.location.search).has('ww')).toBe(false));
  });

  it('keeps save and public link controls for a settled plan with no PTO', async () => {
    window.history.replaceState(null, '', scenario.replace('b=1', 'b=0'));
    render(<App />);
    const save = await screen.findByRole<HTMLButtonElement>('button', { name: 'Save this plan' });
    expect(save.disabled).toBe(false);
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save break' })).toBeNull();
  });
});
