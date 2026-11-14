import type { Holiday } from '@daysoff/engine/data/holidays';

/** The <head> script each prerendered page ships so the browser's first paint starts from
 * the same holiday snapshot the static render used.
 *
 * It deliberately does NOT carry `__PTO_PRERENDERED_AT__`. That build-time stamp drives the
 * "Dates as of <build date>; this page recomputes live once it loads" note, which is true
 * only of the static HTML. prerender.ts sets it on the Node-side window for renderToString;
 * if the live page also received it, the client (createRoot) kept rendering the note after
 * it had recomputed everything (F17). */
export function preloadScriptFor(country: string, holidays: Holiday[], sourceYears: number[]): string {
  return `    <script>window.__PTO_PRELOADED_HOLIDAYS__ = ${JSON.stringify({ [country]: holidays })}; window.__PTO_PRELOADED_HOLIDAY_YEARS__ = ${JSON.stringify({ [country]: sourceYears })};</script>`;
}
