/**
 * Focused consumer-only header browser QA. Called by consumer-validation.yml after
 * the built Vite preview is ready; saves real screenshots and a machine-readable report.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const [base = 'http://127.0.0.1:4173', out = 'qa-evidence/header'] = process.argv.slice(2);
const output = resolve(out);
await mkdir(output, { recursive: true });
const origin = new URL(base).origin;
const results = [];
const browser = await chromium.launch({
  ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}),
  headless: true,
});
let failure;
try {
  for (const width of [1440, 768, 375, 320]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      reducedMotion: 'reduce',
      locale: 'en-US',
    });
    const page = await context.newPage();
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.origin === origin && url.pathname === '/_vercel/insights/script.js') {
        return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
      }
      return url.origin === origin ? route.continue() : route.abort();
    });
    const entry = { width, checks: [] };
    results.push(entry);
    try {
      await page.goto(new URL('/pto/?c=US&s=2027-01-01&e=2027-12-31&b=15', origin).href, { waitUntil: 'domcontentloaded' });
      await page.locator('main[data-plan-ready="true"]').waitFor({ state: 'visible' });
      await page.evaluate(() => document.fonts.ready);
      const logo = page.getByRole('link', { name: /home/i }).first();
      if (!(await logo.isVisible())) throw new Error('Logo/home link not visible');
      if (await logo.getAttribute('aria-label') !== null) {
        throw new Error('Home brand link must derive its accessible name from visible text rather than an overriding aria-label');
      }
      const labelledHome = page.getByRole('link', { name: /Timebower\s+home/i });
      if (await labelledHome.count() !== 1) throw new Error('Visible wordmark and home accessible name mismatch');
      entry.checks.push('Home accessible name includes visible Timebower wordmark');
      // 2026-11 IA: three destinations (Plan, My PTO, Learn); the header "Main" nav from
      // 768px up, a fixed bottom "Tools" tab bar below.
      const target = width >= 768
        ? page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Plan' })
        : page.getByRole('navigation', { name: 'Tools' }).getByRole('link', { name: 'Plan' });
      if (!(await target.isVisible())) throw new Error('Expected navigation control not visible');

      // Real keyboard Tab navigation is necessary: programmatic focus does not
      // reliably activate :focus-visible and would give false-positive evidence.
      let keyboardReached = false;
      for (let attempt = 0; attempt < 16; attempt += 1) {
        await page.keyboard.press('Tab');
        keyboardReached = await target.evaluate((el) => document.activeElement === el);
        if (keyboardReached) break;
      }
      if (!keyboardReached) throw new Error('Target not reachable through keyboard Tab');
      const focus = await target.evaluate((el) => {
        const css = getComputedStyle(el);
        return { style: css.outlineStyle, width: css.outlineWidth };
      });
      if (focus.style === 'none' || parseFloat(focus.width) < 2) {
        throw new Error(`No visible keyboard focus outline: ${JSON.stringify(focus)}`);
      }
      entry.checks.push('Keyboard Tab reaches navigation with visible 2px focus outline');

      if (width < 768) {
        // Phones get a fixed bottom tab bar with every destination, instead of a Menu disclosure.
        const tabs = page.getByRole('navigation', { name: 'Tools' });
        const links = tabs.getByRole('link');
        const names = (await links.allTextContents()).map((t) => t.trim());
        if (names.join('|') !== 'Plan|My PTO|Learn') throw new Error(`Tab bar destinations wrong: ${names.join(', ')}`);
        for (const link of await links.all()) {
          const box = await link.boundingBox();
          if (!box || box.height < 44 || box.width < 44) throw new Error(`Tab target below 44px: ${await link.textContent()}`);
        }
        const bar = await tabs.boundingBox();
        if (!bar || Math.abs(bar.y + bar.height - 900) > 1) throw new Error(`Tab bar not fixed to the bottom: ${JSON.stringify(bar)}`);
        if ((await links.first().getAttribute('aria-current')) !== 'page') throw new Error('Tab bar does not mark the current page');
        // The last content must be reachable above the bar.
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        const covered = await page.evaluate(() => {
          const footerLast = [...document.querySelectorAll('footer p')].pop();
          const barTop = document.querySelector('nav[aria-label="Tools"]')?.getBoundingClientRect().top ?? 0;
          return footerLast ? footerLast.getBoundingClientRect().bottom > barTop + 1 : true;
        });
        if (covered) throw new Error('Tab bar covers the end of the page');
        entry.checks.push('Tab bar: three destinations, 44px targets, fixed to the bottom, never covers content');
        await page.screenshot({ path: resolve(output, `header-tabbar-${width}.png`), fullPage: false });
      } else {
        const main = page.getByRole('navigation', { name: 'Main' });
        const names = (await main.getByRole('link').allTextContents()).map((t) => t.trim());
        if (names.join('|') !== 'Plan|My PTO|Learn') throw new Error(`Header destinations wrong: ${names.join(', ')}`);
        if ((await main.getByRole('link', { name: 'Plan' }).getAttribute('aria-current')) !== 'page') throw new Error('Header does not mark the current page');
        if (await page.getByRole('navigation', { name: 'Tools' }).isVisible()) throw new Error('Phone tab bar visible at tablet or desktop width');
        const links = page.locator('header nav a:visible');
        for (const link of await links.all()) {
          const box = await link.boundingBox();
          if (!box || box.height < 44) throw new Error(`Desktop nav target below 44px: ${await link.textContent()}`);
        }
        entry.checks.push('Desktop nav links meet 44px touch height');
      }
      const headerOverflow = await page.locator('header').evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, viewport: window.innerWidth };
      });
      if (headerOverflow.left < -1 || headerOverflow.right > width + 1) {
        throw new Error(`Header exceeds viewport: ${JSON.stringify(headerOverflow)}`);
      }
      entry.checks.push('Header fits viewport without horizontal overflow');
      await page.screenshot({ path: resolve(output, `header-${width}.png`), fullPage: false });
      entry.status = 'passed';
    } catch (error) {
      entry.status = 'failed';
      entry.error = error instanceof Error ? error.message : String(error);
      failure ??= entry.error;
      await page.screenshot({ path: resolve(output, `header-failed-${width}.png`), fullPage: false }).catch(() => {});
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
  await writeFile(resolve(output, 'report.json'), JSON.stringify({
    status: failure ? 'failed' : 'passed',
    source: 'Real Playwright Chromium keyboard and viewport checks',
    results,
  }, null, 2) + '\n');
}
if (failure) {
  console.error('Consumer header browser QA failed:', failure);
  process.exitCode = 1;
} else {
  console.log('Consumer header browser QA passed at 1440, 768, 375, and 320px');
}
