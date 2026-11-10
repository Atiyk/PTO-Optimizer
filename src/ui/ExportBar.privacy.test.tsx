import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ExportBar } from './ExportBar';
import { encodeEmployerCalendar } from '../personal/employerCalendar';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('actual Copy link action protects private employer details', () => {
  it('copies a privacy-safe URL, not the eh-bearing browser address', async () => {
    const raw = encodeEmployerCalendar({
      version: 1, country: 'US',
      excluded: ['2027-12-24|PRIVATE_POLICY_EXCLUSION'],
      custom: [{ date: '2027-12-27', name: 'PRIVATE_EMPLOYER_POLICY_TITLE' }],
    });
    const search = 'c=US&s=2027-01-01&e=2027-12-31&b=12&eh=' + encodeURIComponent(raw);
    window.history.replaceState(null, '', '/pto?' + search + '#PRIVATE_FRAGMENT');
    const writeText = vi.fn(async (_text: string) => {});
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<ExportBar
      breaks={[]} isSuggestedPto={() => false} categoryOf={() => 'outside' as never}
      rangeStart="2027-01-01" rangeEnd="2027-12-31" weekStart={1}
      budgetSpent={0} totalDaysOff={0} travelPercentile={null} efficiencyPercentile={null}
      noticePeriodDays={14} onPlanWithPartner={() => {}} planSearch={search}
    />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy link' })); });
    expect(writeText).toHaveBeenCalledTimes(1);
    const copied = String(writeText.mock.calls[0][0]);
    const copiedURL = new URL(copied);
    expect(copiedURL.searchParams.get('b')).toBe('12');
    expect(copied).not.toMatch(/PRIVATE_|eh=|#/);
    expect(screen.getByText(/company holidays omitted/i)).toBeTruthy();
    window.history.replaceState(null, '', '/');
  });
});
