import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import type { TimeOffPolicy } from '../policy/model';
import { ExpirationGuard, type GuardHolidayCalendar } from './ExpirationGuard';
import { downloadReminderICS } from './icsExport';

vi.mock('./icsExport', async (importOriginal) => ({ ...await importOriginal<typeof import('./icsExport')>(), downloadReminderICS: vi.fn() }));

const policy: TimeOffPolicy = {
  unit: 'days', hoursPerDay: 8, accrual: { kind: 'front-loaded', amount: 0, grantDate: '2026-01-01' },
  planYear: { kind: 'calendar' }, carryover: { mode: 'capped', cap: 5 }, negativeBalanceAllowance: 0,
  payoutOnLeaving: 'not-sure', currentBalance: 12, balanceAsOf: '2026-10-01', plannedDays: [],
};
const ready: GuardHolidayCalendar = { calendar: { workWeek: DEFAULT_WORK_WEEK, offDays: ['2026-11-26', '2026-12-25', '2027-01-01'] }, loading: false, degraded: false };
afterEach(() => { cleanup(); window.localStorage.clear(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('expiration guard interactions', () => {
  it('shows the real at-risk amount and counts each alert view once across rerenders', () => {
    const onViewed = vi.fn();
    const view = render(<ExpirationGuard policy={policy} holidayCalendar={ready} country="US" today="2026-11-02" onAlertViewed={onViewed} />);
    expect(screen.getByText('You could lose 7 days on Jan 1, 2027.')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Open this plan in the planner/ }).getAttribute('href')).toContain('e=2026-12-31');
    view.rerender(<ExpirationGuard policy={policy} holidayCalendar={ready} country="US" today="2026-11-02" onAlertViewed={onViewed} />);
    expect(onViewed).toHaveBeenCalledTimes(1);
  });
  it('supports opting out, restores the choice, and allows re-enabling alerts', () => {
    const view = render(<ExpirationGuard policy={policy} holidayCalendar={ready} country="US" today="2026-11-02" />);
    fireEvent.click(screen.getByLabelText('Show in-app alerts'));
    expect(screen.getByText('In-app expiration alerts are off in this browser.')).toBeTruthy();
    view.unmount();
    render(<ExpirationGuard policy={policy} holidayCalendar={ready} country="US" today="2026-11-02" />);
    expect((screen.getByLabelText('Show in-app alerts') as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByLabelText('Show in-app alerts'));
    expect(screen.getByText('You could lose 7 days on Jan 1, 2027.')).toBeTruthy();
  });
  it('exports selected calendar reminders and does not claim background delivery', () => {
    render(<ExpirationGuard policy={policy} holidayCalendar={ready} country="US" today="2026-11-02" />);
    fireEvent.click(screen.getByText('60 days before'));
    fireEvent.click(screen.getByRole('button', { name: 'Download calendar reminders' }));
    expect(downloadReminderICS).toHaveBeenCalledOnce();
    expect(vi.mocked(downloadReminderICS).mock.calls[0][0].map((r) => r.date)).toEqual(['2026-12-02', '2026-12-25']);
    // Each reminder names the rescue dates that are still ahead of it.
    expect(vi.mocked(downloadReminderICS).mock.calls[0][0][0].description).toMatch(/Suggested: take .*PTO day/);
    expect(vi.mocked(downloadReminderICS).mock.calls[0][0][0].description).toContain('does not update automatically');
    expect(screen.getByText(/your calendar app sends the alerts/)).toBeTruthy();
  });
  it('does not warn that full-carryover PTO expires at year-end', () => {
    render(<ExpirationGuard holidayCalendar={ready} policy={{ ...policy, carryover: { mode: 'all' } }} country="US" today="2026-11-02" />);
    expect(screen.getByText(/No upcoming forfeiture/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: /in the planner/ })).toBeNull();
  });
  it('connects actual next-reset carryover figures to the existing guard without duplicate projection math', () => {
    render(<ExpirationGuard policy={policy} holidayCalendar={ready} country="US" today="2026-11-02" />);
    fireEvent.click(screen.getByRole('button', { name: 'Review next policy reset' }));
    expect(screen.getByText('Jan 1, 2027')).toBeTruthy();
    expect(screen.getByText('Estimated carryover')).toBeTruthy();
    expect(screen.getByText('Potentially forfeited at reset')).toBeTruthy();
    // Both the carried amount and after-reset balance may correctly equal five.
    // Tie the assertions to their labels rather than assuming display values are unique.
    expect(screen.getByText('Potentially forfeited at reset').nextElementSibling?.textContent).toBe('7 days');
    expect(screen.getByText('Estimated carryover').nextElementSibling?.textContent).toBe('5 days');
    fireEvent.click(screen.getByRole('button', { name: 'Hide next policy reset' }));
    expect(screen.queryByText('Potentially forfeited at reset')).toBeNull();
  });
  it('does not invent forfeiture or an accrued cash balance for full carryover and unlimited PTO', () => {
    const view = render(<ExpirationGuard holidayCalendar={ready} policy={{ ...policy, carryover: { mode: 'all' } }} country="US" today="2026-11-02" />);
    fireEvent.click(screen.getByRole('button', { name: 'Review next policy reset' }));
    expect(screen.getByText('Potentially forfeited at reset')).toBeTruthy();
    expect(screen.getByText('Potentially forfeited at reset').nextElementSibling?.textContent).toBe('0 days');
    view.rerender(<ExpirationGuard holidayCalendar={ready} policy={{ ...policy, accrual: { kind: 'unlimited', expectedDaysPerYear: 20 } }} country="US" today="2026-11-02" />);
    expect(screen.getByText(/Unlimited PTO has no banked carryover/)).toBeTruthy();
  });
  it('connects actual next-reset carryover figures to the existing guard without duplicate projection math', () => {
    render(<ExpirationGuard policy={policy} country="US" today="2026-11-02" />);
    fireEvent.click(screen.getByRole('button', { name: 'Review next policy reset' }));
    expect(screen.getByText('2027-01-01')).toBeTruthy();
    expect(screen.getByText('Estimated carryover')).toBeTruthy();
    expect(screen.getByText('Potentially forfeited at reset')).toBeTruthy();
    // Both the carried amount and after-reset balance may correctly equal five.
    // Tie the assertions to their labels rather than assuming display values are unique.
    expect(screen.getByText('Potentially forfeited at reset').nextElementSibling?.textContent).toBe('7 days');
    expect(screen.getByText('Estimated carryover').nextElementSibling?.textContent).toBe('5 days');
    fireEvent.click(screen.getByRole('button', { name: 'Hide next policy reset' }));
    expect(screen.queryByText('Potentially forfeited at reset')).toBeNull();
  });
  it('does not invent forfeiture or an accrued cash balance for full carryover and unlimited PTO', () => {
    const view = render(<ExpirationGuard policy={{ ...policy, carryover: { mode: 'all' } }} country="US" today="2026-11-02" />);
    fireEvent.click(screen.getByRole('button', { name: 'Review next policy reset' }));
    expect(screen.getByText('Potentially forfeited at reset')).toBeTruthy();
    expect(screen.getByText('Potentially forfeited at reset').nextElementSibling?.textContent).toBe('0 days');
    view.rerender(<ExpirationGuard policy={{ ...policy, accrual: { kind: 'unlimited', expectedDaysPerYear: 20 } }} country="US" today="2026-11-02" />);
    expect(screen.getByText(/Unlimited PTO has no banked carryover/)).toBeTruthy();
  });
  it('connects actual next-reset carryover figures to the existing guard without duplicate projection math', () => {
    render(<ExpirationGuard policy={policy} country="US" today="2026-11-02" />);
    fireEvent.click(screen.getByRole('button', { name: 'Review next policy reset' }));
    expect(screen.getByText('2027-01-01')).toBeTruthy();
    expect(screen.getByText('Estimated carryover')).toBeTruthy();
    expect(screen.getByText('Potentially forfeited at reset')).toBeTruthy();
    // Both the carried amount and after-reset balance may correctly equal five.
    // Tie the assertions to their labels rather than assuming display values are unique.
    expect(screen.getByText('Potentially forfeited at reset').nextElementSibling?.textContent).toBe('7 days');
    expect(screen.getByText('Estimated carryover').nextElementSibling?.textContent).toBe('5 days');
    fireEvent.click(screen.getByRole('button', { name: 'Hide next policy reset' }));
    expect(screen.queryByText('Potentially forfeited at reset')).toBeNull();
  });
  it('does not invent forfeiture or an accrued cash balance for full carryover and unlimited PTO', () => {
    const view = render(<ExpirationGuard policy={{ ...policy, carryover: { mode: 'all' } }} country="US" today="2026-11-02" />);
    fireEvent.click(screen.getByRole('button', { name: 'Review next policy reset' }));
    expect(screen.getByText('Potentially forfeited at reset')).toBeTruthy();
    expect(screen.getByText('Potentially forfeited at reset').nextElementSibling?.textContent).toBe('0 days');
    view.rerender(<ExpirationGuard policy={{ ...policy, accrual: { kind: 'unlimited', expectedDaysPerYear: 20 } }} country="US" today="2026-11-02" />);
    expect(screen.getByText(/Unlimited PTO has no banked carryover/)).toBeTruthy();
  });
  it('shows validation when the carried portion exceeds the current balance', () => {
    render(<ExpirationGuard holidayCalendar={ready} policy={{ ...policy, currentCarriedBalance: 99, carryover: { mode: 'all', useByDate: '2027-03-31' } }} country="US" today="2026-11-02" />);
    expect(screen.getByText(/Enter valid policy values/)).toBeTruthy();
    expect(screen.queryByText(/No upcoming forfeiture/)).toBeNull();
  });
});

describe('expiration guard rescue plan', () => {
  const small: TimeOffPolicy = { ...policy, currentBalance: 8 };
  it('shows the ready-made plan inline with a link that opens it in the planner', () => {
    render(<ExpirationGuard policy={small} holidayCalendar={ready} country="US" today="2026-12-29" />);
    expect(screen.getByText('Take Dec 29–31 (3 PTO days) for 3 days off and keep all 3 days.')).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Open this plan in the planner →' });
    expect(link.getAttribute('href')).toContain('s=2026-12-29');
    expect(screen.queryByRole('button', { name: /generate|submit|calculate/i })).toBeNull();
  });
  it('lists breaks when the plan has several', () => {
    render(<ExpirationGuard policy={small} holidayCalendar={ready} country="US" today="2026-11-02" />);
    expect(screen.getByText(/Take 3 PTO days across 3 breaks before Dec 31, 2026 and keep all 3 days\./)).toBeTruthy();
    expect(screen.getAllByText(/PTO day for \d+ days off/)).toHaveLength(3);
  });
  it('says exactly how many days cannot be rescued and why', () => {
    render(<ExpirationGuard policy={small} holidayCalendar={ready} country="US" today="2026-12-31" />);
    expect(screen.getByText('Take Dec 31 (1 PTO day) for 1 day off and keep 1 of 3 days.')).toBeTruthy();
    expect(screen.getByText("2 days can't be rescued.")).toBeTruthy();
    expect(screen.getByText(/The deadline is too close: only 1 working day is left/)).toBeTruthy();
  });
  it('explains a waiting period with no plan at all', () => {
    render(<ExpirationGuard policy={{ ...small, balanceAsOf: '2026-11-02', waitingPeriodDays: 90 }} holidayCalendar={ready} country="US" today="2026-11-02" />);
    expect(screen.getByText("3 days can't be rescued.")).toBeTruthy();
    expect(screen.getByText(/waiting period ends Jan 31, 2027/)).toBeTruthy();
  });
  it('waits calmly while holidays load, then updates live', () => {
    const view = render(<ExpirationGuard policy={small} holidayCalendar={{ ...ready, loading: true }} country="US" today="2026-12-29" />);
    expect(screen.getByText(/Finding dates before Dec 31, 2026 that keep these days/)).toBeTruthy();
    expect(screen.getByText('You could lose 3 days on Jan 1, 2027.')).toBeTruthy();
    view.rerender(<ExpirationGuard policy={small} holidayCalendar={ready} country="US" today="2026-12-29" />);
    expect(screen.queryByText(/Finding dates/)).toBeNull();
    expect(screen.getByText(/keep all 3 days/)).toBeTruthy();
    view.rerender(<ExpirationGuard policy={{ ...small, currentBalance: 7 }} holidayCalendar={ready} country="US" today="2026-12-29" />);
    expect(screen.getByText(/keep both days\.$/)).toBeTruthy();
  });
  it('still offers a plan when holidays fail to load, and says so', () => {
    render(<ExpirationGuard policy={small} holidayCalendar={{ calendar: { workWeek: DEFAULT_WORK_WEEK, offDays: [] }, loading: false, degraded: true }} country="US" today="2026-12-29" />);
    expect(screen.getByText(/keep all 3 days/)).toBeTruthy();
    expect(screen.getByText(/Public holidays couldn't be loaded/)).toBeTruthy();
  });
  it('loads its own public holidays when the page passes none', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    render(<ExpirationGuard policy={small} country="US" today="2026-12-29" />);
    expect(screen.getByText(/Finding dates/)).toBeTruthy();
    expect(await screen.findByText(/Public holidays couldn't be loaded/)).toBeTruthy();
  });
  it('keeps dismiss working with a plan shown', () => {
    render(<ExpirationGuard policy={small} holidayCalendar={ready} country="US" today="2026-12-29" />);
    fireEvent.click(screen.getByRole('button', { name: /Dismiss/ }));
    expect(screen.queryByText(/keep all 3 days/)).toBeNull();
    expect(screen.getByText('All current alerts are dismissed.')).toBeTruthy();
  });
});
