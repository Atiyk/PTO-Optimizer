/**
 * The single source of truth for which URL keys may leave this device.
 *
 * Every planning control still round-trips through a URL, but the URL has three audiences:
 *   - the browser address bar (seen in history, screenshots, referrers, server logs),
 *   - a public share link / calendar subscription / email link the user copies,
 *   - the private, on-device codec (history.state draft, localStorage).
 * Only keys listed here as public reach the first two. Anything else, including a key that
 * a future change adds without classifying it, is treated as private and stays on-device:
 * the format fails closed. shareFormat.test.ts fails when the codec emits an unclassified key.
 *
 * Public share format, version 1 (`sv=1`): the PLAN_SHARE_KEYS below, each validated by
 * buildPublicPlanSearch (src/ui/publicSharePrivacy.ts). `ho` (observed holiday dates, no
 * labels) is written only when the sender explicitly opts in for that copy.
 *
 * This module is a leaf (no imports) so urlState, publicSharePrivacy and familyUrlState
 * can all depend on it without cycles.
 */

export const PUBLIC_SHARE_VERSION = 1;

/**
 * - public: a planning assumption; written to the address bar and to public share links.
 * - share-only: written to a public share link only (the version marker, opt-in dates).
 * - address-only: harmless UI state kept in the address bar but never put in a share link.
 * - private: personal data; on-device only.
 */
export type UrlKeyClass = 'public' | 'share-only' | 'address-only' | 'private';

/** /pto planner keys, as written by writeFullStateToURL (src/ui/urlState.ts). */
export const PLAN_URL_KEYS: Readonly<Record<string, UrlKeyClass>> = Object.freeze({
  // Public planning assumptions.
  c: 'public', // country
  sd: 'public', // region / subdivision
  s: 'public', // date range start
  e: 'public', // date range end
  b: 'public', // PTO days budget to plan with
  w: 'public', // strategy slider
  count: 'public', // number of breaks slider
  pv: 'public', // planning engine version
  ps: 'public', // planning style
  mb: 'public', // minimum break length
  ws: 'public', // week start display
  ww: 'public', // workweek
  p: 'public', // pinned (must-include) days chosen in the planner
  af: 'public', // alternating Fridays on
  afs: 'public', // alternating Friday anchor
  rv: 'public', // reserve days kept back
  // Share-link only.
  sv: 'share-only', // public share format version
  ho: 'share-only', // observed holiday dates the sender opted to share, without labels
  // Address bar only.
  lp: 'address-only', // arrived from the landing preview
  // Private, on-device only.
  eh: 'private', // employer holiday calendar, custom names, exclusions
  hd: 'private', // landing holiday focus date
  pp: 'private', // received partner availability
  ov: 'private', // legacy partner overlap payload
  od: 'private', // partner overlap days
  bo: 'private', // blackout / private dates
  r: 'private', // ruled-out days
  ac: 'private', // accrual on
  am: 'private', // accrual per month
  ex: 'private', // expiry on
  xd: 'private', // expiry date
  cc: 'private', // carryover cap
  np: 'private', // employer notice period
  pc: 'private', // employer peak cap
  pcs: 'private',
  pce: 'private',
  pcm: 'private',
  up: 'private', // unlimited PTO policy
});

function keysWhere<T extends Record<string, UrlKeyClass>>(map: T, classes: readonly UrlKeyClass[]): readonly string[] {
  return Object.freeze(Object.keys(map).filter(key => classes.includes(map[key])));
}

export const PLAN_SHARE_KEYS = keysWhere(PLAN_URL_KEYS, ['public', 'share-only']);
export const PLAN_ADDRESS_KEYS = keysWhere(PLAN_URL_KEYS, ['public', 'address-only']);
export const PLAN_PRIVATE_KEYS = keysWhere(PLAN_URL_KEYS, ['private']);

const PLAN_ADDRESS_SET = new Set(PLAN_ADDRESS_KEYS);
const PLAN_SHARE_SET = new Set(PLAN_SHARE_KEYS);

export function isPlanAddressKey(key: string): boolean { return PLAN_ADDRESS_SET.has(key); }
export function isPlanShareKey(key: string): boolean { return PLAN_SHARE_SET.has(key); }

/** Split a full private plan query into the address-bar part and the on-device draft.
 * Unknown keys go to the draft. */
export function partitionPlanParams(full: URLSearchParams): { address: URLSearchParams; draft: URLSearchParams } {
  const address = new URLSearchParams();
  const draft = new URLSearchParams();
  for (const [key, value] of full) (isPlanAddressKey(key) ? address : draft).append(key, value);
  return { address, draft };
}

/** /family keys, as written by writeFamilyStateToURL (src/ui/familyUrlState.ts). */
export const FAMILY_URL_KEYS: Readonly<Record<string, UrlKeyClass>> = Object.freeze({
  c: 'public',
  s: 'public',
  pto: 'public', // PTO days to plan with
  cp: 'public', // prioritise coverage
  ask: 'public', // "send me your school dates" request marker
  d: 'private', // school district
  sd: 'private', // school closure dates
  x: 'private', // excluded breaks
  pp: 'private', // other adult's availability
});

export const FAMILY_ADDRESS_KEYS = keysWhere(FAMILY_URL_KEYS, ['public', 'address-only']);
const FAMILY_ADDRESS_SET = new Set(FAMILY_ADDRESS_KEYS);

export function partitionFamilyParams(full: URLSearchParams): { address: URLSearchParams; draft: URLSearchParams } {
  const address = new URLSearchParams();
  const draft = new URLSearchParams();
  for (const [key, value] of full) (FAMILY_ADDRESS_SET.has(key) ? address : draft).append(key, value);
  return { address, draft };
}

/** /policy (My PTO): balances, accrual, pay schedule and planned days are all private.
 * The address bar keeps only the country plus the sign-in outcome and glossary highlight. */
export const POLICY_ADDRESS_KEYS = Object.freeze(['c', 'signin', 'highlight'] as const);
export const POLICY_PRIVATE_KEYS = Object.freeze([
  'ak', 'am', 'cb', 'bao', 'u', 'hpd', 'fq', 'pda', 'gd', 'hr', 'twh', 'edy', 'py', 'as', 'crd',
  'ace', 'ac', 'cm', 'cc', 'cue', 'cub', 'wpe', 'wpd', 'nba', 'pol', 'pd', 'car', 'ww', 'sd',
  'afs', 'bap', 'shm', 'fd',
] as const);
