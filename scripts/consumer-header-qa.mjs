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
      await page.goto(new URL('/pto/?c=US&s=2027-01-01&e=2027-12-31&b=15', origin).href, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      const logo = page.getByRole('link', { name: /home/i }).first();
      if (!(await logo.isVisible())) throw new Error('Logo/home link not visible');
      const target = width >= 1024
        ? page.getByRole('link', { name: 'Plan PTO' }).first()
        : page.getByRole('button', { name: 'Menu' });
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

      if (width < 1024) {
        const menu = page.getByRole('button', { name: 'Menu' });
        const rect = await menu.boundingBox();
        if (!rect || rect.width < 44 || rect.height < 44) {
          throw new Error(`Mobile Menu target below 44px: ${JSON.stringify(rect)}`);
        }
        await menu.click();
        if ((await menu.getAttribute('aria-expanded')) !== 'true') throw new Error('Menu did not expand');
        const links = page.locator('header nav a:visible');
        if ((await links.count()) !== 4) throw new Error('Mobile menu must show four nav links');
        for (const link of await links.all()) {
          const box = await link.boundingBox();
          if (!box || box.height < 44) throw new Error(`Mobile nav target below 44px: ${await link.textContent()}`);
        }
        entry.checks.push('Menu and all four nav links meet 44px touch height');
        await page.screenshot({ path: resolve(output, `header-menu-open-${width}.png`), fullPage: false });
        await page.keyboard.press('Escape');
        if ((await menu.getAttribute('aria-expanded')) !== 'false') throw new Error('Escape did not close Menu');
        if (!(await menu.evaluate((el) => document.activeElement === el))) throw new Error('Escape did not return focus to Menu');
        entry.checks.push('Escape closes menu and restores focus');
      } else {
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
