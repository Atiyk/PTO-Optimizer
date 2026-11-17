import { useId, useRef, useState, type ChangeEvent } from 'react';
import { Button } from './Button';
import {
  MAX_SAVED_DATA_BACKUP_LENGTH, browserEnumerableStorage, buildSavedDataBackup, downloadSavedDataBackup,
  parseSavedDataBackup, restoreSavedDataBackup, type SavedDataBackup,
} from '../personal/savedDataBackup';
import { updateRetentionStatus } from '../personal/retentionStatus';

/**
 * A quiet, opt-in recovery route for saved personal PTO data. No upload, account, or
 * remote request: the chosen JSON is read only by this browser. Restoring is a separate
 * explicit action and the storage layer never overwrites existing conflicting entries.
 */
export function SavedDataControls({ initiallyOpen = false }: { initiallyOpen?: boolean } = {}) {
  const fileId = useId();
  const [candidate, setCandidate] = useState<SavedDataBackup | null>(null);
  const [message, setMessage] = useState('');
  const [needsReload, setNeedsReload] = useState(false);
  const selectedFileId = useRef(0);

  const download = () => {
    const now = new Date();
    const storage = browserEnumerableStorage();
    if (!storage) {
      setMessage('Browser storage is unavailable. No backup was made.');
      return;
    }
    try {
      if (Object.keys(buildSavedDataBackup(storage, now).items).length === 0) {
        setMessage('No saved PTO data to back up yet.');
        return;
      }
    } catch {
      setMessage('Browser storage could not be read. No backup was made.');
      return;
    }
    if (downloadSavedDataBackup(storage, now)) {
      updateRetentionStatus({ lastBackupAt: now.toISOString() });
      setMessage('Backup downloaded. Keep this personal file in a safe place outside the browser.');
    } else {
      setMessage('Backup could not be created. Your saved data has not changed.');
    }
  };

  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    const selection = ++selectedFileId.current;
    // Selecting the same file again must still fire change after an invalid attempt.
    event.currentTarget.value = '';
    setCandidate(null);
    if (!file) return;
    if (file.size > MAX_SAVED_DATA_BACKUP_LENGTH) {
      setMessage('This file is too large to be a Timebower saved-data backup.');
      return;
    }
    try {
      const result = parseSavedDataBackup(await file.text());
      // A slower earlier file may finish reading after the user selected another one.
      if (selection !== selectedFileId.current) return;
      if (!result.ok) {
        setMessage(result.reason === 'newer-version'
          ? 'This backup is from a newer Timebower version. Use an updated version to restore it.'
          : result.reason === 'balances-only'
            ? 'This is a balances-only file, not a full Timebower saved-data backup.'
            : 'This is not a readable Timebower saved-data backup.');
        return;
      }
      const count = Object.keys(result.backup.items).length;
      if (count === 0) {
        setMessage('This backup contains no saved entries to restore.');
        return;
      }
      setCandidate(result.backup);
      setMessage(`${count} saved ${count === 1 ? 'entry' : 'entries'} found. Review before restoring; your existing data will not be overwritten.`);
    } catch {
      if (selection === selectedFileId.current) {
        setMessage('Could not read this file. No stored data was changed.');
      }
    }
  };

  const restore = () => {
    if (!candidate) return;
    const storage = browserEnumerableStorage();
    if (!storage) {
      setMessage('Browser storage is unavailable. Nothing was restored.');
      return;
    }
    const result = restoreSavedDataBackup(storage, candidate);
    setCandidate(null);
    const changed = result.added.length + result.merged.length;
    const conflicts = result.kept.length;
    const failures = result.failed.length;
    setNeedsReload((previous) => previous || changed > 0);
    setMessage(
      `${changed} saved ${changed === 1 ? 'entry' : 'entries'} restored. ` +
      `${conflicts} existing ${conflicts === 1 ? 'entry was' : 'entries were'} kept unchanged. ` +
      (failures ? `${failures} could not be saved. Check browser storage space. ` : '') +
      (changed ? 'Reload this page to see the restored data.' : 'No existing data was replaced.')
    );
  };

  return (
    <details data-testid="saved-data-controls" open={initiallyOpen} className="mt-3 border-t border-line text-sm text-muted">
      <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]">
        Saved on this device · backup or restore
      </summary>
      <div className="space-y-3 pb-2">
        <p>Saved plans and PTO requests live in this browser, not an account. Clearing site data removes them. A backup file lets you move them to another browser.</p>
        <p>Backup files contain personal PTO and employer details. Store them privately. They are never uploaded to Timebower.</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={download}>Download backup</Button>
          <label htmlFor={fileId} className="font-semibold text-ink">Choose a Timebower backup (.json)</label>
          <input id={fileId} type="file" accept=".json,application/json" onChange={(event) => { void chooseFile(event); }}
            className="min-h-11 w-full max-w-full text-sm file:mr-3 file:min-h-11 file:rounded-[6px] file:border file:border-line-strong file:bg-surface file:px-3 file:text-sm file:font-semibold file:text-ink" />
        </div>
        {candidate && <div className="flex flex-wrap items-center gap-3">
          <p>Restoring adds missing entries and keeps conflicting data already saved here. Review this before continuing.</p>
          <Button onClick={restore}>Restore missing data</Button>
        </div>}
        {needsReload && <Button variant="secondary" onClick={() => window.location.reload()}>Reload to show restored data</Button>}
        {message && <p role="status" className="text-ink">{message}</p>}
      </div>
    </details>
  );
}
