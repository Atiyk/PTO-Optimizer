/**
 * Browser regression for the two date-list editors in consumer More options.
 * Run against a built Vite preview; captures real 1440/768/375/320 screenshots.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const [base = 'http://127.0.0.1:4177', output = 'qa-evidence/date-editor'] = process.argv.slice(2);
const origin = new URL(base).origin;
const out = resolve(output);
await mkdir(out, { recursive: true });
const report = { status: 'running', widths: [1440, 768, 375, 320], results: [] };
let browser;

try {
  browser = await chromium.launch({ headless: true });
  for (const width of report.widths) {
    const context = await browser.newContext({
      viewport: { width, height: 900 }, locale: 'en-US', timezoneId: 'America/New_York',
      colorScheme: 'light', reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.clock.setFixedTime(new Date('2026-11-02T17:00:00Z'));
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.origin === origin && url.pathname === '/_vercel/insights/script.js') {
        return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
      }
      return ['http:', 'https:'].includes(url.protocol) && url.origin !== origin
        ? route.abort() : route.continue();
    });
    try {
      await page.goto(origin + '/pto/?c=US&s=2027-01-01&e=2027-12-31&b=15', { waitUntil: 'domcontentloaded' });
      await page.locator('main[data-plan-ready="true"]').waitFor({ state: 'visible' });
      await page.getByRole('button', { name: /More options/ }).click();
      const blackout = page.locator('section').filter({ has: page.getByRole('heading', { name: "Days I can't take off", exact: true }) });
      const overlap = page.locator('section').filter({ has: page.getByRole('heading', { name: /Overlap days/ }) });
      const input = blackout.getByLabel('Unavailable date to add', { exact: true });
      const add = blackout.getByRole('button', { name: 'Add', exact: true });
      assert.equal(await add.isDisabled(), true, 'Add should be disabled with no date');
      await page.screenshot({ path: resolve(out, 'options-before-' + width + '.png'), fullPage: true });

      await input.fill('2027-03-17');
      await input.press('Enter');
      assert.equal(await blackout.locator('time[datetime="2027-03-17"]').count(), 1, 'Enter should add the date');
      assert.equal(await input.inputValue(), '', 'Date should clear after adding');
      assert.equal(await input.evaluate((el) => document.activeElement === el), true, 'Focus should return to the picker');
      await input.fill('2027-03-17');
      assert.equal(await add.isDisabled(), true, 'Duplicate should disable Add');
      assert.match(await blackout.getByRole('status').innerText(), /already in the list/);
      await page.screenshot({ path: resolve(out, 'options-duplicate-' + width + '.png'), fullPage: true });
      await blackout.getByRole('button', { name: 'Remove 2027-03-17' }).click();
      assert.equal(await blackout.locator('time[datetime="2027-03-17"]').count(), 0);
      assert.equal(await input.evaluate((el) => document.activeElement === el), true, 'Remove must restore focus');

      const overlapInput = overlap.getByLabel('Overlap date to add', { exact: true });
      await overlapInput.fill('2027-04-12');
      await overlap.getByRole('button', { name: 'Add', exact: true }).click();
      assert.equal(await overlap.locator('time[datetime="2027-04-12"]').count(), 1);
      assert.equal(new URL(page.url()).searchParams.get('s'), '2027-01-01', 'Start date must survive edits');
      assert.equal(new URL(page.url()).searchParams.get('e'), '2027-12-31', 'End date must survive edits');
      for (const control of [input, add, overlapInput, overlap.getByRole('button', { name: 'Add', exact: true }), overlap.getByRole('button', { name: 'Remove 2027-04-12' })]) {
        const box = await control.boundingBox();
        assert.ok(box && box.height >= 43.5, 'Touch target must be at least 44px high');
      }
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(scrollWidth <= width + 1, 'More options must not overflow horizontally: ' + scrollWidth + ' > ' + width);
      assert.deepEqual(errors, [], 'No client runtime errors');
      await page.screenshot({ path: resolve(out, 'options-after-' + width + '.png'), fullPage: true });
      report.results.push({ width, status: 'passed', scrollWidth });
    } catch (error) {
      report.results.push({ width, status: 'failed', reason: String(error), errors });
      await page.screenshot({ path: resolve(out, 'failure-' + width + '.png'), fullPage: true }).catch(() => {});
    } finally {
      await context.close();
    }
  }
  report.status = report.results.every((r) => r.status === 'passed') ? 'passed' : 'failed';
} catch (error) {
  report.status = 'unavailable';
  report.reason = String(error);
} finally {
  await browser?.close();
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify(report));
if (report.status !== 'passed') process.exitCode = 1;
