import { findTerm } from '../content/glossary/terms';
import { defaultPolicyURLState, readPolicyStateFromURL, type PolicyURLState } from '../ui/policyUrlState';

const KEY = 'gapless.personal.policy.v1';
const HISTORY_KEY = 'timeOffPolicyDraft';
const PARAMS = new Set(['ak', 'am', 'cb', 'bao', 'c', 'u', 'hpd', 'fq', 'pda', 'gd', 'hr', 'twh', 'edy', 'py', 'as', 'crd', 'ace', 'ac', 'cm', 'cc', 'cue', 'cub', 'wpe', 'wpd', 'nba', 'pol', 'pd', 'car', 'ww', 'sd', 'afs', 'bap', 'shm']);

export function initialPolicyPreferences(search: string, country: string, draftSearch?: unknown): PolicyURLState {
  const incoming = new URLSearchParams(search);
  const explicit = [...incoming.keys()].some(key => key !== 'c' && PARAMS.has(key));
  if (explicit) return readPolicyStateFromURL(search, country);

  const restore = (savedSearch: string) => {
    const params = new URLSearchParams(savedSearch);
    for (const key of ['c', 'fd']) if (incoming.has(key)) params.set(key, incoming.get(key)!);
    return readPolicyStateFromURL(params.toString(), country);
  };
  if (typeof draftSearch === 'string' && draftSearch.length <= 14000) return restore(draftSearch);
  try {
    const raw = localStorage.getItem(KEY);
    if (raw && raw.length <= 16000) {
      const saved = JSON.parse(raw);
      if (saved.version === 1 && typeof saved.search === 'string') return restore(saved.search);
    }
  } catch { /* The quick forecast also works without browser storage. */ }
  const publicState = readPolicyStateFromURL(search, country);
  return { ...defaultPolicyURLState(), country: publicState.country, currentBalance: 0, balanceEntered: false, carryoverMode: 'all', accrualCapEnabled: false, forecastDate: publicState.forecastDate };
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

export function savePolicyPreferences(search: string): boolean {
  if (search.length > 14000) return false;
  const safe = new URLSearchParams();
  for (const [key, value] of new URLSearchParams(search)) if (PARAMS.has(key) || key === 'fd') safe.set(key, value);
  try { localStorage.setItem(KEY, JSON.stringify({ version: 1, search: safe.toString() })); return true; }
  catch { return false; }
}

export function deletePolicyPreferences(): boolean {
  try { localStorage.removeItem(KEY); return true; } catch { return false; }
}
