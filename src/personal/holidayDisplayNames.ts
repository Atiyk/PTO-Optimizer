import { COUNTRIES, subdivisionLabel } from '@daysoff/engine/data/countries';

/**
 * Holiday names as people in each country write them. Nager.Date's English `name` uses one
 * spelling for every country, so the US list read "Labour Day" and the UK's "St. Stephen's
 * Day" for Boxing Day. This is a display layer only: the source name stays the identifier
 * for employer-calendar keys (`date|name`), stored profiles and links, and dates never change.
 */
const LOCAL_HOLIDAY_NAMES: Record<string, Record<string, string>> = {
  US: { 'Labour Day': 'Labor Day' },
  GB: { "St. Stephen's Day": 'Boxing Day' },
  CA: { "St. Stephen's Day": 'Boxing Day' },
  AU: { "St. Stephen's Day": 'Boxing Day' },
};

/** Shorter labels for compact holiday chips, where a full official name would wrap. */
const SHORT_HOLIDAY_LABELS: Record<string, Record<string, string>> = {
  US: {
    'Martin Luther King, Jr. Day': 'MLK Day',
    'Juneteenth National Independence Day': 'Juneteenth',
    'Independence Day': 'July 4',
    'Thanksgiving Day': 'Thanksgiving',
    'Christmas Day': 'Christmas',
  },
};

/** The holiday's name as people in `country` usually write it. */
export function holidayDisplayName(name: string, country: string): string {
  return LOCAL_HOLIDAY_NAMES[country]?.[name] ?? name;
}

/** A combined label ("A / B") renamed part by part. */
export function holidayDisplayNames(name: string, country: string): string {
  return name.split(' / ').map((part) => holidayDisplayName(part, country)).join(' / ');
}

/** The short chip label, falling back to the display name. */
export function holidayChipLabel(name: string, country: string): string {
  return SHORT_HOLIDAY_LABELS[country]?.[name] ?? holidayDisplayName(name, country);
}

/** "United States", or "California, United States": where a saved employer calendar applies. */
export function employerPlaceLabel(country: string, subdivision?: string): string {
  const name = COUNTRIES.find((entry) => entry.code === country)?.name ?? country;
  return subdivision ? `${subdivisionLabel(subdivision)}, ${name}` : name;
}
