/**
 * Real touch-only browser regression for calendar day actions at narrow viewports.
 * Invoked by consumer validation against the local Vite preview, never the B2B app.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const [base = 'http://127.0.0.1:4177', output = 'qa-evidence/touch-calendar'] = process.argv.slice(2);
const origin = new URL(base).origin;
const out = resolve(output);
await mkdir(out, { recursive: true });
const report = { status: 'running', viewports: [375, 320], cases: [], runtimeErrors: [] };
const browser = await chromium.launch({ headless: true, ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}) });

try {
  for (const width of report.viewports) {
    const context = await browser.newContext({
      viewport: { width, height: 812 }, hasTouch: true, isMobile: true,
      locale: 'en-US', timezoneId: 'America/New_York', reducedMotion: 'reduce',
    });
    try {
      const page = await context.newPage();
      page.on('pageerror', error => report.runtimeErrors.push({ width, message: error.message }));
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === origin && url.pathname === '/_vercel/insights/script.js') {
          return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
        }
        if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) return route.abort();
        return route.continue();
      });
      await page.clock.setFixedTime(new Date('2027-01-01T17:00:00Z'));
      await page.goto(new URL('/pto/?c=US&s=2027-01-01&e=2027-12-31&b=15&rv=0&pv=2', origin).href, { waitUntil: 'networkidle' });
      assert.equal(await page.evaluate(() => matchMedia('(hover: hover)').matches), false, 'Browser must simulate a touch-only device');
      const day = page.locator('#day-2027-01-20');
      await day.waitFor({ state: 'visible' });
      await day.tap();
      const panel = page.getByRole('group', { name: 'Actions for January 20' });
      await panel.waitFor({ state: 'visible' });
      assert.equal(await day.getAttribute('aria-expanded'), 'true', 'Tap must disclose the action without changing the day');
      const bounds = await panel.boundingBox();
      assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width + 1, 'Touch action panel must fit inside the viewport');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'Calendar must not overflow horizontally');
      await page.screenshot({ path: resolve(out, `calendar-touch-open-${width}.png`), fullPage: false });
      await panel.getByRole('button', { name: 'Change this day' }).tap();
      await panel.waitFor({ state: 'detached' });
      assert.ok(await day.count(), `Calendar day disappeared after applying an action. Status: ${JSON.stringify(await page.locator('[role="status"]').allInnerTexts())}; URL: ${page.url()}`);
      assert.equal(await day.getAttribute('aria-expanded'), 'false', 'Action should close the disclosure');

      await day.tap();
      await page.getByRole('group', { name: 'Actions for January 20' }).getByRole('button', { name: 'Close' }).tap();
      assert.equal(await day.getAttribute('aria-expanded'), 'false', 'Close should dismiss without action');
      await day.tap();
      await page.keyboard.press('Escape');
      assert.equal(await day.getAttribute('aria-expanded'), 'false', 'Escape should dismiss the disclosure');

      await day.focus();
      await page.keyboard.press('Space');
      assert.equal(await day.getAttribute('aria-expanded'), 'false', 'Space should directly activate the day for keyboard users');
      assert.deepEqual(report.runtimeErrors.filter(error => error.width === width), [], 'No uncaught browser errors');
      report.cases.push({ width, status: 'passed', touch: true, action: true, dismiss: true, keyboard: true, overflow: false });
      console.log(`Touch calendar regression passed at ${width}px`);
    } finally {
      await context.close();
    }
  }
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error instanceof Error ? error.message : String(error);
  throw error;
} finally {
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
