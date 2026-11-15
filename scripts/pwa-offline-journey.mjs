/**
 * P3 PWA journey on the production build (run `npm run build` first):
 *   node scripts/pwa-offline-journey.mjs [screenshotDir]
 * Serves dist/ like Vercel's cleanUrls (/pto → pto/index.html), then in Chromium: save a plan,
 * check the save confirmation, the manifest link and the service worker controller, reload,
 * go offline (context.setOffline(true)), reload, and open the saved plan from the returning
 * view. Screenshots of the save confirmation and the returning view at 375/768/1440 when a
 * directory is given. Exits non-zero on the first failed check.
 * PW_CHROMIUM_PATH points Playwright at a preinstalled browser if needed.
 */
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright';

const DIST = resolve(import.meta.dirname, '..', 'dist');
const SHOTS = process.argv[2];
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain', '.xml': 'application/xml',
};

function fileFor(pathname) {
  const clean = decodeURIComponent(pathname).replace(/\/+$/, '') || '/';
  const candidates = clean === '/' ? ['index.html'] : [clean.slice(1), `${clean.slice(1)}.html`, `${clean.slice(1)}/index.html`];
  for (const candidate of candidates) {
    const file = join(DIST, candidate);
    if (file.startsWith(DIST) && existsSync(file) && statSync(file).isFile()) return file;
  }
  return null;
}

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const file = fileFor(url.pathname);
  if (!file) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'public, max-age=0, must-revalidate' });
  res.end(readFileSync(file));
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
// localhost is a secure context, so the service worker registers over plain http here.
const BASE = `http://localhost:${server.address().port}`;

let failures = 0;
const check = (ok, label) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) failures++; };

const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const shoot = async (name, locator) => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(150);
    check(await overflow() === 0, `${name} @${width}: no horizontal overflow`);
    await locator.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(SHOTS, `${name}-${width}.png`) });
  }
  await page.setViewportSize({ width: 375, height: 812 });
};

try {
  await page.goto(`${BASE}/pto`);
  await page.waitForSelector('main[data-plan-ready="true"]', { timeout: 30_000 });
  check(await page.locator('link[rel="manifest"]').getAttribute('href') === '/manifest.webmanifest', 'manifest is linked');
  const manifest = await page.evaluate(async () => (await fetch('/manifest.webmanifest')).json());
  check(manifest.start_url === '/?source=pwa' && manifest.display === 'standalone', 'manifest is served and valid JSON');

  await page.getByRole('button', { name: 'Save this plan' }).click();
  const confirmation = page.getByTestId('save-confirmation');
  await confirmation.waitFor();
  check((await confirmation.textContent()).includes('Saved in this browser on this device.'), 'save confirmation says where the plan is stored');
  check(await confirmation.getByRole('button', { name: 'Add to calendar' }).isVisible(), 'save confirmation offers Add to calendar');
  check(await confirmation.getByRole('button', { name: 'Back up' }).isVisible(), 'save confirmation offers Back up');
  check(await page.getByRole('button', { name: 'Open saved plan' }).isVisible(), '"Restore" now reads "Open saved plan"');
  const savedSummary = await page.evaluate(() => JSON.parse(localStorage.getItem('gapless.personal.pinned-plans.v1')).plans[0].snapshot.summary);
  await shoot('save-confirmation', confirmation);

  // The worker installs after load and claims this page.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15_000 });
  check(true, 'service worker controls the page (navigator.serviceWorker.controller)');
  const persistAsked = await page.evaluate(() => JSON.parse(localStorage.getItem('gapless.personal.retention.v1') ?? '{}').persistRequestedAt);
  check(!!persistAsked, 'persistent storage was requested once after the first save');

  await page.goto(`${BASE}/?source=pwa`);
  check(new URL(page.url()).pathname === '/', 'start_url opens the homepage (no redirect to /pto)');
  const dashboard = page.getByRole('region', { name: 'Welcome back' });
  await dashboard.waitFor();
  check((await dashboard.textContent()).includes('Next break:'), 'returning view shows the next break');
  check(await page.getByRole('heading', { level: 1 }).isVisible(), 'the regular homepage planner is still there');
  await shoot('returning-view', dashboard);

  await page.reload();
  check(await page.evaluate(() => !!navigator.serviceWorker.controller), 'controller after reload');

  await context.setOffline(true);
  await page.reload();
  await dashboard.waitFor({ timeout: 10_000 });
  check((await dashboard.textContent()).includes('Next break:'), 'offline: homepage and returning view load');
  await dashboard.getByRole('link', { name: 'Open saved plan →' }).click();
  await page.waitForURL(/\/pto\?/);
  await page.waitForSelector('main[data-plan-ready="true"]', { timeout: 30_000 });
  const daysOff = await page.locator('#saved-plans').textContent();
  check(daysOff.includes(`${savedSummary.totalDaysOff} days off`), `offline: the saved plan opens (${savedSummary.totalDaysOff} days off)`);
  await page.reload();
  await page.waitForSelector('main[data-plan-ready="true"]', { timeout: 30_000 });
  check((await page.locator('#saved-plans').textContent()).includes(`${savedSummary.totalDaysOff} days off`), 'offline: reloading the saved plan works');
  check(await page.evaluate(() => fetch('/api/feed').then(() => 'network', () => 'blocked')) === 'blocked', 'offline: /api is not served from a cache');
  await context.setOffline(false);
} catch (error) {
  failures++;
  console.log(`FAIL ${error.message}`);
} finally {
  await browser.close();
  server.close();
}
console.log(failures ? `${failures} check(s) failed` : 'All checks passed');
process.exit(failures ? 1 : 0);
