/** Targeted alternate-engine smoke tests against the production build fixture. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { firefox, webkit } from 'playwright';

const base = new URL(process.argv[2] || 'http://127.0.0.1:4173');
const output = resolve(process.argv[3] || 'qa-evidence/cross-browser');
await mkdir(output, { recursive: true });
const report = [];

for (const [name, engine] of Object.entries({ firefox, webkit })) {
  const result = { engine: name, status: 'failed', checks: [], errors: [] };
  report.push(result);
  let browser;
  try {
    browser = await engine.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 375, height: 850 },
      timezoneId: 'America/New_York',
      locale: 'en-US',
      reducedMotion: 'reduce',
    });
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.origin === base.origin && url.pathname === '/_vercel/insights/script.js') {
        return route.fulfill({ contentType: 'application/javascript', body: '' });
      }
      return url.origin === base.origin ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      // Check the app's clipboard payload independently of the engine's OS permission UI.
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (value) => { window.__timebowerClipboard = value; } },
      });
    });
    page.on('pageerror', (error) => result.errors.push(error.message));
    await page.clock.setFixedTime(new Date('2026-11-10T17:00:00Z'));
    await page.goto(new URL('/?home=1&c=US&b=15&s=2026-11-10&e=2027-11-09', base).href);
    await page.getByRole('link', { name: /Timebower.*home/ }).waitFor();
    const budget = page.getByRole('spinbutton', { name: 'PTO days available' });
    await budget.fill('12');
    await budget.press('Tab');
    assert.equal(await budget.inputValue(), '12');
    const through = page.getByLabel('Through', { exact: true });
    await through.fill('2027-10-20');
    await through.press('Tab');
    assert.equal(await through.inputValue(), '2027-10-20');
    const fullPlan = page.getByRole('link', { name: /See the full plan/ }).first();
    await fullPlan.waitFor();
    await page.waitForFunction(() => {
      const href = document.querySelector('a[href*="b=12"][href*="e=2027-10-20"]');
      return Boolean(href);
    });
    const link = new URL(await fullPlan.getAttribute('href'), base);
    assert.equal(link.searchParams.get('b'), '12');
    assert.equal(link.searchParams.get('e'), '2027-10-20');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.getByRole('button', { name: 'Copy this PTO plan' }).click();
    await page.getByText('Link copied.', { exact: true }).waitFor();
    const copied = new URL(await page.evaluate(() => window.__timebowerClipboard));
    assert.equal(copied.searchParams.get('b'), '12');
    assert.equal(copied.searchParams.get('e'), '2027-10-20');
    assert.equal(copied.searchParams.has('eh'), false);
    result.checks.push('live budget, native date input, clipboard payload, and mobile reflow');

    // The static fixture serves the real planner at the directory index.
    link.pathname = '/pto/';
    await page.goto(link.href, { waitUntil: 'domcontentloaded' });
    await page.locator('main[data-plan-ready="true"]').waitFor({ state: 'visible' });
    await page.getByRole('heading', { name: 'Your time off' }).waitFor();
    await page.getByRole('heading', { name: 'Your complete plan' }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.getByRole('button', { name: 'More options', exact: true }).click();
    const file = Buffer.from([
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:qa-synthetic',
      'DTSTART;VALUE=DATE:20270310', 'DTEND;VALUE=DATE:20270311',
      'SUMMARY:Synthetic busy day', 'END:VEVENT', 'END:VCALENDAR', '',
    ].join('\r\n'));
    await page.getByLabel('Import calendar file (.ics)').setInputFiles({
      name: 'synthetic.ics', mimeType: 'text/calendar', buffer: file,
    });
    await page.getByText(/Found 1 busy day/).waitFor();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    result.checks.push('recipient planner route, mobile reflow and local calendar-file preview');

    await page.goto(new URL('/policy/', base).href);
    const currentBalance = page.getByRole('spinbutton', { name: 'Current PTO balance (days)' });
    await currentBalance.fill('0');
    await currentBalance.press('Tab');
    assert.equal(await currentBalance.inputValue(), '0');
    assert.equal(new URL(page.url()).searchParams.has('cb'), false);
    await page.reload();
    assert.equal(await currentBalance.inputValue(), '0');
    result.checks.push('explicit zero survives reload without a private balance in the address');
    assert.deepEqual(result.errors, []);
    result.status = 'passed';
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  } finally {
    await browser?.close();
  }
}

await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
for (const result of report) console.log(JSON.stringify(result));
if (report.some(({ status }) => status !== 'passed')) process.exitCode = 1;
