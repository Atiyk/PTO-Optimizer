// One-off build script: NOT part of the app runtime. Fetches the most recent
// full calendar year of TSA checkpoint throughput, smooths it, and writes a
// static packages/engine/src/data/demandIndex.json the app imports directly (no network call
// at runtime, fully deterministic).
//
// Run with: npm run build:demand-index

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROW_RE =
  /<tr><td class="text-align-center">(\d{1,2})\/(\d{1,2})\/(\d{4})<\/td><td class="text-align-center">([\d,]+)<\/td><\/tr>/g;

interface RawPoint {
  year: number;
  month: number;
  day: number;
  value: number;
}

async function fetchYear(year: number): Promise<RawPoint[]> {
  const url = `https://www.tsa.gov/travel/passenger-volumes/${year}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const html = await res.text();
  const points: RawPoint[] = [];
  for (const match of html.matchAll(ROW_RE)) {
    const [, m, d, y, raw] = match;
    points.push({ year: Number(y), month: Number(m), day: Number(d), value: Number(raw.replace(/,/g, '')) });
  }
  return points;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function dayOfWeekUTC(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = Sunday .. 6 = Saturday
}

async function main() {
  const mostRecentFullYear = new Date().getFullYear() - 1;
  console.log(`Fetching TSA checkpoint throughput for ${mostRecentFullYear}...`);

  const points = await fetchYear(mostRecentFullYear);
  if (points.length < 360) {
    throw new Error(`Expected a full year of data, got ${points.length} rows`);
  }

  // Drop Feb 29 (if the source year is a leap year) so the index always has
  // exactly 365 keys, independent of which year it was built from.
  const filtered = points.filter((p) => !(p.month === 2 && p.day === 29));

  filtered.sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.month !== b.month ? a.month - b.month : a.day - b.day,
  );

  // Align by weekday-of-year, not calendar date: group every occurrence of
  // each weekday (all ~52 Mondays, all ~52 Tuesdays, ...) in chronological
  // order, then smooth within that single-weekday sequence. Smoothing across
  // raw calendar days would blend weekday/weekend levels together and erase
  // the Friday/Sunday travel spikes the index exists to capture.
  const byDow: { mmdd: string; value: number }[][] = Array.from({ length: 7 }, () => []);
  for (const p of filtered) {
    const dow = dayOfWeekUTC(p.year, p.month, p.day);
    byDow[dow].push({ mmdd: `${pad2(p.month)}-${pad2(p.day)}`, value: p.value });
  }

  const smoothed = new Map<string, number>();
  for (const bucket of byDow) {
    for (let i = 0; i < bucket.length; i++) {
      const prev = bucket[i - 1]?.value ?? bucket[i].value;
      const next = bucket[i + 1]?.value ?? bucket[i].value;
      const avg = (prev + bucket[i].value + next) / 3;
      smoothed.set(bucket[i].mmdd, avg);
    }
  }

  const mean = [...smoothed.values()].reduce((a, b) => a + b, 0) / smoothed.size;

  const index: Record<string, number> = {};
  for (const [mmdd, value] of [...smoothed.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    index[mmdd] = Math.round((value / mean) * 1000) / 1000;
  }

  if (Object.keys(index).length !== 365) {
    throw new Error(`Expected 365 keys, got ${Object.keys(index).length}`);
  }

  const outPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'engine', 'src', 'data', 'demandIndex.json');
  writeFileSync(outPath, JSON.stringify(index, null, 2) + '\n');
  console.log(`Wrote ${outPath} (source year: ${mostRecentFullYear}, ${Object.keys(index).length} days)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
