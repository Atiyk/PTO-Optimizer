import { useState } from 'react';
import { Button } from './Button';
import { PLAN_SAVED_MESSAGE } from './pinnedPlanStore';
import { readRetentionStatus, updateRetentionStatus } from '../personal/retentionStatus';
import { installPlatform, iosDeviceName, promptInstall, useInstallEnvironment } from '../pwa/installOffer';

/**
 * P3 storage honesty: after "Save this plan", say plainly where the plan lives and offer
 * the two ways to keep it somewhere else: the calendar file and a backup file. Any other
 * pin message (removed, storage unavailable, no room) shows as the plain status it always was.
 */
export function SaveConfirmation({ message }: { message: string }) {
  if (!message) return null;
  if (message !== PLAN_SAVED_MESSAGE) return <p role="status" className="text-sm text-muted">{message}</p>;
  return <SavedHere />;
}

export const SAVED_HERE_TEXT = 'Saved in this browser on this device.';

function SavedHere() {
  const [backupMessage, setBackupMessage] = useState('');
  const addToCalendar = () => {
    const download = document.getElementById('shortcut-download-ics');
    if (download instanceof HTMLButtonElement && !download.disabled) {
      download.click();
      return;
    }
    document.getElementById('complete-plan-heading')?.scrollIntoView({ block: 'start' });
  };
  // The backup code loads only when someone asks for a backup, not with the planner.
  const backUp = async () => {
    const now = new Date();
    const { browserEnumerableStorage, downloadSavedDataBackup } = await import('../personal/savedDataBackup');
    if (downloadSavedDataBackup(browserEnumerableStorage(), now)) {
      updateRetentionStatus({ lastBackupAt: now.toISOString() });
      setBackupMessage('Backup file downloaded. Keep it outside this browser, for example in your files or email.');
    } else {
      setBackupMessage('The backup file could not be made in this browser.');
    }
  };
  return (
    <div data-testid="save-confirmation" className="flex min-w-0 flex-col gap-2 rounded-[10px] border border-line bg-surface px-4 py-3 text-[15px] leading-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p role="status" className="font-semibold text-ink">{SAVED_HERE_TEXT}</p>
          <p className="text-sm text-muted">Not in an account and not synced. Clearing this browser’s data removes it.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={addToCalendar}>Add to calendar</Button>
          <Button variant="secondary" onClick={backUp}>Back up</Button>
        </div>
      </div>
      {backupMessage && <p role="status" className="text-sm text-muted">{backupMessage}</p>}
      <InstallHint />
    </div>
  );
}

/** One quiet, dismissible line; only after a save, never on first load, never a dialog. */
export function InstallHint() {
  const env = useInstallEnvironment();
  const [dismissed, setDismissed] = useState(() => !!readRetentionStatus().installHintDismissedAt);
  const platform = installPlatform(env);
  if (dismissed || !platform) return null;
  const dismiss = () => {
    updateRetentionStatus({ installHintDismissedAt: new Date().toISOString() });
    setDismissed(true);
  };
  return (
    <div data-testid="install-hint" className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-line pt-2 text-sm text-muted">
      {platform === 'ios-safari'
        ? <p className="min-w-0">Add Timebower to your Home Screen so your saved plans stay on this {iosDeviceName(env.userAgent)}: tap Share, then Add to Home Screen.</p>
        : <p className="min-w-0">Install Timebower to open your saved plans like an app. They stay in this browser’s storage on this device.</p>}
      <span className="flex items-center gap-1">
        {platform === 'chromium' && <Button variant="quiet" size="sm" className="min-h-11" onClick={() => { void promptInstall(); }}>Install</Button>}
        <Button variant="quiet" size="sm" className="min-h-11" onClick={dismiss}>Not now</Button>
      </span>
    </div>
  );
}
