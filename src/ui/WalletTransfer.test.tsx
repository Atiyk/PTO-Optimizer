import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { backupSummary, balanceCount, WalletTransfer } from './WalletTransfer';

afterEach(() => { cleanup(); localStorage.clear(); });

describe('WalletTransfer copy (N-P2-4)', () => {
  it('names the backup file plainly, with no "wallet" or "banks" in what a person reads', () => {
    render(<WalletTransfer requests={[]} forecastDate="2026-11-14" />);
    const details = screen.getByText('Back up or move your saved data').closest('details')!;
    details.open = true;
    fireEvent(details, new Event('toggle'));
    expect(screen.getByRole('button', { name: 'Download a backup file' })).toBeTruthy();
    expect(screen.getByLabelText('Review a backup file')).toBeTruthy();
    expect(details.textContent).not.toMatch(/wallet|\bbanks?\b/i);
  });

  it('summarises an import review in counted, plain words', () => {
    expect(balanceCount(1)).toBe('1 balance');
    expect(balanceCount(3)).toBe('3 balances');
    expect(backupSummary(2, 1)).toBe('This backup has 3 balances: 2 new, 1 already saved here.');
    expect(backupSummary(1, 0)).toBe('This backup has 1 balance: 1 new, 0 already saved here.');
  });
});
