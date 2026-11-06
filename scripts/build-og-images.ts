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
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { nextHoliday } from '../src/ui/landingData.ts';
import { rawHolidaysToHolidays } from '@daysoff/engine/data/holidays';
import { solve } from '@daysoff/engine/solver/solve';
import { bestPlacements, placementNote } from '../src/ui/sabbaticalData.ts';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import { logoMarkInner, LOGO_COLORS } from '../src/ui/logoMark.ts';
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

// 2026-11 brand overhaul: "the line" (DESIGN.md) - cool paper, ink, Line indigo, the bridged-G
// mark, and Archivo (embedded from public/fonts so the render never depends on system fonts).
const ARCHIVO = readFileSync(resolve(projectRoot, 'public/fonts/archivo-latin-var.woff2')).toString('base64');

function template(title: string, subtitle: string, detail: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face { font-family: Archivo; src: url(data:font/woff2;base64,${ARCHIVO}) format('woff2'); font-weight: 400 800; font-stretch: 75% 100%; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { width: 1200px; height: 630px; background: #f8fafc; color: #1b2935; font-family: Archivo, system-ui, sans-serif; display: flex; flex-direction: column; justify-content: center; padding: 84px 90px; }
    .brand { display: flex; align-items: center; gap: 14px; font-size: 30px; font-weight: 760; font-stretch: 88%; letter-spacing: -0.02em; margin-bottom: 40px; }
    .mark-icon { width: 44px; height: 44px; display: block; }
    .wm { font-size: 36px; letter-spacing: -0.035em; }
    .desc { font-size: 22px; font-weight: 500; color: #536575; letter-spacing: 0; font-stretch: 100%; }
    .sr { display: none; }
    h1 { font-size: 72px; font-weight: 760; font-stretch: 88%; line-height: 1.02; letter-spacing: -0.025em; margin: 0 0 24px; max-width: 1000px; }
    p { color: #536575; font-size: 28px; line-height: 1.4; margin: 0; max-width: 940px; }
    .detail { margin-top: 32px; font-size: 26px; font-weight: 600; align-self: flex-start; color: #1d4c88; border-top: 3px solid #245da6; padding-top: 14px; }
  </style></head><body>
    <div class="brand"><svg class="mark-icon" viewBox="0 0 32 32">${logoMarkInner(LOGO_COLORS)}</svg><span class="wm">gapless</span><span class="desc">PTO Optimizer</span><span class="sr">${PRODUCT_NAME}</span></div>
    <h1>${title}</h1>
    <p>${subtitle}</p>
    ${detail ? `<div class="detail">${detail}</div>` : ''}
  </body></html>`;
}

/** OG_ONLY=family renders just the named images (comma-separated), leaving the others as committed. */
const ONLY = process.env.OG_ONLY?.split(',').map((s) => s.trim()).filter(Boolean);

async function renderOgImage(browser: Awaited<ReturnType<typeof chromium.launch>>, slug: string, html: string): Promise<void> {
  if (ONLY && !ONLY.includes(slug)) return;
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
      'More days off from the same PTO.',
      'Gapless finds where your PTO joins weekends and public holidays into the longest breaks.',
      nextHol ? `Free, and no account needed` : '',
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
    template('Plan a sabbatical', 'Place a longer break where it buys the most time.', top ? placementNote(top) : ''),
  );

  // 2026-11 redesign: every other route family gets its own image in the same system, so no
  // shared page still shows the retired og-image.png.
  await renderOgImage(
    browser,
    'policy',
    template('How much PTO will you have?', 'Forecast your balance, see what is about to expire, and track your requests.', 'Free, and nothing leaves your browser'),
  );
  await renderOgImage(
    browser,
    'family',
    template('Plan PTO around school breaks', 'The most days with your kids for the PTO you have, and which school days off still need cover.', 'Dates only. Nothing uploaded.'),
  );
  await renderOgImage(
    browser,
    'learn',
    template('PTO, in plain words', 'Accrual, carryover, payout and requests explained, with worked examples.', 'Glossary, guides and answers'),
  );

  await browser.close();
  console.log(`OG images written to ${outDir}: landing.png, pto.png, sabbatical.png, policy.png, family.png, learn.png`);
}

main();
