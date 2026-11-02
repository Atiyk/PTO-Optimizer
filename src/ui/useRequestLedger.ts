import { useEffect, useState } from 'react';
import {
  MAX_REQUESTS, REQUEST_CHANGE_EVENT, REQUEST_STORAGE_KEY, REQUEST_STATUSES, calendarCoversRequest, createPtoRequest, parseRequestLedger,
  readRequestLedger, validRequestRange, writeRequestLedger,
  type PtoRequest, type RequestCalendar, type RequestInput,
} from '../personal/requestLedger';

type LedgerChange = { requests: PtoRequest[]; available: boolean };
export interface LedgerActionResult { ok: boolean; id?: string; message: string }

export function useRequestLedger() {
  const [state, setState] = useState(() => {
    const stored = readRequestLedger();
    return { requests: stored.requests, available: stored.available };
  });
  const [message, setMessage] = useState('');

  useEffect(() => {
    const onChange = (event: Event) => {
      const change = (event as CustomEvent<LedgerChange>).detail;
      if (change) setState(change);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === REQUEST_STORAGE_KEY || event.key === null) {
        setState({ requests: parseRequestLedger(event.newValue), available: true });
      }
    };
    window.addEventListener(REQUEST_CHANGE_EVENT, onChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(REQUEST_CHANGE_EVENT, onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  function persist(requests: PtoRequest[]) {
    const available = writeRequestLedger(requests);
    const next = { requests, available };
    setState(next);
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<LedgerChange>(REQUEST_CHANGE_EVENT, { detail: next }));
    return available;
  }

  function addRequest(input: RequestInput, calendar: RequestCalendar): LedgerActionResult {
    const duplicate = state.requests.find((r) => r.start === input.start && r.end === input.end);
    if (duplicate) {
      const result = { ok: false, id: duplicate.id, message: 'These dates are already tracked. You can edit their status below.' };
      setMessage(result.message);
      return result;
    }
    if (state.requests.length >= MAX_REQUESTS) {
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
      const result = { ok: false, message: 'Choose valid start and end dates, in order, spanning no more than three years.' };
      setMessage(result.message);
      return result;
    }
    const saved = persist([...state.requests, request]);
    const result = { ok: true, id, message: saved ? 'PTO request tracked in this browser.' : 'PTO request tracked for this visit. Browser storage is unavailable.' };
    setMessage(result.message);
    return result;
  }

  function updateRequest(id: string, patch: Partial<RequestInput>, calendar: RequestCalendar): boolean {
    const current = state.requests.find((r) => r.id === id);
    if (!current) return false;
    const start = patch.start ?? current.start;
    const end = patch.end ?? current.end;
    if (!validRequestRange(start, end)) {
      setMessage('Choose valid start and end dates in order. The saved dates have not changed.');
      return false;
    }
    const editsDates = patch.start !== undefined || patch.end !== undefined;
    let updated: PtoRequest;
    if (editsDates) {
      if (!calendarCoversRequest(calendar, start, end)) {
        setMessage('These dates are outside the employer calendar loaded on this page. The saved request and PTO cost have not changed.');
        return false;
      }
      const recalculated = createPtoRequest({ ...current, ...patch, start, end }, calendar, id);
      if (!recalculated) return false;
      updated = { ...recalculated, createdAt: current.createdAt };
    } else {
      // Correcting a status or note must not require historical holiday coverage or
      // recalculate the cost using a calendar the user may since have changed.
      const status = patch.status ?? current.status;
      if (!REQUEST_STATUSES.includes(status)) return false;
      updated = { ...current, status, note: patch.note === undefined ? current.note : patch.note.slice(0, 1000), updatedAt: new Date().toISOString() };
    }
    const saved = persist(state.requests.map((r) => r.id === id ? updated : r));
    setMessage(saved ? 'Request updated in this browser.' : 'Request updated for this visit. Browser storage is unavailable.');
    return true;
  }

  function deleteRequest(id: string) {
    const saved = persist(state.requests.filter((r) => r.id !== id));
    setMessage(saved ? 'Request deleted.' : 'Request removed for this visit. Browser storage is unavailable.');
  }

  return { requests: state.requests, storageAvailable: state.available, message, addRequest, updateRequest, deleteRequest };
}

export type RequestLedgerState = ReturnType<typeof useRequestLedger>;
