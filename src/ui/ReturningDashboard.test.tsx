import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import { createPtoRequest, readRequestLedger, writeRequestLedger } from '../personal/requestLedger';
import { RETENTION_STORAGE_KEY, readRetentionStatus } from '../personal/retentionStatus';
import { PINNED_PLANS_STORAGE_KEY } from './pinnedPlanStore';
import { ReturningDashboard } from './ReturningDashboard';
import type { PlanSnapshot } from './useAppState';

const TODAY = '2026-11-14';
const CAL = { workWeek: DEFAULT_WORK_WEEK, offDays: [], rangeStart: '2026-01-01', rangeEnd: '2028-12-31' };
const PLAN: PlanSnapshot = {
  country: 'US', subdivision: undefined, planningVersion: 2, planningStyle: 'balanced', minimumBreakDays: 3,
  employerCalendar: { version: 1, country: 'US', excluded: [], custom: [] },
  rangeStart: '2026-11-14', rangeEnd: '2027-11-13', budget: 15, w: 30,
  letSolverDecide: true, manualBreakCount: 3, weekStartOverride: 'auto', accrualEnabled: false,
  accrualPerMonth: 1.25, expiryEnabled: false, expiryDate: '', carryoverCap: 0,
  overlapDays: [], blackouts: [], workWeek: DEFAULT_WORK_WEEK, forced: {}, altFridayEnabled: false, altFridayStart: '',
  reserveDays: 0, applyTrackedRequests: false, reserveApprovedPto: false, unlimitedPto: false, noticePeriodDays: 14,
  peakCapEnabled: false, peakCapStart: '', peakCapEnd: '', peakCapMaxDays: 5,
  summary: { budgetSpent: 9, totalDaysOff: 16, breakCountActual: 1, travelPercentile: null },
  breaks: [{ start: '2027-03-20', end: '2027-04-04', totalDaysOff: 16, ptoCost: 9, ptoDates: ['2027-03-22', '2027-03-23', '2027-03-24', '2027-03-25', '2027-03-26', '2027-03-29', '2027-03-30', '2027-03-31', '2027-04-01'] }],
};

let clipboard: string[] = [];
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-14T12:00:00Z'));
  localStorage.clear();
  clipboard = [];
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { clipboard.push(text); } } });
});
afterEach(() => { cleanup(); vi.useRealTimers(); localStorage.clear(); });

const renderDashboard = (plans: PlanSnapshot[] = [PLAN]) => render(<ReturningDashboard pinnedPlans={plans} today={TODAY} offDays={[]} />);

