import { isValidISODate } from './urlState';
/**
 * Phase 4B: URL round-tripping for /sabbatical, same conventions as src/ui/urlState.ts
 * (the main app's own full-state encoding) - clamp to a sane range on read rather than
 * trusting an arbitrary query string, and only write params that actually differ from
 * what a fresh visit would compute, so a plain `/sabbatical` link still looks plain.
 * `country` and `eligibleFrom` are left undefined when absent (the component's own
 * geolocation/today default takes over, same pattern as /pto's `c`/`s`) rather than
 * given a fixed default here, since both are relative to the viewer, not a constant.
 */
export interface SabbaticalURLState {
  country?: string;
  lengthWeeks: number;
  eligibleFrom?: string;
  ptoToAdd: number;
  unpaidWeeksToAdd: number;
  /** The selected placement's own start date, not an index - indices can reorder when
   * ranking inputs change, but a start date still identifies "the same window" (or simply
   * fails to match anything, falling back to the top-ranked placement). */
  selectedStart?: string;
}

const DEFAULT_LENGTH_WEEKS = 4;
const DEFAULT_PTO_TO_ADD = 5;
const DEFAULT_UNPAID_WEEKS = 0;

function clampedInt(value: string | null, min: number, max: number, fallback: number): number {
  if (value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

export function readSabbaticalStateFromURL(search: string): SabbaticalURLState {
  const params = new URLSearchParams(search);
  const country = params.get('c');
  return {
    country: country && /^[A-Z]{2}$/.test(country) ? country : undefined,
    lengthWeeks: clampedInt(params.get('len'), 1, 52, DEFAULT_LENGTH_WEEKS),
    eligibleFrom: params.get('s') && isValidISODate(params.get('s')!) ? params.get('s')! : undefined,
    ptoToAdd: clampedInt(params.get('pto'), 0, 15, DEFAULT_PTO_TO_ADD),
    unpaidWeeksToAdd: clampedInt(params.get('unpaid'), 0, 52, DEFAULT_UNPAID_WEEKS),
    selectedStart: params.get('sel') && isValidISODate(params.get('sel')!) ? params.get('sel')! : undefined,
  };
}

type SabbaticalPlanInput = Required<SabbaticalURLState>;

export function writeSabbaticalStateToURL(params: URLSearchParams, state: SabbaticalPlanInput): void {
  params.set('c', state.country);
  params.set('len', String(state.lengthWeeks));
  params.set('s', state.eligibleFrom);
  params.set('pto', String(state.ptoToAdd));
  params.set('unpaid', String(state.unpaidWeeksToAdd));
  params.set('sel', state.selectedStart);
}

export function sabbaticalPlanSearch(state: SabbaticalPlanInput): string {
  const params = new URLSearchParams();
  writeSabbaticalStateToURL(params, state);
  return params.toString();
}
