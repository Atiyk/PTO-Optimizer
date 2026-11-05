import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { TimeOffPolicy } from '../policy/model';
import { ExpirationGuard } from './ExpirationGuard';
import { downloadReminderICS } from './icsExport';

vi.mock('./icsExport', async (importOriginal) => ({ ...await importOriginal<typeof import('./icsExport')>(), downloadReminderICS: vi.fn() }));

const policy: TimeOffPolicy = {
  unit: 'days', hoursPerDay: 8, accrual: { kind: 'front-loaded', amount: 0, grantDate: '2026-01-01' },
  planYear: { kind: 'calendar' }, carryover: { mode: 'capped', cap: 5 }, negativeBalanceAllowance: 0,
  payoutOnLeaving: 'not-sure', currentBalance: 12, balanceAsOf: '2026-10-01', plannedDays: [],
};
afterEach(() => { cleanup(); window.localStorage.clear(); vi.clearAllMocks(); });

describe('expiration guard interactions', () => {
  it('shows the real at-risk amount and counts each alert view once across rerenders', () => {
    const onViewed = vi.fn();
    const view = render(<ExpirationGuard policy={policy} country="US" today="2026-11-02" onAlertViewed={onViewed} />);
    expect(screen.getByText('You could lose 7 days on Jan 1, 2027.')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Find the best way/ }).getAttribute('href')).toContain('e=2026-12-31');
    view.rerender(<ExpirationGuard policy={policy} country="US" today="2026-11-02" onAlertViewed={onViewed} />);
    expect(onViewed).toHaveBeenCalledTimes(1);
  });
  it('supports opting out, restores the choice, and allows re-enabling alerts', () => {
    const view = render(<ExpirationGuard policy={policy} country="US" today="2026-11-02" />);
    fireEvent.click(screen.getByLabelText('Show in-app alerts'));
    expect(screen.getByText('In-app expiration alerts are off in this browser.')).toBeTruthy();
    view.unmount();
    render(<ExpirationGuard policy={policy} country="US" today="2026-11-02" />);
    expect((screen.getByLabelText('Show in-app alerts') as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByLabelText('Show in-app alerts'));
    expect(screen.getByText('You could lose 7 days on Jan 1, 2027.')).toBeTruthy();
  });
  it('exports selected calendar reminders and does not claim background delivery', () => {
    render(<ExpirationGuard policy={policy} country="US" today="2026-11-02" />);
    fireEvent.click(screen.getByText('60 days before'));
    fireEvent.click(screen.getByRole('button', { name: 'Download calendar reminders' }));
    expect(downloadReminderICS).toHaveBeenCalledOnce();
    expect(vi.mocked(downloadReminderICS).mock.calls[0][0].map((r) => r.date)).toEqual(['2026-12-02', '2026-12-25']);
    expect(screen.getByText(/does not send scheduled email or push/)).toBeTruthy();
  });
  it('does not warn that full-carryover PTO expires at year-end', () => {
    render(<ExpirationGuard policy={{ ...policy, carryover: { mode: 'all' } }} country="US" today="2026-11-02" />);
    expect(screen.getByText(/No upcoming forfeiture/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Find the best way/ })).toBeNull();
  });
  it('connects actual next-reset carryover figures to the existing guard without duplicate projection math', () => {
    render(<ExpirationGuard policy={policy} country="US" today="2026-11-02" />);
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
    const view = render(<ExpirationGuard policy={{ ...policy, carryover: { mode: 'all' } }} country="US" today="2026-11-02" />);
    fireEvent.click(screen.getByRole('button', { name: 'Review next policy reset' }));
    expect(screen.getByText('Potentially forfeited at reset')).toBeTruthy();
    expect(screen.getByText('Potentially forfeited at reset').nextElementSibling?.textContent).toBe('0 days');
    view.rerender(<ExpirationGuard policy={{ ...policy, accrual: { kind: 'unlimited', expectedDaysPerYear: 20 } }} country="US" today="2026-11-02" />);
    expect(screen.getByText(/Unlimited PTO has no banked carryover/)).toBeTruthy();
  });
  it('shows validation when the carried portion exceeds the current balance', () => {
    render(<ExpirationGuard policy={{ ...policy, currentCarriedBalance: 99, carryover: { mode: 'all', useByDate: '2027-03-31' } }} country="US" today="2026-11-02" />);
    expect(screen.getByText(/Enter valid policy values/)).toBeTruthy();
    expect(screen.queryByText(/No upcoming forfeiture/)).toBeNull();
  });
});
