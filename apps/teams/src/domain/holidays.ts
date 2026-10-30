import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { rawHolidaysToHolidays, type Holiday } from '@daysoff/engine/data/holidays';

/*
 * Server-side holidays. Same data and the same observed-date rules as Days Off: the
 * committed Nager.Date snapshots in the repo's public/holidays/ (bundled into the
 * deployment via outputFileTracingIncludes), then a live Nager.Date fetch for years not in
 * the snapshot. Results are memoised per process.
 */

const HOLIDAYS_DIR = process.env.HOLIDAYS_DIR ?? path.join(process.cwd(), '..', '..', 'public', 'holidays');
const cache = new Map<string, Promise<Holiday[]>>();

async function loadYear(countryCode: string, year: number): Promise<Holiday[]> {
  if (!/^[A-Z]{2}$/.test(countryCode)) return [];
  try {
    const raw = JSON.parse(await readFile(path.join(HOLIDAYS_DIR, `${countryCode}-${year}.json`), 'utf8'));
    return rawHolidaysToHolidays(raw);
  } catch {
    // Not in the snapshot; fall through to the live API.
  }
  if (process.env.HOLIDAYS_OFFLINE === '1') return [];
  try {
    const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    return rawHolidaysToHolidays(await res.json());
  } catch {
    return [];
  }
}

export function holidaysForYear(countryCode: string, year: number): Promise<Holiday[]> {
  const key = `${countryCode}-${year}`;
  let p = cache.get(key);
  if (!p) {
    p = loadYear(countryCode, year);
    cache.set(key, p);
  }
  return p;
}

/**
 * Public holidays in force for a location (national + the subdivision's regional ones)
 * across [start, end], as date → name.
 */
export async function holidayMap(
  countryCode: string,
  subdivisionCode: string | null,
  start: string,
  end: string,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const y0 = Number(start.slice(0, 4));
  const y1 = Number(end.slice(0, 4));
  for (let y = y0; y <= y1; y++) {
    for (const h of await holidaysForYear(countryCode, y)) {
      if (h.date < start || h.date > end) continue;
      if (h.counties && (!subdivisionCode || !h.counties.includes(subdivisionCode))) continue;
      if (!out.has(h.date)) out.set(h.date, h.name);
    }
  }
  return out;
}
