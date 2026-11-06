import { isValidISODate } from './urlState';

export interface ForecastPreset {
  key: 'one-month' | 'three-months' | 'six-months' | 'year-end';
  label: string;
  date: string;
}

/** Anchored to the policy's balance as-of date, never to the viewer's clock. */
export function addMonthsClamped(iso: string, months: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const index = year * 12 + month - 1 + months;
  const targetYear = Math.floor(index / 12);
  const targetMonth = index % 12 + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  return `${String(targetYear).padStart(4, '0')}-${String(targetMonth).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

/** Optional shortcuts; the free-form date field remains the source of truth. */
export function forecastPresets(balanceAsOf: string): ForecastPreset[] {
  if (!isValidISODate(balanceAsOf)) return [];
  const year = balanceAsOf.slice(0, 4);
  const presets: ForecastPreset[] = [
    { key: 'one-month', label: '1 month', date: addMonthsClamped(balanceAsOf, 1) },
    { key: 'three-months', label: '3 months', date: addMonthsClamped(balanceAsOf, 3) },
    { key: 'six-months', label: '6 months', date: addMonthsClamped(balanceAsOf, 6) },
    { key: 'year-end', label: 'Year-end', date: `${year}-12-31` },
  ];
  return presets.filter((preset) => isValidISODate(preset.date) && preset.date >= balanceAsOf);
}
