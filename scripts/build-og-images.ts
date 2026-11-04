/**
 * Phase 6A: a distinct 1200x630 OG image per route (/, /pto, /sabbatical), each with real
 * data computed the same way the earlier single shared og-image.png was (per NOTES.md's
 * Phase 2A: a real renderer, not a mock-up) - but reusing the actual landingData.ts/
 * sabbaticalData.ts/solve.ts functions directly in Node (no fabricated sample numbers)
 * rather than driving a live browser session through the UI. A tiny standalone HTML
 * template (not React - this only needs to render once, at build time) styled to match
 * the real site's own palette, screenshotted with Playwright at exactly 1200x630.
 *
 * Run manually (not on every build - these change only when the real template/branding
 * changes, not when the underlying data does from day to day): `npx tsx
 * --tsconfig tsconfig.app.json scripts/build-og-images.ts`. Committed, like og-image.png
 * always was.
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { nextHoliday } from '../src/ui/landingData.ts';
import { rawHolidaysToHolidays } from '@daysoff/engine/data/holidays';
import { solve } from '@daysoff/engine/solver/solve';
import { bestPlacements, placementNote } from '../src/ui/sabbaticalData.ts';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import { PRODUCT_NAME } from '../src/brand.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const outDir = resolve(projectRoot, 'public/og-images');

function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function loadUSHolidays(): ReturnType<typeof rawHolidaysToHolidays> {
  const currentYear = new Date().getUTCFullYear();
  const raw = [currentYear, currentYear + 1, currentYear + 2].flatMap((year) => {
    const path = resolve(projectRoot, `public/holidays/US-${year}.json`);
    try {
      return JSON.parse(readFileSync(path, 'utf-8'));
    } catch {
      return [];
    }
  });
  return rawHolidaysToHolidays(raw);
}

// 2026-11 redesign: the highlighted-schedule system (docs/DESIGN-SYSTEM.md) - paper, ink, the
// marker, and Archivo (embedded from public/fonts so the render never depends on system fonts).
const ARCHIVO = readFileSync(resolve(projectRoot, 'public/fonts/archivo-latin-var.woff2')).toString('base64');

function template(title: string, subtitle: string, detail: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face { font-family: Archivo; src: url(data:font/woff2;base64,${ARCHIVO}) format('woff2'); font-weight: 400 800; font-stretch: 75% 100%; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { width: 1200px; height: 630px; background: #f4f4f0; color: #141414; font-family: Archivo, system-ui, sans-serif; display: flex; flex-direction: column; justify-content: center; padding: 84px 90px; }
    .brand { display: flex; align-items: center; gap: 14px; font-size: 30px; font-weight: 800; font-stretch: 75%; margin-bottom: 40px; }
    .mark-icon { width: 40px; height: 40px; background: #141414; border-radius: 6px; position: relative; overflow: hidden; }
    .mark-icon::before { content: ''; position: absolute; left: 0; right: 0; top: 13px; height: 14px; background: #dcf763; }
    h1 { font-size: 76px; font-weight: 800; font-stretch: 75%; line-height: 1; letter-spacing: -0.01em; margin: 0 0 24px; max-width: 1000px; }
    p { color: #56564f; font-size: 28px; line-height: 1.4; margin: 0; max-width: 940px; }
    .detail { margin-top: 32px; font-size: 28px; font-weight: 700; align-self: flex-start; background: #dcf763; padding: 4px 12px; }
  </style></head><body>
    <div class="brand"><span class="mark-icon"></span>${PRODUCT_NAME}</div>
    <h1>${title}</h1>
    <p>${subtitle}</p>
    ${detail ? `<div class="detail">${detail}</div>` : ''}
  </body></html>`;
}

async function renderOgImage(browser: Awaited<ReturnType<typeof chromium.launch>>, slug: string, html: string): Promise<void> {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(html);
  mkdirSync(outDir, { recursive: true });
  await page.screenshot({ path: resolve(outDir, `${slug}.png`) });
  await page.close();
}

async function main(): Promise<void> {
  const today = todayISO();
  const holidays = loadUSHolidays();
  const stripEnd = addDays(today, 364);

  // PW_CHROMIUM_PATH lets a sandbox with a preinstalled browser skip `playwright install`
  // (same switch as scripts/screenshot.mjs).
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});

  // Landing (/): the real next US holiday, same function the hero itself uses.
  const nextHol = nextHoliday(today, stripEnd, holidays);
  await renderOgImage(
    browser,
    'landing',
    template(
      'Make every PTO day count.',
      'See every day off coming, then turn your PTO into longer breaks.',
      nextHol ? `Next: ${nextHol.holiday.name}, ${nextHol.daysAway} days away` : '',
    ),
  );

  // /pto: a real solve() at a representative budget.
  const solveResult = solve({ offDays: holidays.map((h) => h.date), rangeStart: today, rangeEnd: stripEnd, budget: 15, country: 'US', workWeek: DEFAULT_WORK_WEEK });
  const totalDaysOff = solveResult.primary.reduce((sum, b) => sum + b.totalDaysOff, 0);
  await renderOgImage(
    browser,
    'pto',
    template('Plan your PTO', 'Turn your PTO into more days off.', `15 PTO days → ${totalDaysOff} days off`),
  );

  // /sabbatical: a real bestPlacements() result.
  const { placements } = bestPlacements(today, stripEnd, 4, 5, 0, holidays, 'US', DEFAULT_WORK_WEEK, today);
  const top = placements[0];
  await renderOgImage(
    browser,
    'sabbatical',
    template('Sabbatical Planning', 'Place a longer break where it buys the most time.', top ? placementNote(top) : ''),
  );

  await browser.close();
  console.log(`OG images written to ${outDir}: landing.png, pto.png, sabbatical.png`);
}

main();
