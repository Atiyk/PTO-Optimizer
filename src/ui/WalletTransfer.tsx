import { useEffect, useId, useMemo, useState } from 'react';
import { legacyVacationBank, projectLeaveWallet } from '../personal/leaveWallet';
import { encodeLeaveWallet, LEAVE_WALLET_STORAGE_KEY, MAX_WALLET_JSON_LENGTH } from '../personal/leaveWalletCodec';
import type { PtoRequest } from '../personal/requestLedger';
import type { TimeOffPolicy } from '../policy/model';
import {
  acceptBrowserWalletImport, canLockWalletLedger, clearBrowserWallet, prepareBrowserWalletImport,
  readBrowserWallet, WALLET_BANKS_CHANGED,
} from '../integration/browserWalletStore';
import type { PreparedWalletImport } from '../integration/walletImportLedgerGate';
import { Button } from './Button';
import { compactDate } from './compactDate';
import {
  browserEnumerableStorage, downloadSavedDataBackup, MAX_SAVED_DATA_BACKUP_LENGTH, parseSavedDataBackup, restoreSavedDataBackup,
} from '../personal/savedDataBackup';
import { updateRetentionStatus } from '../personal/retentionStatus';

/** "1 balance" / "3 balances": each saved bank of days (vacation, sick, …) is a balance. */
export function balanceCount(n: number): string {
  return `${n} ${n === 1 ? 'balance' : 'balances'}`;
}

/** The import review's first line, in plain words (N-P2-4: no "wallet" or "banks"). */
export function backupSummary(added: number, matching: number): string {
  return `This backup has ${balanceCount(added + matching)}: ${added} new, ${matching} already saved here.`;
}

