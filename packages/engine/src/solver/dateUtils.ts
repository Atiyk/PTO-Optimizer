// All date handling is UTC-based arithmetic on YYYY-MM-DD strings.
// No Date.now(), no locale-dependent parsing (new Date(string)).

const MS_PER_DAY = 86400000;

export function parseISO(iso: string): { y: number; m: number; d: number } {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  return { y, m, d };
}

export function isoToSerial(iso: string): number {
  const { y, m, d } = parseISO(iso);
  return Date.UTC(y, m - 1, d) / MS_PER_DAY;
}

export function serialToISO(serial: number): string {
  const date = new Date(serial * MS_PER_DAY);
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** 0 = Monday .. 6 = Sunday */
export function mondayIndexedDow(iso: string): number {
  const { y, m, d } = parseISO(iso);
  const jsDow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday .. 6 = Saturday
  return (jsDow + 6) % 7;
}

export function addDays(iso: string, n: number): string {
  return serialToISO(isoToSerial(iso) + n);
}

/** Inclusive range of ISO date strings from start to end. Empty array if end < start. */
export function rangeISO(start: string, end: string): string[] {
  const startSerial = isoToSerial(start);
  const endSerial = isoToSerial(end);
  if (endSerial < startSerial) return [];
  const out: string[] = [];
  for (let s = startSerial; s <= endSerial; s++) {
    out.push(serialToISO(s));
  }
  return out;
}

/** Full months elapsed from start to end, never negative. */
export function monthsElapsed(start: string, end: string): number {
  const a = parseISO(start);
  const b = parseISO(end);
  let months = (b.y - a.y) * 12 + (b.m - a.m);
  if (b.d < a.d) months -= 1;
  return Math.max(0, months);
}
