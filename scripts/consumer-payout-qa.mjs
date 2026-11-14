/** Synthetic, local-only payout browser evidence at desktop/tablet/mobile widths. */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const base = new URL(process.argv[2] || 'http://127.0.0.1:4173');
const output = resolve(process.argv[3] || 'qa-evidence/payout');
const mode = process.argv[4] === 'before' ? 'before' : 'after';
await mkdir(output, { recursive: true });
const report = { scope: 'Synthetic /policy payout scenarios', mode, results: [] };
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [1440, 768, 375, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 },
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
    const result = { width, errors, status: 'failed' };
    try {
      await page.goto(new URL('/policy/', base).href, { waitUntil: 'networkidle', timeout: 30000 });
      await page.getByRole('heading', { name: /^(?:Your PTO balance and policy|How much PTO will I have, and what am I about to lose\?)$/ }).first().waitFor();
      if (mode === 'before') {
        await page.screenshot({ path: resolve(output, 'policy-payout-before-' + width + '.png'), fullPage: true });
        result.status = 'captured';
        continue;
      }
      await page.goto(new URL('/policy/?c=US&cb=12&bao=2027-01-01&ak=fl&am=0&gd=2027-01-01&cm=a&ace=0#departure-payout', base).href, { waitUntil: 'networkidle' });
      await page.getByRole('heading', { name: 'What might my unused PTO be worth if I leave?' }).waitFor();
      const hourly = page.getByLabel('Hourly pay (gross)');
      const work = page.getByLabel('Work jurisdiction (where you work)');
      const employer = page.getByLabel('Employer payout assumption');
      const target = await hourly.boundingBox();
      result.payTouchTarget = target?.height ?? 0;
      result.unknownByDefault = await employer.inputValue() === 'unknown';
      await work.fill('Private Test Work City, US');
      await hourly.fill('98765.43');
      await employer.selectOption('pays-all');
      result.resultVisible = await page.locator('#departure-payout [aria-live="polite"]').isVisible();
      const urlAfter = decodeURIComponent(page.url());
      result.noPayOrJurisdictionInURL = !urlAfter.includes('98765.43') && !urlAfter.includes('Private Test Work City');
      result.legalCaveat = await page.getByText('Employment law is not verified here.', { exact: false }).isVisible();
      await employer.selectOption('pays-none');
      result.zeroForNone = (await page.locator('#departure-payout [aria-live="polite"]').innerText()).trim() === '$0.00';
      await employer.selectOption('pays-up-to');
      const cap = page.getByLabel('Payout cap (days)');
      result.capVisible = await cap.isVisible();
      await cap.fill('0');
      result.zeroForZeroCap = (await page.locator('#departure-payout [aria-live="polite"]').innerText()).trim() === '$0.00';
      result.noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
      await page.locator('#departure-payout').screenshot({ path: resolve(output, 'policy-payout-' + width + '.png') });
      result.status = errors.length === 0 && result.payTouchTarget >= 44 && result.unknownByDefault
        && result.resultVisible && result.noPayOrJurisdictionInURL && result.legalCaveat
        && result.zeroForNone && result.capVisible && result.zeroForZeroCap && result.noOverflow
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
  await writeFile(resolve(output, mode + '-report.json'), JSON.stringify(report, null, 2) + '\n');
}
for (const result of report.results) console.log(JSON.stringify(result));
if (report.results.some(result => result.status === 'failed')) process.exitCode = 1;
