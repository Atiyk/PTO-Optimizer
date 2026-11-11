/**
 * Phase 2: fetches Nager.Date for every country in packages/engine/src/data/countries.json (all 204 are
 * genuinely supported - confirmed against Nager's own /AvailableCountries, which returns
 * the exact same 204 codes), for the current year plus the next two, and writes one small
 * static file per country/year to public/holidays/<CC>-<YEAR>.json. These are committed,
 * so a build with no network still has real data (packages/engine/src/data/holidays.ts reads them
 * same-origin first, Nager only as a live fallback - see that file's own Phase 2 changes),
 * and scripts/prerender.ts reads them directly in Node to put real stats, holiday names and
 * sabbatical placements into the initial HTML instead of the empty-holiday-set snapshot a
 * crawler used to see (K1).
 *
 * Run as part of `npm run build` (see package.json's "prebuild"), with a budget: if the
 * network is unreachable, this must still exit 0 and leave the committed files exactly as
 * they were - a slow or absent network degrades to "slightly stale data", never a broken
 * build. Concurrency-limited (COUNTRY_CONCURRENCY at a time) rather than one request at a
 * time (612 requests serially would take minutes) or fully parallel (hostile to Nager's
 * free public API).
 *
 * Never overwrites a good committed file with an empty or failed response - a transient
 * 500, a timeout, or Nager quietly returning `[]` for a country that had real holidays
 * last year are all treated as "couldn't refresh this one", not "this country now has zero
 * holidays". Logged loudly either way so a genuine data problem isn't silently swallowed.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const countriesPath = resolve(projectRoot, 'packages/engine/src/data/countries.json');
const outDir = resolve(projectRoot, 'public/holidays');

const API_BASE = 'https://date.nager.at/api/v3/PublicHolidays';
const COUNTRY_CONCURRENCY = 20;
const FETCH_TIMEOUT_MS = 8000;
/** A single slow/unreachable host shouldn't make the whole build hang - once this many
 * fetches have failed in a row (network almost certainly down), stop attempting the rest
 * and fall back to whatever's already committed for everything remaining. */
const ABORT_AFTER_CONSECUTIVE_FAILURES = 15;

interface Country {
  code: string;
  name: string;
}

interface Task {
  code: string;
  year: number;
}

