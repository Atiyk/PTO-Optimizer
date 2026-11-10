import { useEffect, useRef, useState } from 'react';
import {
  MAX_REQUESTS, REQUEST_CHANGE_EVENT, REQUEST_STORAGE_KEY, REQUEST_STATUSES, browserRequestStorage, calendarCoversRequest, createPtoRequest,
  readRequestLedger, validRequestRange,
  type PtoRequest, type RequestCalendar, type RequestInput,
} from '../personal/requestLedger';
import { persistBrowserRequests, withWalletLedgerLock, type LedgerAction } from '../integration/browserWalletStore';

type LedgerChange = { requests: PtoRequest[]; available: boolean };
export interface LedgerActionResult { ok: boolean; id?: string; message: string }
const WRITE_FAILED = 'Browser storage could not be coordinated. Your saved requests are unchanged. Try again.';

export function useRequestLedger() {
  const [state, setState] = useState(() => readRequestLedger());
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
      if (live.current.available && (event.key === REQUEST_STORAGE_KEY || event.key === null)) {
        const stored = readRequestLedger();
        if (stored.available) apply(stored);
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
        const canPersist = live.current.available && stored.available;
        const requests = canPersist ? stored.requests : live.current.requests;
        return apply(requests, (updated) => {
          const available = canPersist && persistBrowserRequests(updated, storage);
          const next = { requests: updated, available };
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

  function addRequest(input: RequestInput, calendar: RequestCalendar): LedgerAction<LedgerActionResult> {
    return mutate<LedgerActionResult>((requests, persist) => {
      const duplicate = requests.find((r) => r.start === input.start && r.end === input.end);
      if (duplicate) {
        const result = { ok: false, id: duplicate.id, message: 'These dates are already tracked. You can edit their status below.' };
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
      const request = createPtoRequest(input, calendar, id);
      if (!request) {
        const result = { ok: false, message: 'Choose valid dates and, for hourly requests, enter hours that fit the configured work shifts.' };
        setMessage(result.message);
        return result;
      }
      const saved = persist([...requests, request]);
      const result = { ok: true, id, message: saved ? 'PTO request tracked in this browser.' : 'PTO request tracked for this visit. Browser storage is unavailable.' };
      setMessage(result.message);
      return result;
    }, { ok: false, message: WRITE_FAILED });
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
      const editsDates = patch.start !== undefined || patch.end !== undefined;
      let updated: PtoRequest;
      if (editsDates) {
        if (current.ptoMinutes !== undefined && calendar.shiftMinutes === undefined) {
          setMessage('To change these hourly request dates, open My PTO and use its hourly request calendar.');
          return false;
        }
        if (!calendarCoversRequest(calendar, start, end)) {
          setMessage('These dates are outside the employer calendar loaded on this page. The saved request and PTO cost have not changed.');
          return false;
        }
        const recalculated = createPtoRequest({ ...current, ...patch, start, end }, calendar, id);
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

  return { requests: state.requests, storageAvailable: state.available, message, addRequest, updateRequest, deleteRequest };
}

export type RequestLedgerState = ReturnType<typeof useRequestLedger>;