export function WalletTransfer({ policy, requests, forecastDate }: {
  policy?: TimeOffPolicy;
  requests: readonly PtoRequest[];
  forecastDate: string;
}) {
  const id = useId();
  const [wallet, setWallet] = useState<ReturnType<typeof readBrowserWallet>>(null);
  const [lockSupport, setLockSupport] = useState(false);
  const [preview, setPreview] = useState<PreparedWalletImport | null>(null);
  const [pending, setPending] = useState(false);
  const [replaceAll, setReplaceAll] = useState(false);
  const [removeRevision, setRemoveRevision] = useState<string>();
  const [message, setMessage] = useState('');
  const [open, setOpen] = useState(false);
  const forecast = useMemo(() => open && wallet?.banks.length ? projectLeaveWallet(wallet.banks, forecastDate, requests) : null, [open, wallet, forecastDate, requests]);

  useEffect(() => {
    if (!open) return;
    const refresh = () => setWallet(readBrowserWallet());
    const onStorage = (event: StorageEvent) => { if (event.key === LEAVE_WALLET_STORAGE_KEY || event.key === null) refresh(); };
    window.addEventListener(WALLET_BANKS_CHANGED, refresh);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(WALLET_BANKS_CHANGED, refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, [open]);

  async function review(file: File) {
    setPending(true);
    setPreview(null);
    setReplaceAll(false);
    setMessage('');
    try {
      const next = file.size <= MAX_WALLET_JSON_LENGTH ? await prepareBrowserWalletImport(await file.text()) : null;
      if (!next) setMessage('This backup file or your saved balances could not be read. Nothing saved here has changed.');
      setPreview(next);
    } catch {
      setMessage('This backup file could not be read. Nothing saved here has changed.');
    } finally {
      setPending(false);
    }
  }

  async function apply(mode: 'merge' | 'replace-all') {
    if (!preview || (mode === 'replace-all' && !replaceAll)) return;
    setPending(true);
    const saved = await acceptBrowserWalletImport(preview, mode, true);
    setPreview(null);
    setReplaceAll(false);
    setPending(false);
    setMessage(saved
      ? 'Balances from the backup are saved in this browser. Your tracked requests and policy are unchanged.'
      : 'Your saved balances or tracked requests changed, or storage is unavailable. Choose the file again to review it fresh.');
  }

  function download() {
    const latest = readBrowserWallet();
    if (!latest) { setMessage('Your saved balances could not be read.'); return; }
    const banks = latest.banks.length ? latest.banks : policy ? [legacyVacationBank(policy)] : [];
    const content = encodeLeaveWallet({ version: 1, banks });
    if (!content) { setMessage('Enter valid policy values or import a backup file before downloading one.'); return; }
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'timebower-backup.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <details className="group min-w-0 rounded-[10px] border border-line bg-surface" onToggle={(event) => {
      const next = event.currentTarget.open;
      setOpen(next);
      if (next) {
        setWallet(readBrowserWallet());
        setLockSupport(canLockWalletLedger());
      }
    }}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 font-semibold text-ink sm:px-6 [&::-webkit-details-marker]:hidden">
        <span>Back up or move your saved data</span>
        <span aria-hidden="true" className="shrink-0 text-xl leading-none group-open:rotate-45 motion-safe:transition-transform">+</span>
      </summary>
      <div className="space-y-3 border-t border-line px-4 pb-4 pt-3 text-sm text-muted sm:px-6">
        <FullBackup />
        <h3 className="border-t border-line pt-3 font-semibold text-ink">Balances and policy only</h3>
        <p>This smaller backup file holds your saved PTO balances and policy settings, without tracked requests or notes. Use it to move them to another browser. Imported balances stay in this browser and show separately from the policy above.</p>
        {!lockSupport && <p>Importing or removing saved balances needs a browser that supports cross-tab storage locks. The request tracker still works.</p>}
        {wallet && wallet.banks.length > 0 && (
          <ul className="space-y-2">
            {wallet.banks.map((bank) => {
              const snapshot = forecast?.banks.find((candidate) => candidate.id === bank.id);
              return <li key={bank.id} className="break-words">
                <strong className="text-ink">{bank.name}</strong>
                {snapshot?.confirmedBalance !== undefined && snapshot.confirmedBalance !== null && (
                  <> · {new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(snapshot.confirmedBalance)} {snapshot.unit} on {compactDate(forecastDate)}</>
                )}
              </li>;
            })}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" disabled={pending || !wallet || (!policy && wallet.banks.length === 0)} onClick={download}>Download a backup file</Button>
          <div className="min-w-0 max-w-full">
            <label htmlFor={id} className="mb-1 block font-semibold text-ink">Review a backup file</label>
            <input id={id} className="max-w-full" type="file" accept=".json,application/json" disabled={pending || !lockSupport || !wallet}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void review(file);
              }} />
          </div>
        </div>
        {preview && (
          <section aria-label="Backup file review" className="space-y-2 border-t border-line pt-3">
            <p className="text-ink">{backupSummary(preview.addedBankIds.length, preview.replacedBankIds.length)}</p>
            <ul className="list-disc space-y-1 pl-5">
              {preview.incoming.banks.map((bank) => <li key={bank.id} className="break-words">{bank.name}</li>)}
            </ul>
            {preview.unresolvedRequestIds.length > 0 ? <p>This backup links to requests that aren’t in this browser. Import it in the browser that has those requests.</p> : (
              <>
                <Button variant="secondary" disabled={pending} onClick={() => void apply('merge')}>Merge with saved balances</Button>
                {preview.removedBankIdsOnFullReplace.length > 0 && (
                  <div className="space-y-2">
                    <label className="flex items-center gap-2"><input type="checkbox" checked={replaceAll} onChange={(event) => setReplaceAll(event.target.checked)} /> Also remove {balanceCount(preview.removedBankIdsOnFullReplace.length)} saved here that aren’t in this backup</label>
                    <Button variant="quiet" disabled={pending || !replaceAll} onClick={() => void apply('replace-all')}>Replace all saved balances</Button>
                  </div>
                )}
              </>
            )}
          </section>
        )}
        {wallet && wallet.banks.length > 0 && lockSupport && (
          <div>
            {removeRevision === wallet.revision ? (
              <div className="flex flex-wrap items-center gap-2">
                <span>Remove saved balances from this browser? Tracked requests stay.</span>
                <Button variant="quiet" disabled={pending} onClick={async () => {
                  setPending(true);
                  const saved = await clearBrowserWallet(wallet.revision);
                  setPending(false);
                  setRemoveRevision(undefined);
                  setMessage(saved ? 'Saved balances removed from this browser.' : 'Your saved balances changed. Review them and try again.');
                }}>Remove saved balances</Button>
                <Button variant="quiet" onClick={() => setRemoveRevision(undefined)}>Cancel</Button>
              </div>
            ) : <Button variant="quiet" disabled={pending} onClick={() => setRemoveRevision(wallet.revision)}>Remove saved balances…</Button>}
          </div>
        )}
        {message && <p role="status">{message}</p>}
      </div>
    </details>
  );
}

