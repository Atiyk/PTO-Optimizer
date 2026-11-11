import { useCallback, useEffect, useRef, useState } from 'react';
import { isValidWorkWeek, type WorkWeek } from '@daysoff/engine/solver/types';
import { encodeEmployerCalendar, decodeEmployerCalendar, employerScope } from '../personal/employerCalendar';
import { DEFAULT_NOTICE_PERIOD_DAYS } from '../personal/outOfOffice';
import type { PlanSnapshot } from './useAppState';
import { isValidISODate } from './urlState';
import { validateInputs } from './validation';

export const PINNED_PLANS_STORAGE_KEY = 'gapless.personal.pinned-plans.v1';
export const MAX_PINNED_PLANS = 2;
const MAX_STORAGE_LENGTH = 350_000;
const CHANGE_EVENT = 'gapless:pinned-plans-changed';
const STYLES = ['balanced', 'long-breaks', 'more-breaks', 'custom'];
const BOOLEAN_FIELDS = [
  'letSolverDecide', 'accrualEnabled', 'expiryEnabled', 'altFridayEnabled',
  'applyTrackedRequests', 'reserveApprovedPto', 'unlimitedPto', 'peakCapEnabled',
] as const;
const NUMBER_FIELDS = [
  'minimumBreakDays', 'budget', 'w', 'manualBreakCount', 'accrualPerMonth', 'carryoverCap', 'reserveDays', 'peakCapMaxDays',
] as const;

interface SavedPlan {
  id: string;
  snapshot: PlanSnapshot;
}

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const amount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const date = (value: unknown): value is string => typeof value === 'string' && isValidISODate(value);
const dateList = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 4000 && value.every(date);

function parseSnapshot(value: unknown): PlanSnapshot | null {
  if (!record(value) || typeof value.country !== 'string' || !/^[A-Z]{2}$/.test(value.country)
    || (value.subdivision !== undefined && (typeof value.subdivision !== 'string' || !/^[A-Z0-9-]{1,16}$/.test(value.subdivision)))
    || (value.planningVersion !== undefined && value.planningVersion !== 2)
    || typeof value.planningStyle !== 'string' || !STYLES.includes(value.planningStyle)
    || ![0, 1, 'auto'].includes(value.weekStartOverride as string | number)
    || !BOOLEAN_FIELDS.every(key => typeof value[key] === 'boolean')
    || !NUMBER_FIELDS.every(key => amount(value[key]))
    || (value.noticePeriodDays !== undefined && !amount(value.noticePeriodDays))
    || (value.noticeUnit !== undefined && value.noticeUnit !== 'calendar' && value.noticeUnit !== 'working')
    || !date(value.rangeStart) || !date(value.rangeEnd)
    || typeof value.expiryDate !== 'string'
    || ![value.expiryDate, value.altFridayStart, value.peakCapStart, value.peakCapEnd].every(v => v === '' || date(v))
    || !Array.isArray(value.workWeek) || !isValidWorkWeek(value.workWeek)
    || !dateList(value.overlapDays) || !dateList(value.blackouts) || !record(value.forced)
    || Object.keys(value.forced).length > 4000
    || !Object.entries(value.forced).every(([day, force]) => date(day) && (force === 'include' || force === 'exclude'))
    || !record(value.summary)
    || ![value.summary.budgetSpent, value.summary.totalDaysOff, value.summary.breakCountActual].every(amount)
    || !(value.summary.travelPercentile === null || (amount(value.summary.travelPercentile) && value.summary.travelPercentile <= 100))
    || !record(value.employerCalendar)) return null;

  const snapshot = value as unknown as PlanSnapshot;
  if (validateInputs({
    rangeStart: snapshot.rangeStart, rangeEnd: snapshot.rangeEnd, budget: snapshot.budget,
    expiryEnabled: snapshot.expiryEnabled, expiryDate: snapshot.expiryDate, workWeek: value.workWeek as WorkWeek,
  }).length) return null;

  const employerCalendar = decodeEmployerCalendar(encodeEmployerCalendar(snapshot.employerCalendar));
  if (!employerCalendar || employerScope(employerCalendar.country, employerCalendar.subdivision) !== employerScope(snapshot.country, snapshot.subdivision)) return null;
  return { ...snapshot, employerCalendar, noticePeriodDays: value.noticePeriodDays ?? DEFAULT_NOTICE_PERIOD_DAYS } as PlanSnapshot;
}

