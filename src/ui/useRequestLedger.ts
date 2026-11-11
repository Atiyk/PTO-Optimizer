import { useEffect, useRef, useState } from 'react';
import {
  MAX_REQUESTS, REQUEST_CHANGE_EVENT, REQUEST_STORAGE_KEY, REQUEST_STATUSES, browserRequestStorage, calendarCoversRequest, calendarForSavedRequest,
  createPtoRequest, createSavedBreakRequest, readRequestLedger, saveRequestLedger, validRequestRange,
  type LedgerRecovery, type PtoRequest, type RequestCalendar, type RequestInput, type SavedBreakInput,
} from '../personal/requestLedger';
import { withWalletLedgerLock, type LedgerAction } from '../integration/browserWalletStore';

type LedgerChange = { requests: PtoRequest[]; available: boolean; recovery?: LedgerRecovery; quarantined?: boolean };
export interface LedgerActionResult {
  ok: boolean;
  id?: string;
  message: string;
  persisted?: boolean;
  existing?: boolean;
}
const WRITE_FAILED = 'Browser storage could not be coordinated. Your saved requests are unchanged. Try again.';

/** Non-destructive notice when stored requests could not be fully read. */
export function ledgerStorageNotice(state: Pick<LedgerChange, 'recovery' | 'quarantined'>): string | undefined {
  if (state.quarantined) return 'Some saved requests in this browser could not be read. A copy of them was kept in this browser before your change was saved; nothing was deleted.';
  if (state.recovery === 'newer-version') return 'Your requests were saved by a newer version of Gapless in another tab. Reload this page to see and edit them; changes here apply to this visit only and never overwrite them.';
  if (state.recovery) return 'Some saved requests in this browser could not be read. They stay saved as they are, and a copy is kept in this browser before any change replaces them.';
  return undefined;
}

function initialLedger(): LedgerChange {
  const stored = readRequestLedger();
  // A ledger from a newer schema is shown as unavailable so nothing here writes over it.
  return stored.recovery === 'newer-version' ? { ...stored, available: false } : stored;
}

