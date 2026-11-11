import { findTerm } from '../content/glossary/terms';
import { guardedWrite, recordRevision, stampRecord } from './storageRecord';
import { POLICY_PRIVATE_KEYS } from '../ui/shareFormat';
import { defaultPolicyURLState, readPolicyStateFromURL, type PolicyURLState } from '../ui/policyUrlState';

export const POLICY_STORAGE_KEY = 'gapless.personal.policy.v1';
const KEY = POLICY_STORAGE_KEY;
const HISTORY_KEY = 'timeOffPolicyDraft';
// Saved/draft policy keys: the country plus every private policy key except the
// forecast date, which is handled on its own (src/ui/shareFormat.ts).
const PARAMS = new Set<string>(['c', ...POLICY_PRIVATE_KEYS.filter(key => key !== 'fd')]);

type PolicyRecordState = 'ok' | 'unreadable' | 'newer-version';

function policyRecordState(raw: string): PolicyRecordState {
  try {
    if (raw.length > 16000) return 'unreadable';
    const saved: unknown = JSON.parse(raw);
    if (!saved || typeof saved !== 'object') return 'unreadable';
    const { version, search } = saved as Record<string, unknown>;
    if (typeof version === 'number' && version > 1) return 'newer-version';
    return version === 1 && typeof search === 'string' && search.length <= 14000 ? 'ok' : 'unreadable';
  } catch {
    return 'unreadable';
  }
}

/** The saved-policy revision this tab last loaded or wrote, for stale-save detection. */
let loadedRevision: string | undefined;
let loadedState: PolicyRecordState | 'missing' = 'missing';

function noteLoaded(): string | null {
  const raw = localStorage.getItem(KEY);
  loadedState = raw === null ? 'missing' : policyRecordState(raw);
  return raw;
}

/**
 * The policy page calls this once when it loads its inputs from the saved policy, so a
 * later save can tell whether another tab has saved since. Other readers (planners) do not.
 */
export function rememberLoadedPolicy(): void {
  try { loadedRevision = recordRevision(noteLoaded()); } catch { loadedRevision = undefined; }
}

/** A non-destructive notice about the saved policy this page loaded, if any. */
export function policyStorageNotice(): string | undefined {
  if (loadedState === 'unreadable') return 'Your saved policy in this browser could not be read. It is kept as it was; saving keeps a copy of it in this browser first.';
  if (loadedState === 'newer-version') return 'Your policy was saved by a newer version of Gapless. Reload this page to use it; saving here will not overwrite it.';
  return undefined;
}

export function initialPolicyPreferences(search: string, country: string, draftSearch?: unknown): PolicyURLState {
  let raw: string | null = null;
  try { raw = noteLoaded(); } catch { /* Storage may be disabled. */ }
  const incoming = new URLSearchParams(search);
  const explicit = [...incoming.keys()].some(key => key !== 'c' && PARAMS.has(key));
  if (explicit) return readPolicyStateFromURL(search, country);

  const restore = (savedSearch: string) => {
    const params = new URLSearchParams(savedSearch);
    for (const key of ['c', 'fd']) if (incoming.has(key)) params.set(key, incoming.get(key)!);
    return readPolicyStateFromURL(params.toString(), country, true);
  };
  if (typeof draftSearch === 'string' && draftSearch.length <= 14000) return restore(draftSearch);
  try {
    if (raw && raw.length <= 16000) {
      const saved = JSON.parse(raw);
      if (saved.version === 1 && typeof saved.search === 'string' && saved.search.length <= 14000) return restore(saved.search);
    }
  } catch { /* The quick forecast also works without browser storage. */ }
  const publicState = readPolicyStateFromURL(search, country);
  return {
    ...defaultPolicyURLState(), country: publicState.country, currentBalance: 0, balanceEntered: false,
    amount: NaN, payDateAnchor: '', grantDate: '', hourlyRate: NaN, typicalWeeklyHours: NaN,
    carryoverMode: 'all', accrualCapEnabled: false, forecastDate: publicState.forecastDate,
  };
}

/** A history entry keeps the same-tab draft on reload without making it shareable
 * or silently replacing the policy the user explicitly saved in browser storage. */
export function readBrowserPolicyDraft(): unknown {
  if (typeof window === 'undefined') return undefined;
  return window.history.state?.[HISTORY_KEY];
}

export function keepPrivatePolicyDraft(search: string, country: string): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const signin = url.searchParams.get('signin');
  const highlight = url.searchParams.get('highlight');
  url.search = '';
  url.searchParams.set('c', country);
  if (signin === 'ok' || signin === 'expired') url.searchParams.set('signin', signin);
  if (highlight && findTerm(highlight)) url.searchParams.set('highlight', highlight);
  const current = window.history.state;
  window.history.replaceState({ ...current, [HISTORY_KEY]: search }, '', url);
}

export type PolicySaveResult = 'saved' | 'stale' | 'newer-version' | 'unavailable';

/**
 * Explicit save with stale-write detection. 'stale' means another tab saved a different
 * policy after this page loaded one: nothing is overwritten, and a repeated save (after
 * the user has seen the notice) replaces it deliberately.
 */
export function writePolicyPreferences(search: string): PolicySaveResult {
  if (search.length > 14000) return 'unavailable';
  const safe = new URLSearchParams();
  for (const [key, value] of new URLSearchParams(search)) if (PARAMS.has(key) || key === 'fd') safe.set(key, value);
  let storage: Storage;
  try { storage = localStorage; } catch { return 'unavailable'; }
  const result = guardedWrite(storage, KEY, stampRecord({ version: 1, search: safe.toString() }), {
    expectedRevision: loadedRevision,
    isClean: raw => policyRecordState(raw) === 'ok',
    isNewer: raw => policyRecordState(raw) === 'newer-version',
  });
  if (result.status === 'saved') { loadedRevision = result.revision; loadedState = 'ok'; }
  else if (result.status === 'stale') { try { loadedRevision = recordRevision(storage.getItem(KEY)); } catch { /* unchanged */ } }
  return result.status;
}

export function savePolicyPreferences(search: string): boolean {
  return writePolicyPreferences(search) === 'saved';
}

export function deletePolicyPreferences(): boolean {
  try { localStorage.removeItem(KEY); loadedRevision = 'missing'; loadedState = 'missing'; return true; } catch { return false; }
}
