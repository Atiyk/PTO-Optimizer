import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  backupReminderDue, noteFirstSave, readRetentionStatus, requestPersistentStorageOnce, RETENTION_STORAGE_KEY, updateRetentionStatus,
} from './retentionStatus';

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

const NOW = new Date('2026-11-14T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

describe('retention status (P3)', () => {
  it('keeps the first save date once', () => {
    noteFirstSave(new Date('2026-01-01T00:00:00Z'));
    noteFirstSave(new Date('2026-06-01T00:00:00Z'));
    expect(readRetentionStatus().firstSavedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('never replaces a value it cannot read (corrupt or from a newer version)', () => {
    localStorage.setItem(RETENTION_STORAGE_KEY, '{"version":2,"future":true}');
    expect(updateRetentionStatus({ lastBackupAt: NOW.toISOString() })).toBe(false);
    expect(localStorage.getItem(RETENTION_STORAGE_KEY)).toBe('{"version":2,"future":true}');
    localStorage.setItem(RETENTION_STORAGE_KEY, '{oops');
    noteFirstSave(NOW);
    expect(localStorage.getItem(RETENTION_STORAGE_KEY)).toBe('{oops');
    expect(readRetentionStatus()).toEqual({});
  });

  describe('backup reminder', () => {
    const due = (over: Partial<Parameters<typeof backupReminderDue>[0]> = {}) => backupReminderDue({
      hasMeaningfulData: true, dataSince: daysAgo(20), status: {}, now: NOW, ...over,
    });
    it('shows for saved data older than 14 days with no backup', () => expect(due()).toBe(true));
    it('needs meaningful saved data', () => expect(due({ hasMeaningfulData: false })).toBe(false));
    it('waits 14 days after the first save', () => expect(due({ dataSince: daysAgo(10) })).toBe(false));
    it('stays away for 90 days after a backup', () => {
      expect(due({ status: { lastBackupAt: daysAgo(30) } })).toBe(false);
      expect(due({ status: { lastBackupAt: daysAgo(91) } })).toBe(true);
    });
    it('stays away for 90 days after "Not now"', () => {
      expect(due({ status: { backupReminderDismissedAt: daysAgo(5) } })).toBe(false);
      expect(due({ status: { backupReminderDismissedAt: daysAgo(100) } })).toBe(true);
    });
  });

  describe('persistent storage request', () => {
    it('asks once, after feature detection', async () => {
      const persist = vi.fn(async () => true);
      const nav = { storage: { persist, persisted: async () => false } };
      expect(await requestPersistentStorageOnce(localStorage, nav)).toBe(true);
      expect(await requestPersistentStorageOnce(localStorage, nav)).toBeNull();
      expect(persist).toHaveBeenCalledTimes(1);
      expect(readRetentionStatus().persistRequestedAt).toBeTruthy();
    });
    it('does nothing where the API is missing', async () => {
      expect(await requestPersistentStorageOnce(localStorage, {})).toBeNull();
      expect(readRetentionStatus().persistRequestedAt).toBeUndefined();
    });
    it('does not ask again when storage is already persisted', async () => {
      const persist = vi.fn(async () => true);
      expect(await requestPersistentStorageOnce(localStorage, { storage: { persist, persisted: async () => true } })).toBe(true);
      expect(persist).not.toHaveBeenCalled();
    });
  });
});
