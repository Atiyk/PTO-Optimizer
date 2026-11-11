import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

/** Issue 17: production-like provider - holiday data exists through 2028; later years come
 * back empty from every source and are reported as uncovered. */
vi.mock('../personal/consumerHolidays', async (original) => ({
  ...await original<typeof import('../personal/consumerHolidays')>(),
  getConsumerHolidaysWithStatus: async (_country: string, start: string, end: string) => {
    const years: number[] = [];
    for (let y = Number(start.slice(0, 4)); y <= Number(end.slice(0, 4)); y++) years.push(y);
    return {
      holidays: start <= '2028-12-25' && end >= '2028-12-25'
        ? [{ date: '2028-12-25', nominalDate: '2028-12-25', name: 'Christmas Day', countryCode: 'US', counties: null }]
        : [],
      degraded: false,
      uncoveredYears: years.filter(y => y > 2028),
    };
  },
  getConsumerSubdivisionCandidates: async () => [],
}));

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

describe('planner holiday coverage beyond the bundled years', () => {
  it('says 2029 has no holiday data for a Dec 2028 - Jan 2029 plan', async () => {
    window.history.replaceState(null, '', '/pto?c=US&s=2028-12-18&e=2029-01-12&b=3&rv=0&w=0&count=1');
    render(<App />);
    expect(await screen.findByText(/Holiday data not available for 2029 — results assume no public holidays in 2029/)).toBeTruthy();
  });

  it('shows no coverage notice for a plan inside the bundled years', async () => {
    window.history.replaceState(null, '', '/pto?c=US&s=2027-01-01&e=2027-01-04&b=1&rv=0&w=0&count=1');
    render(<App />);
    const summary = screen.getByRole('region', { name: 'Your plan' });
    await waitFor(() => expect(summary.getAttribute('data-plan-result')).toBe('ready'));
    expect(screen.queryByText(/Holiday data not available/)).toBeNull();
  });
});
