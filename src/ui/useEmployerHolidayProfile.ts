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
  // Pending edits belong to their original country/region. Switching the
  // homepage country before the debounce fires must never save the new
  // country's calendar in place of the edited one.
  const pending = useRef(new Map<string, EmployerCalendar>());
  const activeScope = useRef(scope);
  activeScope.current = scope;
  // A new country starts from that country's saved calendar.
  if (state.scope !== scope) {
    setState({ scope, calendar: readEmployerCalendar(country, subdivision) });
    setUndoTo(null);
    setStatus(hasStoredEmployerCalendar(country, subdivision) ? `Saved for ${employerPlaceLabel(country, subdivision)}.` : '');
  }
  const calendar = state.scope === scope ? state.calendar : readEmployerCalendar(country, subdivision);

  const flush = useCallback(() => {
    if (pending.current.size === 0) return;
    const updates = [...pending.current.values()];
    pending.current.clear();
    for (const value of updates) {
      const result = writeEmployerCalendar(value);
      // A background save for the previous country must not overwrite the
      // currently visible country's save/status message.
      if (employerScope(value.country, value.subdivision) !== activeScope.current) continue;
      setStatus(result === 'saved' ? `Saved for ${employerPlaceLabel(value.country, value.subdivision)}.`
        : result === 'stale' ? 'Another tab changed these holidays. Nothing was overwritten; your next change here will save.'
          : 'Browser storage is unavailable. Your choices apply to this page only.');
    }
  }, []);
  useEffect(() => {
    if (pending.current.size === 0) return;
    const timer = window.setTimeout(flush, SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [calendar, flush]);
  useEffect(() => {
    window.addEventListener('pagehide', flush);
    return () => { window.removeEventListener('pagehide', flush); flush(); };
  }, [flush]);

  const set = useCallback((next: EmployerCalendar, previous: EmployerCalendar | null) => {
    pending.current.set(scope, next);
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
      pending.current.delete(scope);
      setUndoTo(calendar);
      setState({ scope, calendar: freshEmployerCalendar(country, subdivision) });
      setStatus(deleteEmployerCalendar(country, subdivision) ? `Reset to public holidays for ${employerPlaceLabel(country, subdivision)}.` : 'Public holidays restored for this page.');
    },
  };
}
