import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Policy } from './Policy';

// Issue 15: an empty balance is unknown, not zero. Zero is a real entered balance.
// A use-it-or-lose-it policy with a grant: with a real balance, expiry can be assessed.
const POLICY = '/policy?c=US&bao=2027-01-01&ak=pp&am=1&fq=m&pda=2027-01-15&cm=n&ace=0&fd=2027-03-15';
const guard = () => screen.getByRole('heading', { name: 'PTO expiration guard' }).closest('section')!;
const noGuard = () => expect(screen.queryByRole('heading', { name: 'PTO expiration guard' })).toBeNull();
const forecast = () => screen.getByRole('heading', { name: 'PTO balance forecast' }).closest('section')!;

afterEach(() => { cleanup(); window.localStorage.clear(); window.history.replaceState(null, '', '/policy'); });

describe('unknown versus zero PTO balance on /policy', () => {
  it('asks for a balance instead of reporting no risk when the balance is unknown', () => {
    window.history.replaceState(null, '', POLICY);
    render(<Policy />);
    // F07: one line saying what the answer will be, with no invented number.
    expect(forecast().textContent).toContain('Enter your current PTO balance to see how much you will have on Mar 15, 2027, after accrual and any time off you have tracked.');
    expect(forecast().textContent).not.toMatch(/Estimated available PTO/);
    // The expiration guard waits for a balance instead of showing a placeholder card or a false all-clear.
    noGuard();
    expect(document.body.textContent).not.toMatch(/No upcoming forfeiture/);
    expect(document.body.textContent).not.toMatch(/Review next policy reset/);
  });

  it('treats an entered 0 as a real balance in the forecast and the expiration guard', () => {
    window.history.replaceState(null, '', POLICY + '&cb=0');
    render(<Policy />);
    const input = screen.getAllByLabelText('Current PTO balance (days)')[0] as HTMLInputElement;
    expect(input.value).toBe('0');
    expect(forecast().textContent).toContain('Current balance on Jan 1, 20270 days');
    expect(guard().textContent).not.toContain('Enter your current PTO balance');
    fireEvent.change(input, { target: { value: '' } });
    noGuard();
    fireEvent.change(input, { target: { value: '0' } });
    expect(guard().textContent).not.toContain('Enter your current PTO balance');
  });
});
