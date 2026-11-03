/** Local-only static consumer privacy and contact QA. No account data. */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
const base = new URL(process.argv[2] || 'http://127.0.0.1:4173');
const out = resolve(process.argv[3] || 'qa-evidence/privacy');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const records = [];
try {
  for (const width of [1440, 768, 375, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'en-US', reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      return url.origin === base.origin ? route.continue() : route.abort();
    });
    const result = { width, status: 'failed', errors };
    try {
      const response = await page.goto(new URL('/privacy.html', base).href, { waitUntil: 'networkidle', timeout: 30000 });
      result.ok = response?.ok() ?? false;
      result.title = await page.title();
      result.singleMain = await page.locator('main#main-content').count() === 1;
      result.singleHeading = await page.getByRole('heading', { level: 1 }).count() === 1;
      result.sections = (await page.getByRole('heading', { name: 'What stays in your browser' }).count()) === 1
        && (await page.getByRole('heading', { name: 'What happens when you share a plan' }).count()) === 1
        && (await page.getByRole('heading', { name: 'Lightweight usage analytics' }).count()) === 1;
      result.mailto = (await page.getByRole('link', { name: 'Email Gapless' }).getAttribute('href'))
        === 'mailto:atiykahmeed6310@gmail.com?subject=Gapless%20feedback';
      result.noFormerBrand = !(await page.locator('body').innerText()).includes('formerly Days Off');
      result.noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
      result.mobileCTAHeight = (await page.getByRole('link', { name: 'Plan PTO' }).boundingBox())?.height ?? 0;
      result.font = await page.locator('body').evaluate(element => getComputedStyle(element).fontFamily);
      const skip = page.getByRole('link', { name: 'Skip to main content' });
      await skip.focus();
      await page.keyboard.press('Enter');
      result.skipTarget = await page.evaluate(() => document.activeElement?.id === 'main-content' || location.hash === '#main-content');
      result.status = result.ok && result.singleMain && result.singleHeading && result.sections
        && result.mailto && result.noFormerBrand && result.noOverflow
        && result.mobileCTAHeight >= 44 && result.font.includes('Figtree')
        && result.skipTarget && errors.length === 0 ? 'passed' : 'failed';
      await page.screenshot({ path: resolve(out, 'privacy-' + width + '.png'), fullPage: true });
      // Terms is a second static page, not a subscription form or a client route.
      const termsResponse = await page.goto(new URL('/terms.html', base).href, { waitUntil: 'networkidle', timeout: 30000 });
      result.termsStatusOK = termsResponse?.ok() ?? false;
      result.termsHeading = await page.getByRole('heading', { name: 'Terms of use', level: 1 }).count() === 1;
      result.termsLimitsVisible = await page.getByRole('heading', { name: 'Estimates, not professional advice' }).count() === 1;
      result.termsLinksPrivacy = await page.getByRole('link', { name: 'Privacy information' }).getAttribute('href') === '/privacy.html';
      result.termsEmail = await page.getByRole('link', { name: 'Email Gapless' }).getAttribute('href') === 'mailto:atiykahmeed6310@gmail.com?subject=Gapless%20terms';
      result.termsNoOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
      result.status = result.status === 'passed' && result.termsStatusOK && result.termsHeading &&
        result.termsLimitsVisible && result.termsLinksPrivacy && result.termsEmail && result.termsNoOverflow
        ? 'passed' : 'failed';
      await page.screenshot({ path: resolve(out, 'terms-' + width + '.png'), fullPage: true });
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
    } finally {
      records.push(result);
      await context.close();
    }
  }
} finally {
  await browser.close();
  await writeFile(resolve(out, 'report.json'), JSON.stringify({ records }, null, 2) + '\n');
}
for (const result of records) console.log(JSON.stringify(result));
if (records.some(record => record.status !== 'passed')) process.exitCode = 1;
