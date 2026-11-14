import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Holiday } from '@daysoff/engine/data/holidays';

vi.mock('./analytics', () => ({ track: vi.fn() }));

const HOLIDAYS: Holiday[] = [
  { date: '2026-11-26', nominalDate: '2026-11-26', name: 'Thanksgiving Day', countryCode: 'US', counties: null },
  { date: '2026-12-25', nominalDate: '2026-12-25', name: 'Christmas Day', countryCode: 'US', counties: null },
  { date: '2027-01-01', nominalDate: '2027-01-01', name: "New Year's Day", countryCode: 'US', counties: null },
  { date: '2027-01-18', nominalDate: '2027-01-18', name: 'Martin Luther King, Jr. Day', countryCode: 'US', counties: null },
];

vi.mock('../personal/consumerHolidays', async (original) => ({
  ...await original<typeof import('../personal/consumerHolidays')>(),
  getConsumerHolidaysWithStatus: vi.fn(async () => ({ holidays: HOLIDAYS, degraded: false })),
}));

const { Sabbatical } = await import('./Sabbatical');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-14T12:00:00'));
  window.history.replaceState(null, '', '/sabbatical/?c=US&len=4&s=2026-11-14&pto=5&unpaid=0');
  window.__PTO_PRELOADED_HOLIDAYS__ = { US: HOLIDAYS };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete window.__PTO_PRELOADED_HOLIDAYS__;
  delete window.__PTO_PRERENDERED_AT__;
});

describe('sabbatical summary (F18)', () => {
  it('counts and names every public holiday in the dates it shows, outside the "+" sum', () => {
    render(<Sabbatical />);
    const hero = screen.getByRole('heading', { level: 1 }).closest('header')!;
    const summary = within(hero).getByText(/Dec 24, 2026 – Jan 31, 2027/);
    expect(summary.textContent).toContain('4 weeks of sabbatical + 5 PTO days before.');
    expect(summary.textContent).not.toMatch(/holiday inside/);
    expect(within(hero).getByText("3 public holidays fall in this time away: Christmas Day, New Year's Day, and Martin Luther King, Jr. Day.")).toBeTruthy();
  });
});

describe('build-date note (F17)', () => {
  it('is rendered only when the prerender stamp is present (static HTML), not on a live page', () => {
    render(<Sabbatical />);
    expect(screen.queryByText(/recomputes live/)).toBeNull();
  });
});
