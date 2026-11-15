import { useCallback, useEffect, useRef, useState } from 'react';
import {
  deleteEmployerCalendar, employerScope, freshEmployerCalendar, hasStoredEmployerCalendar,
  readEmployerCalendar, writeEmployerCalendar, type EmployerCalendar,
} from '../personal/employerCalendar';
import { toggleHolidayChoice, type HolidayChoice, type HolidayEntry } from '../personal/employerHolidayChoices';
import { employerPlaceLabel } from '../personal/holidayDisplayNames';
import { track } from './analytics';

export interface EmployerHolidayProfile {
  calendar: EmployerCalendar;
  toggle: (choice: HolidayChoice, entries: readonly HolidayEntry[]) => void;
  reset: () => void;
  undo: () => void;
  canUndo: boolean;
  status: string;
}

const SAVE_DELAY_MS = 400;

/**
 * The saved employer calendar for one country/region, editable in place: edits apply at
 * once and save to this browser after a short pause (and when the page is hidden). Used by
 * the homepage preview; /pto keeps its own copy in useAppState with the same storage.
 */
export function useEmployerHolidayProfile(country: string, subdivision?: string): EmployerHolidayProfile {
  const scope = employerScope(country, subdivision);
  const [state, setState] = useState(() => ({ scope, calendar: readEmployerCalendar(country, subdivision) }));
  const [status, setStatus] = useState(() => hasStoredEmployerCalendar(country, subdivision) ? `Saved for ${employerPlaceLabel(country, subdivision)}.` : '');
  const [undoTo, setUndoTo] = useState<EmployerCalendar | null>(null);
  const pending = useRef(false);
  const latest = useRef(state.calendar);
  // A new country starts from that country's saved calendar.
  if (state.scope !== scope) {
    setState({ scope, calendar: readEmployerCalendar(country, subdivision) });
    setUndoTo(null);
    setStatus(hasStoredEmployerCalendar(country, subdivision) ? `Saved for ${employerPlaceLabel(country, subdivision)}.` : '');
  }
  const calendar = state.scope === scope ? state.calendar : readEmployerCalendar(country, subdivision);
  latest.current = calendar;

  const flush = useCallback(() => {
    if (!pending.current) return;
    pending.current = false;
    const value = latest.current;
    const result = writeEmployerCalendar(value);
    setStatus(result === 'saved' ? `Saved for ${employerPlaceLabel(value.country, value.subdivision)}.`
      : result === 'stale' ? 'Another tab changed these holidays. Nothing was overwritten; your next change here will save.'
        : 'Browser storage is unavailable. Your choices apply to this page only.');
  }, []);
  useEffect(() => {
    if (!pending.current) return;
    const timer = window.setTimeout(flush, SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [calendar, flush]);
  useEffect(() => {
    window.addEventListener('pagehide', flush);
    return () => { window.removeEventListener('pagehide', flush); flush(); };
  }, [flush]);

  const set = useCallback((next: EmployerCalendar, previous: EmployerCalendar | null) => {
    pending.current = true;
    setUndoTo(previous);
    setState({ scope, calendar: next });
  }, [scope]);

  return {
    calendar,
    status,
    canUndo: undoTo !== null,
    toggle: (choice, entries) => {
      set(toggleHolidayChoice(calendar, choice, entries), calendar);
      track('holiday_preference_customized');
    },
    undo: () => { if (undoTo) set(undoTo, null); },
    reset: () => {
      pending.current = false;
      setUndoTo(calendar);
      setState({ scope, calendar: freshEmployerCalendar(country, subdivision) });
      setStatus(deleteEmployerCalendar(country, subdivision) ? `Reset to public holidays for ${employerPlaceLabel(country, subdivision)}.` : 'Public holidays restored for this page.');
    },
  };
}
