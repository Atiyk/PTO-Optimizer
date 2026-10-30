import { COUNTRIES } from '@daysoff/engine/data/countries';

/** Best-effort country guess from the browser locale. Never throws. */
export function geolocateCountry(): string {
  try {
    const locales = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
    for (const locale of locales) {
      const region = locale.split('-')[1];
      if (region && COUNTRIES.some((c) => c.code === region.toUpperCase())) {
        return region.toUpperCase();
      }
    }
  } catch {
    // ignore - fall through to default
  }
  return 'US';
}
