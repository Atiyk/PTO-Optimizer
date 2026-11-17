import { act, cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SavedDataControls } from './SavedDataControls';
import { readRetentionStatus } from '../personal/retentionStatus';
import { SAVED_DATA_BACKUP_FORMAT } from '../personal/savedDataBackup';

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

const makeBackup = (items: Record<string, string>) =>
  JSON.stringify({ format: SAVED_DATA_BACKUP_FORMAT, version: 1, exportedAt: '2026-11-17T00:00:00.000Z', items });

function choose(text: string, filename = 'timebower-saved-data.json') {
  const file = new File([text], filename, { type: 'application/json' });
  Object.defineProperty(file, 'text', { value: async () => text });
  fireEvent.change(screen.getByLabelText('Choose a Timebower backup (.json)'), { target: { files: [file] } });
}

function open() {
  const region = screen.getByTestId('saved-data-controls') as HTMLDetailsElement;
  fireEvent.click(within(region).getByText('Saved on this device · backup or restore'));
  return region;
}

describe('SavedDataControls', () => {
  it('stays collapsed until asked for and clearly names local-only storage', () => {
    render(<SavedDataControls />);
    const details = screen.getByTestId('saved-data-controls') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details.textContent).toContain('never uploaded to Timebower');
    expect(screen.queryByRole('button', { name: 'Restore missing data' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Download backup' })).toBeNull();
  });

  it('downloads a file only on request and records the backup date', () => {
    localStorage.setItem('gapless.personal.example.v1', 'local');
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:backup'), revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<SavedDataControls />);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Download backup' }));
    expect(click).toHaveBeenCalledOnce();
    expect(screen.getByRole('status').textContent).toContain('Backup downloaded');
    expect(readRetentionStatus().lastBackupAt).toBeTruthy();
  });

  it('reviews the file before restoring missing entries; never replaces conflicting entries', async () => {
    localStorage.setItem('gapless.personal.keep.v1', 'current browser wins');
    render(<SavedDataControls />);
    open();
    await act(async () => {
      choose(makeBackup({ 'gapless.personal.keep.v1': 'older device', 'gapless.personal.new.v1': 'restored' }));
    });
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/2 saved entries found/));
    expect(localStorage.getItem('gapless.personal.new.v1')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Restore missing data' }));
    expect(localStorage.getItem('gapless.personal.keep.v1')).toBe('current browser wins');
    expect(localStorage.getItem('gapless.personal.new.v1')).toBe('restored');
    expect(screen.getByRole('status').textContent).toMatch(/1 saved entry restored.*1 existing entry was kept unchanged/);
    expect(screen.getByRole('button', { name: 'Reload to show restored data' })).toBeTruthy();
  });

  it('rejects an invalid or balances-only file without changing storage', async () => {
    render(<SavedDataControls />);
    open();
    await act(async () => { choose('not json'); });
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/not a readable Timebower/));
    expect(screen.queryByRole('button', { name: 'Restore missing data' })).toBeNull();
    await act(async () => { choose(JSON.stringify({ version: 1, banks: [] })); });
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/balances-only file/));
    expect(localStorage.length).toBe(0);
  });

  it('does not show a restore action for an empty backup', async () => {
    render(<SavedDataControls />);
    open();
    await act(async () => { choose(makeBackup({})); });
    expect(screen.getByRole('status').textContent).toMatch(/no saved entries/);
    expect(screen.queryByRole('button', { name: 'Restore missing data' })).toBeNull();
  });
});