describe('ReturningDashboard (P3)', () => {
  it('renders nothing without saved data', () => {
    const { container } = renderDashboard([]);
    expect(container.innerHTML).toBe('');
  });

  it('shows the next break, the PTO line, one next step and a way to plan something new', () => {
    renderDashboard();
    const region = screen.getByRole('region', { name: 'Welcome back' });
    expect(region.textContent).toContain('Next break: Mar 20 – Apr 4, 2027');
    expect(region.textContent).toContain('In your saved plan · 16 days off · 9 PTO days · Submit by Mar 8 · 14-day notice');
    expect(screen.getByTestId('pto-line').textContent).toBe('15 PTO days in your plan · 9 planned · 6 not yet planned');
    expect(within(region).getAllByRole('button').map((b) => b.textContent)).toEqual(['Copy request']);
    expect(within(region).getByText('Saved on this device · backup or restore')).toBeTruthy();
    expect(within(region).queryByRole('button', { name: 'Download backup' })).toBeNull();
    expect(within(region).getByRole('link', { name: 'Plan something new ↓' }).getAttribute('href')).toBe('#landing-heading');
    expect(within(region).getByRole('link', { name: 'Open saved plan →' }).getAttribute('href')).toMatch(/^\/pto\?/);
    // Calm: no streaks, badges or urgency words.
    expect(region.textContent).not.toMatch(/streak|badge|hurry|don’t miss|urgent|!/i);
  });

  it('walks copy → mark requested → mark approved → open plan, saving to My PTO', async () => {
    renderDashboard();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy request' })); });
    expect(clipboard[0]).toContain('I\'d like to request time off covering');
    expect(clipboard[0]).toContain('Mon Mar 22');
    expect(clipboard[0]).not.toMatch(/quieter period/);

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Mark requested' })); });
    let stored = readRequestLedger().requests;
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ start: '2027-03-20', end: '2027-04-04', status: 'requested', ptoDays: 9, noticePeriodDays: 14 });
    expect(screen.getByRole('region', { name: 'Welcome back' }).textContent).toContain('Requested · 9 PTO days');

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Mark approved' })); });
    stored = readRequestLedger().requests;
    expect(stored[0].status).toBe('approved');
    const region = screen.getByRole('region', { name: 'Welcome back' });
    expect(within(region).queryAllByRole('button')).toHaveLength(0);
    expect(within(region).getByRole('link', { name: 'Open saved plan →' })).toBeTruthy();
    expect(screen.getByTestId('pto-line').textContent).toContain('9 approved');
  });

  it('shows the request-by reminder when the date is within 14 days', () => {
    vi.setSystemTime(new Date('2027-02-25T12:00:00Z'));
    render(<ReturningDashboard pinnedPlans={[PLAN]} today="2027-02-25" offDays={[]} />);
    expect(screen.getByTestId('dashboard-reminder').textContent).toBe('The request-by date for this break is Mar 8, 11 days from today.');
  });

  it('a tracked request alone leads to My PTO', () => {
    writeRequestLedger([createPtoRequest({ start: '2026-12-21', end: '2026-12-23', status: 'requested' }, CAL, 'r1')!]);
    renderDashboard([]);
    const region = screen.getByRole('region', { name: 'Welcome back' });
    expect(within(region).getByRole('button', { name: 'Mark approved' })).toBeTruthy();
    expect(within(region).getByRole('link', { name: 'Open in My PTO →' }).getAttribute('href')).toBe('/policy#requests');
  });

  describe('backup reminder', () => {
    const savePlanDaysAgo = (days: number) => {
      localStorage.setItem(PINNED_PLANS_STORAGE_KEY, JSON.stringify({ version: 1, plans: [{ id: 'a', snapshot: PLAN }] }));
      localStorage.setItem(RETENTION_STORAGE_KEY, JSON.stringify({ version: 1, firstSavedAt: new Date(Date.now() - days * 86_400_000).toISOString() }));
    };

    it('is quiet for data saved in the last 14 days', () => {
      savePlanDaysAgo(3);
      renderDashboard();
      expect(screen.queryByTestId('backup-reminder')).toBeNull();
    });

    it('appears for older data with no backup, and "Not now" hides it', () => {
      savePlanDaysAgo(30);
      renderDashboard();
      const reminder = screen.getByTestId('backup-reminder');
      expect(reminder.textContent).toContain('Your saved plans and requests are only in this browser. You haven’t made a backup file yet.');
      fireEvent.click(within(reminder).getByRole('button', { name: 'Not now' }));
      expect(screen.queryByTestId('backup-reminder')).toBeNull();
      expect(readRetentionStatus().backupReminderDismissedAt).toBeTruthy();
    });

    it('records the backup date when backing up from the reminder', () => {
      savePlanDaysAgo(30);
      const createObjectURL = vi.fn(() => 'blob:x');
      Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      renderDashboard();
      fireEvent.click(within(screen.getByTestId('backup-reminder')).getByRole('button', { name: 'Back up' }));
      expect(click).toHaveBeenCalled();
      expect(readRetentionStatus().lastBackupAt).toBe('2026-11-14T12:00:00.000Z');
      expect(screen.getByText(/Backup file downloaded/)).toBeTruthy();
    });

    it('starts the 14-day clock for data saved before the reminder existed', () => {
      localStorage.setItem(PINNED_PLANS_STORAGE_KEY, JSON.stringify({ version: 1, plans: [{ id: 'a', snapshot: PLAN }] }));
      renderDashboard();
      expect(screen.queryByTestId('backup-reminder')).toBeNull();
      expect(readRetentionStatus().firstSavedAt).toBe('2026-11-14T12:00:00.000Z');
    });
  });
});
