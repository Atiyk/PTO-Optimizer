import { defaultPolicyURLState, readPolicyStateFromURL, type PolicyURLState } from '../ui/policyUrlState';

const KEY = 'gapless.personal.policy.v1';
const PARAMS = new Set(['ak', 'am', 'cb', 'bao', 'c', 'u', 'hpd', 'fq', 'pda', 'gd', 'hr', 'twh', 'edy', 'py', 'as', 'crd', 'ace', 'ac', 'cm', 'cc', 'cue', 'cub', 'wpe', 'wpd', 'nba', 'pol', 'pd', 'car', 'ww', 'sd', 'afs']);

export function initialPolicyPreferences(search: string, country: string): PolicyURLState {
  const incoming = new URLSearchParams(search);
  if ([...incoming.keys()].some(key => PARAMS.has(key))) return readPolicyStateFromURL(search, country);
  try {
    const raw = localStorage.getItem(KEY);
    if (raw && raw.length <= 16000) {
      const saved = JSON.parse(raw);
      if (saved.version === 1 && typeof saved.search === 'string') {
        const params = new URLSearchParams(saved.search);
        if (incoming.has('fd')) params.set('fd', incoming.get('fd')!);
        return readPolicyStateFromURL(params.toString(), country);
      }
    }
  } catch { /* The quick forecast also works without browser storage. */ }
  return { ...defaultPolicyURLState(), country, currentBalance: 0, carryoverMode: 'all', accrualCapEnabled: false, forecastDate: readPolicyStateFromURL(search, country).forecastDate };
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