/** A corrupt or unrecognized value is left intact, while new pins can work for this visit. */
function readPlans(): SavedPlan[] | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(PINNED_PLANS_STORAGE_KEY);
    if (raw === null) return [];
    if (raw.length > MAX_STORAGE_LENGTH) return null;
    const data: unknown = JSON.parse(raw);
    if (!record(data) || data.version !== 1 || !Array.isArray(data.plans) || data.plans.length > MAX_PINNED_PLANS) return null;
    const plans: SavedPlan[] = [];
    for (const entry of data.plans) {
      if (!record(entry) || typeof entry.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(entry.id)
        || plans.some(plan => plan.id === entry.id)) return null;
      const snapshot = parseSnapshot(entry.snapshot);
      if (!snapshot) return null;
      plans.push({ id: entry.id, snapshot });
    }
    return plans;
  } catch {
    return null;
  }
}

function writePlans(plans: SavedPlan[]): boolean {
  try {
    const raw = JSON.stringify({ version: 1, plans });
    if (raw.length > MAX_STORAGE_LENGTH) return false;
    window.localStorage.setItem(PINNED_PLANS_STORAGE_KEY, raw);
    return true;
  } catch {
    return false;
  }
}

export function usePinnedPlans() {
  const [state, setState] = useState(() => {
    const saved = readPlans();
    return { plans: saved ?? [], persistent: saved !== null };
  });
  const live = useRef(state);
  const [pinMessage, setPinMessage] = useState('');

  const apply = useCallback((next: typeof state) => {
    live.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    function refresh() {
      if (!live.current.persistent) return;
      const plans = readPlans();
      if (plans) apply({ plans, persistent: true });
    }
    function onStorage(event: StorageEvent) {
      if (event.key === PINNED_PLANS_STORAGE_KEY || event.key === null) refresh();
    }
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, [apply]);

  const mutate = useCallback((update: (plans: SavedPlan[]) => SavedPlan[], label: string, unchanged: string) => {
    function change() {
      const saved = live.current.persistent ? readPlans() : null;
      const current = saved ?? live.current.plans;
      const plans = update(current);
      if (plans === current) {
        if (saved) apply({ plans, persistent: true });
        setPinMessage(unchanged);
        return;
      }
      const persistent = saved !== null && writePlans(plans);
      apply({ plans, persistent });
      if (persistent) window.dispatchEvent(new Event(CHANGE_EVENT));
      setPinMessage(persistent ? `${label} in this browser.` : `${label} for this visit. Browser storage is unavailable.`);
    }
    if (typeof navigator.locks?.request === 'function') {
      void navigator.locks.request(PINNED_PLANS_STORAGE_KEY, change).catch(() => setPinMessage('Browser storage could not be coordinated. Try again.'));
    } else {
      change();
    }
  }, [apply]);

  const addPinnedPlan = useCallback((plan: PlanSnapshot) => {
    const snapshot = parseSnapshot(plan);
    if (!snapshot) {
      setPinMessage('This plan has incomplete settings. Check the plan and try again.');
      return;
    }
    const id = globalThis.crypto?.randomUUID?.() ?? `pin-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    mutate(plans => plans.length >= MAX_PINNED_PLANS ? plans : [...plans, { id, snapshot }],
      'Plan saved', 'Remove a saved plan to make room for another.');
  }, [mutate]);

  const removePinnedPlan = useCallback((index: number) => {
    const id = state.plans[index]?.id;
    if (!id) return;
    mutate(plans => plans.some(plan => plan.id === id) ? plans.filter(plan => plan.id !== id) : plans,
      'Saved plan removed', 'This saved plan was already removed.');
  }, [mutate, state.plans]);

  return { pinnedPlans: state.plans.map(plan => plan.snapshot), addPinnedPlan, removePinnedPlan, pinMessage };
}
