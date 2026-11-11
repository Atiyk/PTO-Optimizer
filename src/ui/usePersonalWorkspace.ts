import { useEffect, useState } from 'react';
import { browserRequestStorage } from '../personal/requestLedger';
import {
  BALANCE_BASIS_CHANGED, BALANCE_BASIS_STORAGE_KEY, readBalanceBasisPreference, readWorkdaySchedulePreference,
  writeBalanceBasisPreference, writeWorkdaySchedulePreference, type WorkdaySchedule,
} from '../personal/workspace';
import { initialPolicyPreferences } from '../personal/policyPreferences';
import { useRequestLedger } from './useRequestLedger';

/** Shared setting first; a policy saved before the shared setting existed is the tolerant fallback. */
export function readBrowserBalanceBasis(): boolean {
  const shared = readBalanceBasisPreference(browserRequestStorage());
  if (shared !== undefined) return shared;
  if (typeof window === 'undefined') return false;
  try { return initialPolicyPreferences('', 'US').balanceIncludesApprovedLeave === true; } catch { return false; }
}

/** My PTO publishes its live setting so the planner and family planner read the same rule. */
export function publishBalanceBasis(includesApprovedLeave: boolean): void {
  if (readBalanceBasisPreference(browserRequestStorage()) === includesApprovedLeave) return;
  if (writeBalanceBasisPreference(includesApprovedLeave, browserRequestStorage()) && typeof window !== 'undefined') {
    window.dispatchEvent(new Event(BALANCE_BASIS_CHANGED));
  }
}

export function readBrowserWorkdaySchedule(): WorkdaySchedule | undefined {
  return readWorkdaySchedulePreference(browserRequestStorage());
}

/** My PTO publishes the hourly schedule it prices requests with, so planners convert hours the same way. */
export function publishWorkdaySchedule(schedule: WorkdaySchedule): void {
  if (JSON.stringify(readBrowserWorkdaySchedule()) === JSON.stringify(schedule)) return;
  if (writeWorkdaySchedulePreference(schedule, browserRequestStorage()) && typeof window !== 'undefined') {
    window.dispatchEvent(new Event(BALANCE_BASIS_CHANGED));
  }
}

/**
 * The personal workspace for a view: the live request ledger plus the balance basis
 * every derivation in src/personal/workspace.ts needs. Local to this browser.
 */
export function usePersonalWorkspace() {
  const ledger = useRequestLedger();
  const [includesApprovedLeave, setIncludesApprovedLeave] = useState(readBrowserBalanceBasis);
  const [schedule, setSchedule] = useState(readBrowserWorkdaySchedule);
  useEffect(() => {
    const refresh = () => {
      setIncludesApprovedLeave(readBrowserBalanceBasis());
      const next = readBrowserWorkdaySchedule();
      setSchedule(current => JSON.stringify(current) === JSON.stringify(next) ? current : next);
    };
    const onStorage = (event: StorageEvent) => { if (event.key === BALANCE_BASIS_STORAGE_KEY || event.key === null) refresh(); };
    window.addEventListener(BALANCE_BASIS_CHANGED, refresh);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(BALANCE_BASIS_CHANGED, refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  return { ledger, requests: ledger.requests, includesApprovedLeave, schedule };
}
