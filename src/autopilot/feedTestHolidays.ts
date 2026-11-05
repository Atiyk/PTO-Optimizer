/** Test-only: the committed public/holidays files for the countries the feed tests use,
 * loaded through Vite (no node:fs, so `tsc -b` type-checks the tests without Node types). */
import type { HolidaySource } from './planFromSearch';

const FILES: Record<string, unknown> = import.meta.glob('../../public/holidays/{US,GB,DE,AU,CA}-*.json', { import: 'default', eager: true });

export function holidayFile(country: string, year: number): unknown {
  return FILES[`../../public/holidays/${country}-${year}.json`] ?? null;
}

export const diskHolidays: HolidaySource = holidayFile;
