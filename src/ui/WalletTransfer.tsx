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
      if (!next) setMessage('This backup or the saved wallet could not be read. Your saved banks and requests are unchanged.');
      setPreview(next);
    } catch {
      setMessage('This backup could not be read. Your saved banks and requests are unchanged.');
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
      ? 'Wallet banks saved in this browser. Your tracked requests and active policy are unchanged.'
      : 'The wallet or tracked requests changed, or storage is unavailable. Choose the file again for a fresh review.');
  }

  function download() {
    const latest = readBrowserWallet();
    if (!latest) { setMessage('The saved wallet could not be read.'); return; }
    const banks = latest.banks.length ? latest.banks : policy ? [legacyVacationBank(policy)] : [];
    const content = encodeLeaveWallet({ version: 1, banks });
    if (!content) { setMessage('Enter valid policy values or import a wallet before downloading a backup.'); return; }
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'timebower-wallet.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <details className="mt-3 min-w-0 rounded-[10px] border border-line bg-surface" onToggle={(event) => {
      const next = event.currentTarget.open;
      setOpen(next);
      if (next) {
        setWallet(readBrowserWallet());
        setLockSupport(canLockWalletLedger());
      }
    }}>
      <summary className="flex min-h-11 cursor-pointer items-center px-4 py-2 font-semibold text-ink sm:px-6">Wallet backups and imports</summary>
      <div className="space-y-3 border-t border-line px-4 pb-4 pt-3 text-sm text-muted sm:px-6">
        <p>Backups contain wallet-bank settings only. Imported banks stay in this browser, with their balances shown separately from the policy above.</p>
        {!lockSupport && <p>Wallet imports and deletion require a browser with cross-tab storage locks. The request tracker is still available.</p>}
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
          <Button variant="secondary" disabled={pending || !wallet || (!policy && wallet.banks.length === 0)} onClick={download}>Download wallet backup</Button>
          <div className="min-w-0 max-w-full">
            <label htmlFor={id} className="mb-1 block font-semibold text-ink">Review a wallet backup</label>
            <input id={id} className="max-w-full" type="file" accept=".json,application/json" disabled={pending || !lockSupport || !wallet}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void review(file);
              }} />
          </div>
        </div>
        {preview && (
          <section aria-label="Wallet import review" className="space-y-2 border-t border-line pt-3">
            <p className="text-ink">{preview.addedBankIds.length} new banks and {preview.replacedBankIds.length} matching banks in this backup.</p>
            <ul className="list-disc space-y-1 pl-5">
              {preview.incoming.banks.map((bank) => <li key={bank.id} className="break-words">{bank.name}</li>)}
            </ul>
            {preview.unresolvedRequestIds.length > 0 ? <p>Some linked requests are absent. Import this file in the browser with those requests.</p> : (
              <>
                <Button variant="secondary" disabled={pending} onClick={() => void apply('merge')}>Merge wallet banks</Button>
                {preview.removedBankIdsOnFullReplace.length > 0 && (
                  <div className="space-y-2">
                    <label className="flex items-center gap-2"><input type="checkbox" checked={replaceAll} onChange={(event) => setReplaceAll(event.target.checked)} /> Remove {preview.removedBankIdsOnFullReplace.length} unrelated banks as well</label>
                    <Button variant="quiet" disabled={pending || !replaceAll} onClick={() => void apply('replace-all')}>Replace all wallet banks</Button>
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
                <span>Remove the saved wallet banks and keep tracked requests?</span>
                <Button variant="quiet" disabled={pending} onClick={async () => {
                  setPending(true);
                  const saved = await clearBrowserWallet(wallet.revision);
                  setPending(false);
                  setRemoveRevision(undefined);
                  setMessage(saved ? 'Wallet banks removed from this browser.' : 'The wallet changed. Review the current banks before trying again.');
                }}>Confirm wallet removal</Button>
                <Button variant="quiet" onClick={() => setRemoveRevision(undefined)}>Cancel</Button>
              </div>
            ) : <Button variant="quiet" disabled={pending} onClick={() => setRemoveRevision(wallet.revision)}>Remove saved wallet banks</Button>}
          </div>
        )}
        {message && <p role="status">{message}</p>}
      </div>
    </details>
  );
}
