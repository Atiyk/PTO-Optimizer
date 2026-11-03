/** One synthetic local-only /policy journey across combined expansion features. */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const base = new URL(process.argv[2] || 'http://127.0.0.1:4173');
const output = resolve(process.argv[3] || 'qa-evidence/expansion-journey');
await mkdir(output, { recursive: true });
const report = { scope: 'Combined /policy forecast, carryover and payout; synthetic pay input', results: [] };
const browser = await chromium.launch({ headless: true });

try {
  for (const width of [1440, 768, 375, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 },
      locale: 'en-US', timezoneId: 'America/New_York', reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === base.origin && url.pathname === '/_vercel/insights/script.js')
        return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
      return url.origin === base.origin ? route.continue() : route.abort();
    });
    const result = { width, errors, status: 'failed' };
    try {
      await page.goto(new URL('/policy/', base).href, { waitUntil: 'networkidle', timeout: 30000 });
      await page.getByRole('heading', { name: 'PTO balance forecast' }).waitFor();
      result.allThreeVisible = await page.getByRole('heading', { name: 'PTO expiration guard' }).isVisible()
        && await page.getByRole('heading', { name: 'What might my unused vacation be worth?' }).isVisible();
      const forecastDate = page.getByLabel('Forecast my balance on');
      const beforeDate = await forecastDate.inputValue();
      // Initial forecast can already be 3 months ahead. Use a 1-month shortcut to test a real change.
      await page.getByRole('button', { name: '1 month', exact: true }).click();
      const afterDate = await forecastDate.inputValue();
      result.forecastLive = afterDate !== beforeDate;
      await page.getByRole('button', { name: 'Explain this forecast using my policy' }).click();
      result.explanationVisible = await page.getByText('How time is earned').isVisible()
        && await page.getByText(/not a legal determination/).isVisible();
      await page.getByRole('button', { name: 'Review next policy reset' }).click();
      result.resetVisible = await page.getByText('Estimated carryover').isVisible()
        && await page.getByText('Potentially forfeited at reset').isVisible();

      const work = page.getByLabel('Work jurisdiction (where you work)');
      const pay = page.getByLabel('Hourly pay (gross)');
      await work.fill('Private Synthetic Test Work City');
      await pay.fill('98765.43');
      const rule = page.getByLabel('Employer payout assumption');
      result.unknownRuleDefault = await rule.inputValue() === 'unknown';
      await rule.selectOption('pays-all');
      result.grossResult = await page.locator('#departure-payout [aria-live="polite"]').isVisible();
      result.legalCaveat = await page.getByText('Employment law is not verified here.', { exact: false }).isVisible();
      result.privateInputsStayOffURL = !decodeURIComponent(page.url()).includes('98765.43')
        && !decodeURIComponent(page.url()).includes('Private Synthetic Test Work City');

      // Changing the forecast again must not delete or corrupt local-only pay input.
      await page.getByRole('button', { name: '6 months', exact: true }).click();
      result.payStatePreserved = await pay.inputValue() === '98765.43';
      result.noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
      await page.screenshot({ path: resolve(output, 'expansion-policy-' + width + '.png'), fullPage: true });
      result.status = errors.length === 0 && result.allThreeVisible && result.forecastLive
        && result.explanationVisible && result.resetVisible && result.unknownRuleDefault
        && result.grossResult && result.legalCaveat && result.privateInputsStayOffURL
        && result.payStatePreserved && result.noOverflow ? 'passed' : 'failed';
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
    } finally {
      report.results.push(result);
      await context.close();
    }
  }
} finally {
  await browser.close();
  await writeFile(resolve(output, 'combined-report.json'), JSON.stringify(report, null, 2) + '\n');
}
for (const result of report.results) console.log(JSON.stringify(result));
if (report.results.some(result => result.status !== 'passed')) process.exitCode = 1;
