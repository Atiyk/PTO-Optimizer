import type { WeekStart } from './calendarMath';

// Countries whose calendars conventionally start the week on Sunday. Everyone else
// (Europe, UK, Australia, and the ISO 8601 default) starts on Monday.
const SUNDAY_FIRST_COUNTRIES = new Set(['US', 'CA', 'JP']);

export function weekStartForCountry(countryCode: string): WeekStart {
  return SUNDAY_FIRST_COUNTRIES.has(countryCode) ? 0 : 1;
}

// A representative BCP-47 locale per supported country, so the native date input's
// displayed format (MM/DD/YYYY, DD/MM/YYYY, YYYY/MM/DD, ...) agrees with the grid's
// week-start convention. Falls back to 'en-GB' (Monday-first, DD/MM) for anything unmapped.
const COUNTRY_LOCALE: Record<string, string> = {
  US: 'en-US',
  GB: 'en-GB',
  CA: 'en-CA',
  AU: 'en-AU',
  DE: 'de-DE',
  FR: 'fr-FR',
  ES: 'es-ES',
  IT: 'it-IT',
  NL: 'nl-NL',
  BE: 'nl-BE',
  CH: 'de-CH',
  AT: 'de-AT',
  IE: 'en-IE',
  PT: 'pt-PT',
  SE: 'sv-SE',
  NO: 'nb-NO',
  DK: 'da-DK',
  FI: 'fi-FI',
  PL: 'pl-PL',
  CZ: 'cs-CZ',
  GR: 'el-GR',
  HU: 'hu-HU',
  RO: 'ro-RO',
  JP: 'ja-JP',
  KR: 'ko-KR',
  CN: 'zh-CN',
  IN: 'en-IN',
  SG: 'en-SG',
  NZ: 'en-NZ',
  MX: 'es-MX',
  BR: 'pt-BR',
  AR: 'es-AR',
  ZA: 'en-ZA',
  IL: 'he-IL',
  AE: 'ar-AE',
};

export function localeForCountry(countryCode: string): string {
  return COUNTRY_LOCALE[countryCode] ?? 'en-GB';
}
