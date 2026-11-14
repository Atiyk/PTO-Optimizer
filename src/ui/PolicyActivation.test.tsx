import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import { createPtoRequest, writeRequestLedger } from '../personal/requestLedger';
import { Policy } from './Policy';
import { blankBalanceMessage } from './balanceCopy';

// F07: My PTO opens on one input and the answer, not on a wall of zeros.
beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, '', '/policy?c=US');
});
afterEach(() => { cleanup(); window.localStorage.clear(); window.history.replaceState(null, '', '/policy'); });

const main = () => document.querySelector('main')!;

describe('My PTO first visit', () => {
  it('puts the balance input first and explains the answer instead of inventing one', () => {
    render(<Policy />);
    const firstField = main().querySelector('input, select, textarea') as HTMLInputElement;
    expect(firstField).toBe(screen.getByLabelText('Current PTO balance (days)'));
    expect(firstField.value).toBe('');
    const forecast = within(screen.getByRole('region', { name: 'PTO balance forecast' }));
    expect(forecast.getByText(/^Enter your current PTO balance to see how much you will have on .+, after accrual and any time off you have tracked\.$/)).toBeTruthy();
    expect(forecast.queryByText(/Estimated available PTO/)).toBeNull();
    // No placeholder prompts elsewhere asking for the same balance.
    expect(main().textContent).not.toMatch(/Enter your balance and policy above/);
  });

  it('collapses the empty request tracker to one sentence and one action', () => {
    render(<Policy />);
    const tracker = within(screen.getByRole('region', { name: 'My PTO requests' }));
    expect(tracker.getByTestId('tracker-empty').textContent).toMatch(/^Nothing tracked in this browser yet\./);
    for (const label of ['Considering', 'Planned', 'Requested', 'Approved upcoming', 'Completed', 'Cancelled']) {
      expect(tracker.queryByText(label, { selector: 'dt' })).toBeNull();
    }
    expect(tracker.getByText('Track a date range').closest('details')).toBeTruthy();
    expect(tracker.queryByText('Upcoming requests')).toBeNull();
  });

  it('keeps the full tracker, with its counters, once a request exists', () => {
    const calendar = { workWeek: DEFAULT_WORK_WEEK, offDays: [], rangeStart: '2026-01-01', rangeEnd: '2028-12-31' };
    writeRequestLedger([createPtoRequest({ start: '2027-12-20', end: '2027-12-22', status: 'planned' }, calendar, 'one')!]);
    render(<Policy />);
    const tracker = within(screen.getByRole('region', { name: 'My PTO requests' }));
    expect(tracker.queryByTestId('tracker-empty')).toBeNull();
    expect(tracker.getByText('Planned', { selector: 'dt' }).nextElementSibling?.textContent).toBe('1');
    expect(tracker.getByText('Track another date range')).toBeTruthy();
    expect(tracker.getAllByRole('article')).toHaveLength(1);
  });

  it('keeps payout and backups reachable behind plain disclosures', () => {
    render(<Policy />);
    const payout = screen.getByRole('heading', { name: 'What might my unused PTO be worth if I leave?' });
    const details = payout.closest('details')!;
    expect(details.open).toBe(false);
    expect(within(details).getByLabelText('Employer payout assumption')).toBeTruthy();
    // The employment-law caveat is stated once.
    expect(main().textContent!.match(/Employment law is not verified here/g)).toHaveLength(1);
    expect(main().textContent).not.toMatch(/vacation/i);
    expect(screen.getByText('Back up or move your saved data').closest('details')!.open).toBe(false);
  });

  it('opens the payout estimator for a #departure-payout link', () => {
    window.history.replaceState(null, '', '/policy?c=US#departure-payout');
    render(<Policy />);
    expect(screen.getByRole('heading', { name: 'What might my unused PTO be worth if I leave?' }).closest('details')!.open).toBe(true);
  });

  it('names the control the intro points to', () => {
    render(<Policy />);
    expect(main().querySelector('h1 + p')!.textContent).toMatch(/Advanced policy options/);
    expect(screen.getByText('Advanced policy options', { selector: 'summary span' })).toBeTruthy();
  });

  it('shows a forecast from a real 0', () => {
    render(<Policy />);
    fireEvent.change(screen.getByLabelText('Current PTO balance (days)'), { target: { value: '0' } });
    expect(screen.queryByText(/^Enter your current PTO balance/)).toBeNull();
  });
});

describe('blankBalanceMessage', () => {
  it('names the forecast date when it is valid and drops it otherwise', () => {
    expect(blankBalanceMessage('2027-03-15', '2027-01-01')).toBe('Enter your current PTO balance to see how much you will have on Mar 15, 2027, after accrual and any time off you have tracked.');
    expect(blankBalanceMessage('', '2027-01-01')).toBe('Enter your current PTO balance to see how much you will have, after accrual and any time off you have tracked.');
    expect(blankBalanceMessage('2026-12-01', '2027-01-01')).not.toMatch(/ on /);
  });
});
