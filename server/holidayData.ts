/**
 * Holiday files for the feed functions. In tests and local runs this reads the committed
 * public/holidays/<CC>-<YEAR>.json files from disk. scripts/build-api.mjs swaps this module
 * for one with every file embedded, because Vercel doesn't ship public/ files to functions.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function loadHolidayFile(name: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(join(process.cwd(), 'public', 'holidays', name), 'utf8'));
  } catch {
    return null;
  }
}