export function useRequestLedger() {
  const [state, setState] = useState<LedgerChange>(initialLedger);
  const live = useRef(state);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const apply = (next: LedgerChange) => {
      live.current = next;
      setState(next);
    };
    const onChange = (event: Event) => {
      const change = (event as CustomEvent<LedgerChange>).detail;
      if (change) apply(change);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === REQUEST_STORAGE_KEY || event.key === null) {
        const stored = initialLedger();
        if (stored.available || stored.recovery === 'newer-version') apply(stored);
      }
    };
    window.addEventListener(REQUEST_CHANGE_EVENT, onChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(REQUEST_CHANGE_EVENT, onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  function mutate<T>(apply: (requests: PtoRequest[], persist: (next: PtoRequest[]) => boolean) => T, fallback: T): LedgerAction<T> {
    const failed = () => { setMessage(WRITE_FAILED); return fallback; };
    try {
      const result = withWalletLedgerLock(() => {
        const storage = browserRequestStorage();
        const stored = readRequestLedger(storage);
        const canPersist = live.current.available && stored.available && stored.recovery !== 'newer-version';
        const requests = canPersist ? stored.requests : live.current.requests;
        return apply(requests, (updated) => {
          // Read-modify-write against the revision just read, inside the same lock or task.
          const saved = canPersist ? saveRequestLedger(updated, storage, stored.revision) : null;
          const available = saved?.status === 'saved';
          const next: LedgerChange = {
            requests: updated, available,
            ...(stored.recovery === 'newer-version' ? { recovery: stored.recovery } : {}),
            ...((saved?.status === 'saved' && saved.quarantined) || live.current.quarantined ? { quarantined: true } : {}),
          };
          live.current = next;
          setState(next);
          if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<LedgerChange>(REQUEST_CHANGE_EVENT, { detail: next }));
          return available;
        });
      });
      return result instanceof Promise ? result.catch(failed) : result;
    } catch {
      return failed();
    }
  }

  function addEntry(
    input: Pick<RequestInput, 'start' | 'end'>,
    calendar: RequestCalendar,
    create: (id: string) => PtoRequest | null,
    savedBreak = false,
  ): LedgerAction<LedgerActionResult> {
    return mutate<LedgerActionResult>((requests, persist) => {
      const duplicate = requests.find((r) => r.start === input.start && r.end === input.end);
      if (duplicate) {
        const result = {
          ok: savedBreak,
          id: duplicate.id,
          existing: true,
          persisted: live.current.available,
          message: 'These dates are already in My PTO. You can review their status and saved cost there.',
        };
        setMessage(result.message);
        return result;
      }
      if (requests.length >= MAX_REQUESTS) {
        const result = { ok: false, message: 'Your tracker is full. Delete an old request before adding another.' };
        setMessage(result.message);
        return result;
      }
      if (validRequestRange(input.start, input.end) && !calendarCoversRequest(calendar, input.start, input.end)) {
        const result = { ok: false, message: 'These dates are outside the employer calendar loaded on this page. Choose dates within its coverage or extend the planning range first.' };
        setMessage(result.message);
        return result;
      }
      const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID() : `pto-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const request = create(id);
      if (!request) {
        const result = { ok: false, message: savedBreak
          ? 'The break no longer matches the loaded work calendar. Review the latest plan and try again.'
          : 'Choose valid dates and, for hourly requests, enter hours that fit the configured work shifts.' };
        setMessage(result.message);
        return result;
      }
      const persisted = persist([...requests, request]);
      const label = savedBreak ? 'Break saved as Considering' : 'PTO request tracked';
      const result = { ok: true, id, persisted, existing: false, message: persisted
        ? `${label} in this browser.`
        : `${label} for this visit. Browser storage is unavailable.` };
      setMessage(result.message);
      return result;
    }, { ok: false, message: WRITE_FAILED });
  }

  function addRequest(input: RequestInput, calendar: RequestCalendar) {
    return addEntry(input, calendar, id => createPtoRequest(input, calendar, id));
  }

  function saveBreak(input: SavedBreakInput, calendar: RequestCalendar) {
    return addEntry(input, calendar, id => createSavedBreakRequest(input, calendar, id), true);
  }

  function updateRequest(id: string, patch: Partial<RequestInput>, calendar: RequestCalendar, expectedUpdatedAt?: string): LedgerAction<boolean> {
    return mutate((requests, persist) => {
      const current = requests.find((r) => r.id === id);
      if (!current) return false;
      if (expectedUpdatedAt !== undefined && current.updatedAt !== expectedUpdatedAt) {
        setMessage('This request changed while you were reviewing it. Check the current request before trying again.');
        return false;
      }
      const start = patch.start ?? current.start;
      const end = patch.end ?? current.end;
      if (!validRequestRange(start, end)) {
        setMessage('Choose valid start and end dates in order. The saved dates have not changed.');
        return false;
      }
      const editsDates = start !== current.start || end !== current.end;
      let updated: PtoRequest;
      if (editsDates) {
        const pricedCalendar = calendarForSavedRequest(current, calendar);
        if (!pricedCalendar) {
          setMessage('To change these hourly request dates, open My PTO and use its hourly request calendar.');
          return false;
        }
        if (!calendarCoversRequest(calendar, start, end)) {
          setMessage('These dates are outside the employer calendar loaded on this page. The saved request and PTO cost have not changed.');
          return false;
        }
        if (requests.some((r) => r.id !== id && r.start === start && r.end === end)) {
          setMessage('Another request already uses those dates. Choose a different range.');
          return false;
        }
        const recalculated = createPtoRequest({ ...current, ...patch, start, end }, pricedCalendar, id);
        if (!recalculated) {
          setMessage('These dates or hours do not fit the configured work shifts. The saved request has not changed.');
          return false;
        }
        updated = { ...recalculated, createdAt: current.createdAt };
      } else {
        // Correcting a status or note must not require historical holiday coverage or
        // recalculate the cost using a calendar the user may since have changed.
        const status = patch.status ?? current.status;
        if (!REQUEST_STATUSES.includes(status)) return false;
        updated = { ...current, status, note: patch.note === undefined ? current.note : patch.note.slice(0, 1000), updatedAt: new Date().toISOString() };
      }
      const saved = persist(requests.map((r) => r.id === id ? updated : r));
      setMessage(saved ? 'Request updated in this browser.' : 'Request updated for this visit. Browser storage is unavailable.');
      return true;
    }, false);
  }

  function deleteRequest(id: string) {
    return mutate((requests, persist) => {
      const saved = persist(requests.filter((r) => r.id !== id));
      setMessage(saved ? 'Request deleted.' : 'Request removed for this visit. Browser storage is unavailable.');
    }, undefined);
  }

  return { requests: state.requests, storageAvailable: state.available, storageNotice: ledgerStorageNotice(state), message, addRequest, saveBreak, updateRequest, deleteRequest };
}

export type RequestLedgerState = ReturnType<typeof useRequestLedger>;
