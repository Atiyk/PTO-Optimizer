// Maps the old, now-removed named objectives and shape presets to a sensible (w, breakCount)
// pair, so a previously-shared link still opens to something reasonable instead of erroring
// or silently ignoring the parameter.
const OLD_OBJECTIVE_TO_W: Record<string, number> = {
  'most-days-off': 0,
  'one-long-trip': 20,
  'avoid-peak': 90,
  'long-weekends': 30,
  'single-days': 30,
};
const OLD_OBJECTIVE_TO_BREAK_COUNT: Record<string, number> = {
  'most-days-off': 0,
  'one-long-trip': 1,
  'avoid-peak': 0,
  'long-weekends': 7,
  'single-days': 7,
};

export interface SliderURLState {
  w: number;
  breakCount: number;
}

/**
 * Reads w/breakCount from the URL's search params, migrating a legacy `objective` (and the
 * old `shape`/`minBreakLength` params some earlier share links may carry) into a sensible
 * (w, breakCount) pair rather than erroring on an unrecognised value.
 */
export function readSliderStateFromURL(search: string): SliderURLState {
  const params = new URLSearchParams(search);

  const wParam = params.get('w');
  const countParam = params.get('count');
  const legacyObjective = params.get('objective');

  let w = 30;
  let breakCount = 0;

  if (legacyObjective && legacyObjective in OLD_OBJECTIVE_TO_W) {
    w = OLD_OBJECTIVE_TO_W[legacyObjective];
    breakCount = OLD_OBJECTIVE_TO_BREAK_COUNT[legacyObjective];
  }

  if (wParam !== null) {
    const parsed = Number(wParam);
    if (Number.isFinite(parsed)) w = Math.max(0, Math.min(100, Math.round(parsed / 10) * 10));
  }
  if (countParam !== null) {
    const parsed = Number(countParam);
    if (Number.isFinite(parsed)) breakCount = Math.max(0, Math.min(7, Math.round(parsed)));
  }

  return { w, breakCount };
}

export function writeSliderStateToURL(params: URLSearchParams, state: SliderURLState): void {
  params.set('w', String(state.w));
  params.set('count', String(state.breakCount));
  // Legacy params never get written back out.
  params.delete('objective');
  params.delete('shape');
  params.delete('minBreakLength');
  params.delete('maxBreakLength');
}
