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
        <p>A backup file holds your saved PTO balances and policy settings, without tracked requests or notes. Use it to move them to another browser. Imported balances stay in this browser and show separately from the policy above.</p>
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
