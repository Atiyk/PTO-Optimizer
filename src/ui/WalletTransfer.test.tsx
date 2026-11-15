import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { backupSummary, balanceCount, restoreSummary, WalletTransfer } from './WalletTransfer';

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

describe('full backup of everything saved here (P3 storage honesty)', () => {
  it('says plainly where saved data lives and that restoring never replaces it', () => {
    render(<WalletTransfer requests={[]} forecastDate="2026-11-14" />);
    const region = screen.getByRole('region', { name: 'Everything saved here' });
    expect(region.textContent).toContain('kept only in this browser on this device. They aren’t in an account or synced.');
    expect(screen.getByRole('button', { name: 'Download a full backup' })).toBeTruthy();
    expect(screen.getByLabelText('Restore from a full backup')).toBeTruthy();
    expect(region.textContent).toContain('Adds only what this browser doesn’t have, including saved plans and employer calendars. Nothing saved here is replaced.');
  });

  it('restores a file into this browser without overwriting what is here', async () => {
    localStorage.setItem('gapless.personal.pinned-plans.v1', 'mine');
    render(<WalletTransfer requests={[]} forecastDate="2026-11-14" />);
    const file = new File([JSON.stringify({
      format: 'timebower-saved-data', version: 1, exportedAt: '2026-01-01T00:00:00Z',
      items: { 'gapless.personal.pinned-plans.v1': 'theirs', 'gapless.personal.policy.v1': 'policy' },
    })], 'backup.json', { type: 'application/json' });
    fireEvent.change(screen.getByLabelText('Restore from a full backup'), { target: { files: [file] } });
    expect(await screen.findByText(/Added 1 saved item this browser didn’t have\. 1 item differs/)).toBeTruthy();
    expect(localStorage.getItem('gapless.personal.pinned-plans.v1')).toBe('mine');
    expect(localStorage.getItem('gapless.personal.policy.v1')).toBe('policy');
  });

  it('points a balances-only file to the balances import', async () => {
    render(<WalletTransfer requests={[]} forecastDate="2026-11-14" />);
    const file = new File(['{"version":1,"banks":[]}'], 'balances.json', { type: 'application/json' });
    fireEvent.change(screen.getByLabelText('Restore from a full backup'), { target: { files: [file] } });
    expect(await screen.findByText('This is a balances backup. Use “Review a backup file” below for it.')).toBeTruthy();
  });

  it('summarises a restore in plain words', () => {
    expect(restoreSummary(0, 0, 0)).toBe('Everything in this backup is already saved in this browser.');
    expect(restoreSummary(3, 0, 0)).toBe('Added 3 saved items this browser didn’t have. Reload the page to see them.');
    expect(restoreSummary(1, 2, 0)).toBe('Added 1 saved item this browser didn’t have. 2 items differ from what’s saved here and were left as they are. Reload the page to see them.');
  });
});