/**
 * P3 storage honesty: everything Timebower saved in this browser, in one file. Restoring
 * adds only what this browser doesn't have; anything already saved here stays as it is.
 */
export function restoreSummary(added: number, kept: number, failed: number): string {
  if (failed > 0) return `Storage is full or unavailable, so ${failed} saved ${failed === 1 ? 'item' : 'items'} from the backup could not be added. Nothing saved here was changed.`;
  if (added === 0 && kept === 0) return 'Everything in this backup is already saved in this browser.';
  const parts = [`Added ${added} saved ${added === 1 ? 'item' : 'items'} this browser didn’t have.`];
  if (kept > 0) parts.push(`${kept} ${kept === 1 ? 'item differs' : 'items differ'} from what’s saved here and ${kept === 1 ? 'was' : 'were'} left as ${kept === 1 ? 'it is' : 'they are'}.`);
  return `${parts.join(' ')} Reload the page to see them.`;
}

function FullBackup() {
  const id = useId();
  const [message, setMessage] = useState('');
  async function restore(file: File) {
    const storage = browserEnumerableStorage();
    if (!storage) { setMessage('Browser storage is unavailable, so nothing can be restored here.'); return; }
    let text = '';
    try { text = file.size <= MAX_SAVED_DATA_BACKUP_LENGTH ? await file.text() : ''; } catch { text = ''; }
    const parsed = parseSavedDataBackup(text);
    if (!parsed.ok) {
      setMessage(parsed.reason === 'balances-only'
        ? 'This is a balances backup. Use “Review a backup file” below for it.'
        : parsed.reason === 'newer-version'
          ? 'This backup was made by a newer version of Timebower. Reload the page and try again.'
          : 'This file could not be read as a Timebower backup. Nothing saved here has changed.');
      return;
    }
    const result = restoreSavedDataBackup(storage, parsed.backup);
    setMessage(restoreSummary(result.added.length, result.kept.length, result.failed.length));
  }
  return (
    <section aria-label="Everything saved here" className="space-y-3">
      <p className="text-ink">Your saved plans, tracked requests, balances, policy and employer holidays are kept only in this browser on this device. They aren’t in an account or synced. A full backup file keeps a copy you can restore here or in another browser.</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={() => {
          const now = new Date();
          if (downloadSavedDataBackup(browserEnumerableStorage(), now)) {
            updateRetentionStatus({ lastBackupAt: now.toISOString() });
            setMessage('Backup file downloaded. Keep it outside this browser, for example in your files or email.');
          } else {
            setMessage('The backup file could not be made in this browser.');
          }
        }}>Download a full backup</Button>
        <div className="min-w-0 max-w-full">
          <label htmlFor={id} className="mb-1 block font-semibold text-ink">Restore from a full backup</label>
          <input id={id} className="max-w-full" type="file" accept=".json,application/json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void restore(file);
            }} />
          <p className="mt-1">Adds only what this browser doesn’t have. Nothing saved here is replaced.</p>
        </div>
      </div>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
