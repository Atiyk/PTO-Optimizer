// One-off build script: NOT part of the app runtime. Fetches the full list of countries
// Nager.Date has public-holiday data for and writes a static packages/engine/src/data/countries.json the
// app imports directly (no network call at runtime, same pattern as
// build-demand-index.ts/demandIndex.json).
//
// Run with: npm run build:countries
//
// Phase 2 bug found: the app's country selector used a 35-country hand-picked subset
// (packages/engine/src/data/countries.ts, comment: "A practical subset of countries Nager.Date supports")
// instead of the full list this endpoint already provides - deliberate scoping from an
// earlier phase, not an unfinished TODO, but one the Phase 2 spec asks to remove. Nager.Date
// actually supports 200+ (204 at the time this was last run).

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

interface RawCountry {
  countryCode: string;
  name: string;
}

interface Country {
  code: string;
  name: string;
}

async function main() {
  const url = 'https://date.nager.at/api/v3/AvailableCountries';
  console.log(`Fetching ${url}...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const raw = (await res.json()) as RawCountry[];
  if (raw.length < 100) {
    throw new Error(`Expected 100+ countries, got ${raw.length} - API shape may have changed`);
  }

  const countries: Country[] = raw
    .map((c) => ({ code: c.countryCode, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const outPath = path.resolve(fileURLToPath(import.meta.url), '../../packages/engine/src/data/countries.json');
  writeFileSync(outPath, JSON.stringify(countries, null, 2) + '\n');
  console.log(`Wrote ${countries.length} countries to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
