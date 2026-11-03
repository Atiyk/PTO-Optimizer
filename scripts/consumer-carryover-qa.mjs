/** Local-only reset disclosure browser QA at 1440/768/375/320. */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
const base = new URL(process.argv[2] || 'http://127.0.0.1:4173');
const output = resolve(process.argv[3] || 'qa-evidence/carryover');
const mode = process.argv[4] === 'before' ? 'before' : 'after';
await mkdir(output, { recursive: true });
const report = { scope: 'Synthetic /policy carryover', mode, results: [] };
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [1440, 768, 375, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 950 },
      timezoneId: 'America/New_York', locale: 'en-US', reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const u = new URL(route.request().url());
      if (u.origin === base.origin && u.pathname === '/_vercel/insights/script.js')
        return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
      return u.origin === base.origin ? route.continue() : route.abort();
    });
    const r = { width, errors, status: 'failed' };
    try {
      await page.goto(new URL('/policy/', base).href, { waitUntil: 'networkidle', timeout: 30000 });
      await page.getByRole('heading', { name: 'PTO expiration guard' }).waitFor();
      if (mode === 'before') {
        await page.screenshot({ path: resolve(output, 'carryover-before-' + width + '.png'), fullPage: true });
        r.status = 'captured';
        continue;
      }
      const openButton = page.getByRole('button', { name: 'Review next policy reset' });
      const target = await openButton.boundingBox();
      r.touchTargetHeight = target?.height ?? 0;
      await openButton.click();
      r.resetPanelVisible = await page.getByText('Potentially forfeited at reset').isVisible()
        && await page.getByText('Estimated carryover').isVisible()
        && await page.getByText('After reset, including new credits').isVisible();
      const closeButton = page.getByRole('button', { name: 'Hide next policy reset' });
      await closeButton.focus();
      await page.keyboard.press('Enter');
      r.keyboardCloses = await page.getByRole('button', { name: 'Review next policy reset' }).isVisible();
      await page.getByRole('button', { name: 'Review next policy reset' }).click();
      r.noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
      await page.screenshot({ path: resolve(output, 'carryover-' + width + '.png'), fullPage: true });
      r.status = errors.length === 0 && r.touchTargetHeight >= 44 && r.resetPanelVisible
        && r.keyboardCloses && r.noOverflow ? 'passed' : 'failed';
    } catch (error) {
      r.error = error instanceof Error ? error.message : String(error);
    } finally {
      report.results.push(r);
      await context.close();
    }
  }
} finally {
  await browser.close();
  await writeFile(resolve(output, mode + '-report.json'), JSON.stringify(report, null, 2) + '\n');
}
for (const r of report.results) console.log(JSON.stringify(r));
if (report.results.some(r => r.status === 'failed')) process.exitCode = 1;
