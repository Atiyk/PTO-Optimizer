/** Consumer-only F4 interaction evidence at 1440/768/375/320. No personal data is logged. */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const base = new URL(process.argv[2] || 'http://127.0.0.1:4173');
const output = resolve(process.argv[3] || 'qa-evidence/quick-forecast');
const mode = process.argv[4] === 'before' ? 'before' : 'after';
await mkdir(output, { recursive: true });
const report = { scope: 'Synthetic signed-out /policy quick forecast', mode, results: [] };
const browser = await chromium.launch({ headless: true });

try {
  for (const width of [1440, 768, 375, 320]) {
    const context = await browser.newContext({
      viewport: { width, height: 950 }, locale: 'en-US',
      timezoneId: 'America/New_York', reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.origin === base.origin && url.pathname === '/_vercel/insights/script.js') {
        return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
      }
      return url.origin === base.origin ? route.continue() : route.abort();
    });
    const result = { width, errors, status: 'failed' };
    try {
      await page.goto(new URL('/policy/', base).href, { waitUntil: 'networkidle', timeout: 30000 });
      await page.getByRole('heading', { name: 'PTO balance forecast' }).waitFor();
      if (mode === 'before') {
        await page.screenshot({ path: resolve(output, `policy-forecast-before-${width}.png`), fullPage: true });
        result.status = 'captured';
        continue;
      }
      const input = page.getByLabel('Forecast my balance on');
      const oneMonth = page.getByRole('button', { name: '1 month', exact: true });
      const sixMonths = page.getByRole('button', { name: '6 months', exact: true });
      const presets = page.getByRole('group', { name: 'Quick forecast dates' });
      const initial = await input.inputValue();
      const bounds = await oneMonth.boundingBox();
      result.allPresetsVisible = await presets.isVisible()
        && await page.getByRole('button', { name: '3 months', exact: true }).isVisible()
        && await page.getByRole('button', { name: 'Year-end', exact: true }).isVisible();
      result.touchTargetHeight = bounds?.height ?? 0;
      await oneMonth.click();
      const selected = await input.inputValue();
      result.changedLive = selected !== initial && await oneMonth.getAttribute('aria-pressed') === 'true';
      await page.reload({ waitUntil: 'networkidle' });
      await page.getByRole('heading', { name: 'PTO balance forecast' }).waitFor();
      result.restoredFromURL = await page.getByLabel('Forecast my balance on').inputValue() === selected;
      await sixMonths.focus();
      await page.keyboard.press('Enter');
      result.keyboardChangesDate = await page.getByLabel('Forecast my balance on').inputValue() !== selected;
      result.noHorizontalOverflow = await page.evaluate(() =>
        document.documentElement.scrollWidth <= window.innerWidth + 1);
      result.freeformDateVisible = await page.getByLabel('Forecast my balance on').isVisible();
      result.noSubmitButton = await page.locator('button[type="submit"],input[type="submit"]').count() === 0;
      await page.screenshot({ path: resolve(output, `policy-forecast-${width}.png`), fullPage: true });
      result.status = errors.length === 0 && result.allPresetsVisible && result.touchTargetHeight >= 44
        && result.changedLive && result.restoredFromURL && result.keyboardChangesDate
        && result.noHorizontalOverflow && result.freeformDateVisible && result.noSubmitButton
        ? 'passed' : 'failed';
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
    } finally {
      report.results.push(result);
      await context.close();
    }
  }
} finally {
  await browser.close();
  await writeFile(resolve(output, `${mode}-report.json`), `${JSON.stringify(report, null, 2)}\n`);
}
for (const result of report.results) console.log(JSON.stringify(result));
if (report.results.some((result) => result.status === 'failed')) process.exitCode = 1;
