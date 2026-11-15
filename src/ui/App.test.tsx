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
  it('puts the plan inputs, then one set of request cards, right after the result', async () => {
    render(<App />);
    const summary = screen.getByRole('region', { name: 'Your plan' });
    await waitFor(() => expect(summary.getAttribute('data-plan-result')).toBe('ready'));

    // Phones (and the prerender): the break cards come straight after the result, the core
    // inputs right after the cards and their primary action.
    const settings = screen.getByRole('complementary', { name: 'Plan settings' });
    expect(within(settings).getByLabelText('PTO days available')).toBeTruthy();
    const requests = screen.getByRole('region', { name: 'Requesting each break' });
    expect(summary.nextElementSibling?.contains(requests)).toBe(true);
    expect(summary.nextElementSibling?.nextElementSibling).toBe(settings);
    const [card] = within(requests).getAllByRole('listitem');
    expect(card.getAttribute('data-break-pto')).toBe('1');
    expect(within(card).getByText('1 working day: Mon Jan 4')).toBeTruthy();
    // F11: the first card's request steps start collapsed like every other card.
    expect(within(card).queryByRole('button', { name: 'Mark requested' })).toBeNull();
    expect(within(card).queryByRole('button', { name: 'Download calendar file (.ics)' })).toBeNull();
    fireEvent.click(within(card).getByRole('button', { name: /Request this time off/ }));
    expect(within(card).getByRole('button', { name: 'Copy request' })).toBeTruthy();
    expect(within(card).getByRole('button', { name: 'Mark requested' })).toBeTruthy();
    expect(within(card).getByRole('button', { name: 'Download calendar file (.ics)' })).toBeTruthy();
    // Export and share live in "More", right under the one primary action.
    const more = document.getElementById('more-actions')!;
    expect(within(more).getByRole('button', { name: 'Download once (.ics)' }).id).toBe('shortcut-download-ics');
  });

  it('opens the work week from the planning assumptions URL', async () => {
    window.history.replaceState(null, '', `${scenario}#planning-assumptions`);
    render(<App />);
    const workWeek = await screen.findByRole('heading', { name: 'Work week' });
    expect(document.activeElement).toBe(workWeek);
    expect(screen.getByRole('heading', { name: "My employer's holidays" })).toBeTruthy();
  });

  it('marks a break requested once, keeps it visible on return, and never offers a duplicate', async () => {
    const first = render(<App />);
    const toggle = await screen.findByRole('button', { name: /Request this time off/ });
    const card = toggle.closest('li')!;
    const [start, end] = [card.getAttribute('data-break-start'), card.getAttribute('data-break-end')];
    fireEvent.click(toggle);
    fireEvent.click(within(card).getByRole('button', { name: 'Mark requested' }));
    // The break stays in the results as a requested entry, with focus and its confirmation on it.
    const cards = () => screen.getByRole('region', { name: 'Requesting each break' });
    const committed = await within(cards()).findByTestId('committed-entry');
    expect(committed.getAttribute('data-committed-start')).toBe(start);
    expect(committed.getAttribute('data-committed-end')).toBe(end);
    expect(committed.getAttribute('data-committed-status')).toBe('requested');
    expect(document.activeElement).toBe(within(committed).getByRole('heading', { level: 3 }));
    expect(committed.querySelector('[data-committed-label]')?.textContent).toBe('Requested');
    expect(within(committed).getByText('1 PTO day')).toBeTruthy();
    expect(within(committed).getByRole('status').textContent).toBe('Marked requested in this browser. When your manager answers, mark it approved here or in My PTO.');
    expect(within(committed).getByRole('link', { name: 'See My PTO requests' }).getAttribute('href')).toBe('#requests');
    expect(within(committed).queryByText(/^Approved$/)).toBeNull();
    first.unmount();
    render(<App />);
    // Tentative time off: already off and its PTO reserved once, so it is not recommended
    // or offered for requesting again, but it remains visible with its label.
    const summary = await screen.findByTestId('tracked-requests-summary');
    expect(summary.textContent).toBe('Includes 0 approved days off · 1 tentative, 1 reserved from the budget.');
    await waitFor(() => expect(screen.getByRole('region', { name: 'Your plan' }).getAttribute('data-plan-result')).not.toBe('pending'));
    const restored = within(cards()).getByTestId('committed-entry');
    expect(restored.querySelector('[data-committed-label]')?.textContent).toBe('Requested');
    expect(screen.queryByRole('button', { name: 'Mark requested' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Request this time off/ })).toBeNull();
    // The planner links to the tracker in My PTO instead of repeating it (F20).
    const requestsLine = screen.getByRole('region', { name: 'My PTO requests' });
    expect(within(requestsLine).getByTestId('request-count').textContent).toBe('My PTO has 1 request from this browser.');
    expect(within(requestsLine).getByRole('link', { name: 'Manage requests in My PTO' }).getAttribute('href')).toBe('/policy#requests');
    expect(within(requestsLine).queryByRole('combobox')).toBeNull();
    const stored = JSON.parse(localStorage.getItem('gapless.personal.requests.v1')!);
    expect(stored.requests).toHaveLength(1);
    expect(stored.requests[0].status).toBe('requested');
    expect(stored.requests[0].ptoDates).toEqual(['2027-01-04']);
    // Marking it approved from the card updates the same record: still one request.
    fireEvent.click(within(restored).getByRole('button', { name: 'Mark approved' }));
    await waitFor(() => expect(within(cards()).getByTestId('committed-entry').querySelector('[data-committed-label]')?.textContent).toBe('Approved'));
    const approved = JSON.parse(localStorage.getItem('gapless.personal.requests.v1')!);
    expect(approved.requests).toHaveLength(1);
    expect(approved.requests[0].status).toBe('approved');
    expect(approved.requests[0].id).toBe(stored.requests[0].id);
    cleanup();
    render(<App />);
    await waitFor(() => expect(within(cards()).getByTestId('committed-entry').querySelector('[data-committed-label]')?.textContent).toBe('Approved'));
    expect(screen.getByTestId('tracked-requests-summary').textContent).toBe('Includes 1 approved day off · 0 tentative, 1 reserved from the budget.');
  });

  it('turns a saved break into a request without a second record', async () => {
    render(<App />);
    const save = await screen.findByRole('button', { name: 'Save break' });
    const card = save.closest('li')!;
    fireEvent.click(save);
    await waitFor(() => expect(card.querySelector('[data-break-record]')?.textContent).toBe('Saved'));
    // Saving an idea does not re-plan: the same card stays mounted (a remount reset the phone
    // strip to the first card and dropped focus).
    expect(card.isConnected).toBe(true);
    expect(screen.getByRole('region', { name: 'Your plan' }).getAttribute('data-plan-result')).toBe('ready');
    const saved = JSON.parse(localStorage.getItem('gapless.personal.requests.v1')!);
    expect(saved.requests).toHaveLength(1);
    expect(saved.requests[0].status).toBe('considering');
    fireEvent.click(within(card).getByRole('button', { name: /Request this time off/ }));
    fireEvent.click(within(card).getByRole('button', { name: 'Mark requested' }));
    const cards = screen.getByRole('region', { name: 'Requesting each break' });
    await waitFor(() => expect(within(cards).getByTestId('committed-entry').getAttribute('data-committed-status')).toBe('requested'));
    const after = JSON.parse(localStorage.getItem('gapless.personal.requests.v1')!);
    expect(after.requests).toHaveLength(1);
    expect(after.requests[0].id).toBe(saved.requests[0].id);
    expect(after.requests[0].status).toBe('requested');
  });

  it('lets a declined request be asked again on the same record', async () => {
    localStorage.setItem('gapless.personal.requests.v1', JSON.stringify({ version: 1, requests: [{
      id: 'declined', start: '2027-01-01', end: '2027-01-04', ptoDates: ['2027-01-04'], ptoDays: 1,
      status: 'rejected', note: 'private', createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
    }] }));
    render(<App />);
    const toggle = await screen.findByRole('button', { name: /Request this time off/ });
    const card = toggle.closest('li')!;
    expect([card.getAttribute('data-break-start'), card.getAttribute('data-break-end')]).toEqual(['2027-01-01', '2027-01-04']);
    expect(card.querySelector('[data-break-record]')?.textContent).toBe('Declined in My PTO');
    fireEvent.click(toggle);
    fireEvent.click(within(card).getByRole('button', { name: 'Mark requested' }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem('gapless.personal.requests.v1')!).requests[0].status).toBe('requested'));
    const stored = JSON.parse(localStorage.getItem('gapless.personal.requests.v1')!);
    expect(stored.requests).toHaveLength(1);
    expect(stored.requests[0].note).toBe('private');
  });

  it('reserves an hourly half day from the budget once and labels it in hours and days', async () => {
    window.history.replaceState(null, '', '/pto?c=US&s=2027-01-01&e=2027-02-28&b=6&rv=0&w=0&count=2');
    localStorage.setItem('gapless.personal.workspace.v1', JSON.stringify({ version: 1, balanceIncludesApprovedLeave: false, workdaySchedule: { shiftMinutes: [480, 480, 480, 480, 480, 0, 0] } }));
    localStorage.setItem('gapless.personal.requests.v1', JSON.stringify({ version: 1, requests: [{
      id: 'half', start: '2027-01-12', end: '2027-01-12', ptoDates: ['2027-01-12'], ptoDays: 1, ptoMinutes: { '2027-01-12': 240 }, partialMinutes: 240,
      status: 'approved', note: '', createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
    }] }));
    render(<App />);
    const summary = await screen.findByTestId('tracked-requests-summary');
    expect(summary.textContent).toBe('Includes 0.5 approved day off · 0 tentative, 1 reserved from the budget.');
    expect(screen.getByTestId('tracked-hourly-note').textContent).toBe('Hourly requests count as a share of that day\'s shift: 0.5 day owed. The planner budgets whole days, so it reserves 1.');
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
    expect(committed.querySelector('[data-committed-label]')?.textContent).toBe('Requested');
    expect(within(committed).getByRole('button', { name: 'Mark approved' })).toBeTruthy();
    expect(within(committed).getByText('5 PTO days')).toBeTruthy();
    const recommended = cards.querySelectorAll('li[data-break-start]:not([data-testid="committed-entry"])');
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

  it('shares a committed break with a partner as the one included break, without private notes', async () => {
    window.history.replaceState(null, '', '/pto?c=US&s=2027-01-01&e=2027-02-28&b=6&rv=0&w=0&count=2');
    localStorage.setItem('gapless.personal.requests.v1', JSON.stringify({ version: 1, requests: [{
      id: 'trip', start: '2027-01-02', end: '2027-01-10', ptoDates: ['2027-01-04', '2027-01-05', '2027-01-06', '2027-01-07', '2027-01-08'], ptoDays: 5,
      status: 'approved', note: 'qa-private-note', createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
    }] }));
    render(<App />);
    await waitFor(() => expect(screen.getByRole('region', { name: 'Your plan' }).getAttribute('data-plan-result')).toBe('ready'));
    const cards = screen.getByRole('region', { name: 'Requesting each break' });
    // The committed entry carries the same break attributes as a recommendation and comes first.
    const first = cards.querySelector('li[data-break-start][data-break-end][data-break-pto]')!;
    expect(first.getAttribute('data-testid')).toBe('committed-entry');
    expect([first.getAttribute('data-break-start'), first.getAttribute('data-break-end'), first.getAttribute('data-break-pto')]).toEqual(['2027-01-02', '2027-01-10', '5']);
    fireEvent.click(within(first as HTMLElement).getByRole('button', { name: 'Plan this break with a partner' }));
    const partner = await screen.findByRole('region', { name: 'Partner vacation planner' });
    const checked = [...partner.querySelectorAll<HTMLInputElement>('fieldset input:checked')];
    expect(checked).toHaveLength(1);
    expect(checked[0].closest('label')?.textContent).toMatch(/Jan 2/);
    expect(partner.textContent).not.toContain('qa-private-note');
    // The tab-local reserve toggle says it applies to this plan only, not to My PTO.
    const toggle = screen.getByRole<HTMLInputElement>('checkbox', { name: /Reserve 5 approved PTO days from the entered budget/ });
    expect(toggle.closest('label')?.textContent).toMatch(/for this plan only/i);
    expect(toggle.checked).toBe(true);
  });

  it('saves a break as Considering and restores its saved state on a new visit', async () => {
    const first = render(<App />);
    const save = await screen.findByRole('button', { name: 'Save break' });
    fireEvent.click(save);
    const requests = screen.getByRole('region', { name: 'Requesting each break' });
    await within(requests).findByText('Saved', { exact: true });
    const stored = JSON.parse(localStorage.getItem('gapless.personal.requests.v1')!);
    expect(stored.requests.map((request: { status: string }) => request.status)).toEqual(['considering']);
    expect(screen.getByTestId('request-count').textContent).toBe('My PTO has 1 request from this browser.');

    first.unmount();
    render(<App />);
    const restoredCards = screen.getByRole('region', { name: 'Requesting each break' });
    await within(restoredCards).findByText('Saved', { exact: true });
    expect(within(restoredCards).queryByRole('button', { name: 'Save break' })).toBeNull();
  });

  it('offers the same saved plan after reload from the saved plans anchor', async () => {
    const first = render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Keep this plan' }));
    const saved = await screen.findByRole('list', { name: 'Saved plans' });
    expect(saved.closest('#saved-plans')).toBeTruthy();
    expect(within(saved).getByRole('button', { name: 'Open saved plan' })).toBeTruthy();
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

  it('offers no Save for a 0-PTO plan (F05) but keeps the public link control', async () => {
    window.history.replaceState(null, '', scenario.replace('b=1', 'b=0'));
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'No PTO days to spend' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save this plan' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Keep this plan' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Copy plan link' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save break' })).toBeNull();
  });
});
