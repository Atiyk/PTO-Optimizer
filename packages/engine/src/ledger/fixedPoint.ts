/**
 * Balances are sums of many fractional ledger amounts (e.g. 15/26 = 0.5769... days per
 * pay period). Summing JS floats drifts, so the engine works in integer ten-thousandths
 * ("units") and only converts back to a number at the edge. 4 decimal places is enough
 * for days and for hours (0.0001h = 0.36s).
 */
export const SCALE = 10_000;

export function toUnits(value: number | string): number {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) throw new RangeError(`not a finite amount: ${String(value)}`);
  return Math.round(n * SCALE);
}

export function fromUnits(units: number): number {
  return units / SCALE;
}

/** Exact sum of decimal amounts (each rounded to 4 dp first). */
export function sumAmounts(amounts: ReadonlyArray<number | string>): number {
  let total = 0;
  for (const a of amounts) total += toUnits(a);
  return fromUnits(total);
}
