import countriesData from './countries.json';

export interface Country {
  code: string;
  name: string;
}

/**
 * Phase 2 bug found: this used to be a 35-country hand-picked subset ("A practical subset
 * of countries Nager.Date supports") - a deliberate scoping choice from an earlier phase,
 * not an unfinished TODO, but one that left 170 real countries this API already has
 * holiday data for unreachable. Now sourced from the full Nager.Date AvailableCountries
 * list (204 countries as of the last `npm run build:countries` run) - fetched at BUILD
 * time into countries.json (same pattern as demandIndex.json), not at runtime: the extra
 * entries cost nothing at runtime (no network call, no loading state), per spec.
 */
export const COUNTRIES: Country[] = countriesData;

/**
 * Phase 2: subdivision AVAILABILITY is no longer gated by this table - it's discovered
 * per-country from the `counties` field Nager.Date's own holiday data already carries
 * (see useAppState's `discoveredSubdivisions`), which is what "support subdivisions via
 * the counties field wherever provided" means literally: it works for any of the 204
 * countries that have county-specific holidays, not just the 4 below.
 *
 * This table now serves one narrower purpose: a friendly display NAME for a subdivision
 * code, for the handful of countries worth hand-naming (Nager.Date's `counties` values are
 * bare codes like "DE-BY", no name attached). Anything not listed here falls back to
 * showing the raw code - correct, just less polished, and a reasonable trade-off against
 * hand-maintaining region names for 200 countries' worth of states/provinces/Länder.
 */
export const SUBDIVISION_NAMES: Record<string, string> = {
  'US-AL': 'Alabama',
  'US-AK': 'Alaska',
  'US-AZ': 'Arizona',
  'US-AR': 'Arkansas',
  'US-CA': 'California',
  'US-CO': 'Colorado',
  'US-CT': 'Connecticut',
  'US-DE': 'Delaware',
  'US-DC': 'District of Columbia',
  'US-FL': 'Florida',
  'US-GA': 'Georgia',
  'US-HI': 'Hawaii',
  'US-ID': 'Idaho',
  'US-IL': 'Illinois',
  'US-IN': 'Indiana',
  'US-IA': 'Iowa',
  'US-KS': 'Kansas',
  'US-KY': 'Kentucky',
  'US-LA': 'Louisiana',
  'US-ME': 'Maine',
  'US-MD': 'Maryland',
  'US-MA': 'Massachusetts',
  'US-MI': 'Michigan',
  'US-MN': 'Minnesota',
  'US-MS': 'Mississippi',
  'US-MO': 'Missouri',
  'US-MT': 'Montana',
  'US-NE': 'Nebraska',
  'US-NV': 'Nevada',
  'US-NH': 'New Hampshire',
  'US-NJ': 'New Jersey',
  'US-NM': 'New Mexico',
  'US-NY': 'New York',
  'US-NC': 'North Carolina',
  'US-ND': 'North Dakota',
  'US-OH': 'Ohio',
  'US-OK': 'Oklahoma',
  'US-OR': 'Oregon',
  'US-PA': 'Pennsylvania',
  'US-RI': 'Rhode Island',
  'US-SC': 'South Carolina',
  'US-SD': 'South Dakota',
  'US-TN': 'Tennessee',
  'US-TX': 'Texas',
  'US-UT': 'Utah',
  'US-VT': 'Vermont',
  'US-VA': 'Virginia',
  'US-WA': 'Washington',
  'US-WV': 'West Virginia',
  'US-WI': 'Wisconsin',
  'US-WY': 'Wyoming',
  'GB-ENG': 'England',
  'GB-SCT': 'Scotland',
  'GB-WLS': 'Wales',
  'GB-NIR': 'Northern Ireland',
  'CA-ON': 'Ontario',
  'CA-QC': 'Quebec',
  'CA-BC': 'British Columbia',
  'CA-AB': 'Alberta',
  'CA-MB': 'Manitoba',
  'CA-SK': 'Saskatchewan',
  'CA-NS': 'Nova Scotia',
  'AU-NSW': 'New South Wales',
  'AU-VIC': 'Victoria',
  'AU-QLD': 'Queensland',
  'AU-WA': 'Western Australia',
  'AU-SA': 'South Australia',
  'AU-TAS': 'Tasmania',
};

/** A readable label for a subdivision code: the hand-named version where we have one,
 * else the raw code with its country prefix stripped (e.g. "DE-BY" -> "BY") - still
 * correct and usable, just not a full region name. */
export function subdivisionLabel(code: string): string {
  if (SUBDIVISION_NAMES[code]) return SUBDIVISION_NAMES[code];
  const dash = code.indexOf('-');
  return dash === -1 ? code : code.slice(dash + 1);
}