interface TaskResult {
  task: Task;
  outcome: 'written' | 'kept-existing' | 'skipped-no-fallback';
  reason?: string;
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function outPath(code: string, year: number): string {
  return resolve(outDir, `${code}-${year}.json`);
}

function readExisting(code: string, year: number): unknown[] | null {
  const path = outPath(code, year);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8'));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function runTask(task: Task): Promise<{ result: TaskResult; failed: boolean }> {
  const { code, year } = task;
  let data: unknown[];
  try {
    const res = await fetchWithTimeout(`${API_BASE}/${year}/${code}`, FETCH_TIMEOUT_MS);
    if (!res.ok) {
      const existing = readExisting(code, year);
      return {
        failed: true,
        result: existing
          ? { task, outcome: 'kept-existing', reason: `HTTP ${res.status}` }
          : { task, outcome: 'skipped-no-fallback', reason: `HTTP ${res.status}, no committed fallback` },
      };
    }
    data = (await res.json()) as unknown[];
  } catch (err) {
    const existing = readExisting(code, year);
    return {
      failed: true,
      result: existing
        ? { task, outcome: 'kept-existing', reason: String(err) }
        : { task, outcome: 'skipped-no-fallback', reason: `${String(err)}, no committed fallback` },
    };
  }

  const existing = readExisting(code, year);
  if (!Array.isArray(data) || (data.length === 0 && existing && existing.length > 0)) {
    // Suspicious: a country that had holidays before now reports none. Don't trust it.
    return { failed: false, result: { task, outcome: 'kept-existing', reason: 'suspicious empty response - a committed non-empty file already exists' } };
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath(code, year), `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
  return { failed: false, result: { task, outcome: 'written' } };
}

async function runWithConcurrency(tasks: Task[]): Promise<TaskResult[]> {
  const results: TaskResult[] = [];
  let consecutiveFailures = 0;
  let aborted = false;
  let index = 0;

  async function worker(): Promise<void> {
    while (index < tasks.length) {
      if (aborted) {
        const task = tasks[index++];
        const existing = readExisting(task.code, task.year);
        results.push({
          task,
          outcome: existing ? 'kept-existing' : 'skipped-no-fallback',
          reason: 'network looks down - aborted remaining fetches',
        });
        continue;
      }
      const task = tasks[index++];
      const { result, failed } = await runTask(task);
      results.push(result);
      consecutiveFailures = failed ? consecutiveFailures + 1 : 0;
      if (consecutiveFailures >= ABORT_AFTER_CONSECUTIVE_FAILURES) aborted = true;
    }
  }

  await Promise.all(Array.from({ length: COUNTRY_CONCURRENCY }, () => worker()));
  return results;
}

async function main(): Promise<void> {
  const countries: Country[] = JSON.parse(readFileSync(countriesPath, 'utf-8'));
  const currentYear = new Date().getUTCFullYear();
  const years = [currentYear, currentYear + 1, currentYear + 2];
  const tasks: Task[] = countries.flatMap((c) => years.map((year) => ({ code: c.code, year })));

  console.log(`Fetching holidays for ${countries.length} countries x ${years.length} years (${tasks.length} requests, concurrency ${COUNTRY_CONCURRENCY})...`);
  const results = await runWithConcurrency(tasks);

  const written = results.filter((r) => r.outcome === 'written').length;
  const kept = results.filter((r) => r.outcome === 'kept-existing');
  const skipped = results.filter((r) => r.outcome === 'skipped-no-fallback');

  console.log(`  ${written} written, ${kept.length} kept existing (refresh failed), ${skipped.length} skipped (no fallback available)`);
  if (kept.length > 0) {
    console.log('  Kept existing (not overwritten with a failed/suspicious refresh):');
    for (const r of kept.slice(0, 20)) console.log(`    ${r.task.code}-${r.task.year}: ${r.reason}`);
    if (kept.length > 20) console.log(`    ... and ${kept.length - 20} more`);
  }
  if (skipped.length > 0) {
    console.log('  Skipped, no committed data exists for these yet (will fall back to a live Nager fetch at runtime):');
    for (const r of skipped.slice(0, 20)) console.log(`    ${r.task.code}-${r.task.year}: ${r.reason}`);
    if (skipped.length > 20) console.log(`    ... and ${skipped.length - 20} more`);
  }

  // Phase 5 (5A hero chip "<N> countries"): the REAL count of countries that actually have
  // holiday data after this run - written fresh or kept from a prior good run both count;
  // a country with nothing but 'skipped-no-fallback' outcomes does not. Deliberately not
  // just countries.json's own length (that's every country Nager supports, not every
  // country this build actually has data for) - written once, here, as the one place this
  // number is computed, and imported as a plain JSON module by the client, same pattern as
  // demandIndex.json.
  const countriesWithData = new Set(results.filter((r) => r.outcome === 'written' || r.outcome === 'kept-existing').map((r) => r.task.code)).size;
  const coveragePath = resolve(projectRoot, 'packages/engine/src/data/holidayCoverage.json');
  // Issue 17: the years every country has a committed file for. Lookups outside these years
  // depend on a live fetch, and a year with no data is reported to the user as uncovered.
  const candidateYears = Array.from({ length: years.length + 4 }, (_, i) => currentYear - 2 + i);
  const bundledYears = candidateYears.filter((year) => countries.every((c) => (readExisting(c.code, year)?.length ?? 0) > 0));
  writeFileSync(coveragePath, `${JSON.stringify({ countriesWithData, bundledYears, asOf: new Date().toISOString().slice(0, 10) }, null, 2)}\n`, 'utf-8');
  console.log(`  ${countriesWithData} countries have real holiday data (packages/engine/src/data/holidayCoverage.json updated).`);

  // Never fail the build over this - a stale or absent static snapshot degrades to a live
  // fetch at runtime (packages/engine/src/data/holidays.ts), not a broken deploy.
  process.exit(0);
}

main();
