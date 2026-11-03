/** Dedicated consumer FAQ evidence; run against a built Vite preview.
 * Produces actual before/after screenshots at 1440/768/375/320 and fails on
 * broken native disclosure keyboard behavior, overflow, or missing SSR content.
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const [base = 'http://127.0.0.1:4178', out = 'qa-evidence/faq', label = 'after'] = process.argv.slice(2);
await mkdir(resolve(out), { recursive: true });
const report = { label, status: 'running', results: [] };
let browser;
try {
  browser = await chromium.launch({ headless: true });
  for (const width of [1440, 768, 375, 320]) {
    for (const route of [
      { name: 'faq', path: '/faq/' },
      { name: 'pto-inline-faq', path: '/pto/?c=US&s=2027-01-01&e=2027-12-31&b=15' },
    ]) {
      const context = await browser.newContext({
        viewport: { width, height: 900 }, reducedMotion: 'reduce',
        timezoneId: 'America/New_York',
      });
      const page = await context.newPage();
      await page.clock.setFixedTime(new Date('2026-11-02T17:00:00Z'));
      const origin = new URL(base).origin;
      await page.route('**/*', requestRoute => {
        const url = new URL(requestRoute.request().url());
        if (url.origin === origin && url.pathname === '/_vercel/insights/script.js') {
          return requestRoute.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
        }
        return ['http:', 'https:'].includes(url.protocol) && url.origin !== origin
          ? requestRoute.abort() : requestRoute.continue();
      });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      const result = { width, route: route.name, errors };
      try {
        const response = await page.goto(new URL(route.path, base), { waitUntil: 'networkidle' });
        if (!response?.ok()) throw new Error(`Route returned ${response?.status()}`);
        const serverHtml = await response.text();
        if (!serverHtml.includes('How does it choose which days to take?')) {
          throw new Error('FAQ question missing from prerendered HTML');
        }
        const summary = route.name === 'faq'
          ? page.locator('main details > summary').first()
          : page.locator('#questions details > summary').first();
        await summary.waitFor({ state: 'visible' });
        const details = summary.locator('xpath=..');
        result.initiallyClosed = !(await details.evaluate(el => el.open));
        await summary.focus();
        await page.keyboard.press('Enter');
        result.keyboardOpened = await details.evaluate(el => el.open);
        result.answerVisible = await details.locator('p').first().isVisible();
        await page.keyboard.press('Enter');
        result.keyboardClosed = !(await details.evaluate(el => el.open));
        result.touchTargetHeight = await summary.evaluate(el => Math.round(el.getBoundingClientRect().height));
        result.documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        result.overflow = result.documentWidth > width + 1;
        if (route.name === 'faq') {
          const nav = page.getByRole('navigation', { name: 'FAQ sections' });
          result.navVisible = await nav.isVisible();
          result.navLinksTouchSized = await nav.locator('a').evaluateAll(
            links => links.every(link => link.getBoundingClientRect().height >= 44),
          );
          await nav.locator('a[href="#sabbatical"]').click();
          result.anchorWorks = new URL(page.url()).hash === '#sabbatical';
        }
        await page.screenshot({ path: resolve(out, `${route.name}-${width}.png`), fullPage: true });
        result.status = result.initiallyClosed && result.keyboardOpened && result.answerVisible
          && result.keyboardClosed && result.touchTargetHeight >= 44 && !result.overflow
          && result.navVisible !== false && result.navLinksTouchSized !== false
          && result.anchorWorks !== false && !errors.length ? 'passed' : 'failed';
      } catch (error) {
        result.status = 'failed';
        result.error = error instanceof Error ? error.message : String(error);
      } finally {
        report.results.push(result);
        await context.close();
      }
    }
  }
  report.status = report.results.every(item => item.status === 'passed') ? 'passed' : 'failed';
} catch (error) {
  report.status = 'unavailable';
  report.error = error instanceof Error ? error.message : String(error);
} finally {
  await browser?.close();
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify(report));
if (report.status !== 'passed') process.exitCode = 1;
