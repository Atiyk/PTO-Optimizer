/**
 * Consumer-only browser evidence. Start the existing Vite server, then run:
 * node scripts/consumer-qa.mjs http://127.0.0.1:5173 /absolute/evidence/path before
 * PW_CHROMIUM_PATH may point to an already installed Chromium executable.
 * A missing browser produces an explicit unavailable report (exit 2), never a pass.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const [base = 'http://127.0.0.1:5173', output = 'qa-evidence', label = 'after'] = process.argv.slice(2);
const baseUrl = new URL(base);
if (!['http:', 'https:'].includes(baseUrl.protocol)) throw new Error('Use an HTTP(S) application URL.');
const outputDirectory = resolve(output);
await mkdir(outputDirectory, { recursive: true });
const reportPath = resolve(outputDirectory, 'report.json');
const report = {
  label,
  date: '2026-11-02',
  baseUrl: baseUrl.origin,
  status: 'running',
  scope: 'Consumer routes only; no account, backend, or B2B actions.',
  lighthouse: 'unavailable: this script does not run Lighthouse',
  accessibility: 'Basic DOM and keyboard smoke checks; not a WCAG conformance audit.',
  platformAnalytics: 'Vercel Insights script stubbed in this local static fixture; third-party analytics blocked.',
  results: [],
};

let browser;
try {
  browser = await chromium.launch({
    ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}),
    headless: true,
  });
} catch (error) {
  report.status = 'unavailable';
  report.reason = `Browser could not launch: ${error instanceof Error ? error.message : String(error)}`;
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.error(report.reason);
  console.error(`Evidence report: ${reportPath}`);
  process.exit(2);
}

const routes = [
  { name: 'home', path: '/', title: /Gapless PTO Optimizer/ },
  // Vite preview serves directory indexes at /pto/, whereas Vercel also maps the
  // clean /pto URL. A slashless preview URL silently falls back to the homepage.
  { name: 'pto', path: '/pto/?c=US&s=2027-01-01&e=2027-12-31&b=15', title: /Plan your PTO/ },
  { name: 'policy', path: '/policy/', title: /Your Time-Off Policy/ },
  { name: 'sabbatical', path: '/sabbatical/', title: /Sabbatical Planning/ },
  { name: 'understand', path: '/glossary/', title: /Glossary/ },
  { name: 'guide-accrual', path: '/glossary/accrual/', title: /Glossary/, guideHeading: 'How to forecast the PTO you will earn' },
  { name: 'guide-carryover', path: '/glossary/carryover/', title: /Glossary/, guideHeading: 'What happens to unused PTO at year end?' },
  { name: 'guide-holidays', path: '/glossary/company-holiday/', title: /Glossary/, guideHeading: 'Public holidays versus employer days off' },
  { name: 'guide-payout', path: '/glossary/payout/', title: /Glossary/, guideHeading: 'What could unused PTO be worth if you leave?' },
];

try {
  for (const width of [1440, 768, 375, 320]) {
    for (const route of routes) {
      // Narrowest viewport: enforce overflow and reading-order checks on the
      // Understand hub and guides, without changing legacy planner baselines.
      if (width === 320 && !['understand', 'guide-accrual', 'guide-carryover', 'guide-holidays', 'guide-payout'].includes(route.name)) continue;
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        timezoneId: 'America/New_York',
        locale: 'en-US',
        colorScheme: 'light',
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      await page.clock.setFixedTime(new Date('2026-11-02T17:00:00Z'));
      const runtimeErrors = [];
      const failedSameOriginResponses = [];
      page.on('pageerror', (error) => runtimeErrors.push(error.message));
      page.on('response', (response) => {
        const url = new URL(response.url());
        if (url.origin === baseUrl.origin && response.status() >= 400) {
          failedSameOriginResponses.push({ path: url.pathname, status: response.status() });
        }
      });
      // Keep third-party analytics out of an evidence run. Same-origin holiday fixtures
      // still load normally, so the solver uses the repository's real holiday data.
      await page.route('**/*', (requestRoute) => {
        const requestUrl = new URL(requestRoute.request().url());
        const { protocol, origin } = requestUrl;
        // This platform script exists only on Vercel, not the static Vite server.
        // Exercise application requests normally; analytics is outside this fixture.
        if (origin === baseUrl.origin && requestUrl.pathname === '/_vercel/insights/script.js') {
          return requestRoute.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
        }
        return ['http:', 'https:'].includes(protocol) && origin !== baseUrl.origin
          ? requestRoute.abort()
          : requestRoute.continue();
      });

      const result = { route: route.name, width, runtimeErrors, failedSameOriginResponses };
      try {
        await page.goto(new URL(route.path, baseUrl).href, { waitUntil: 'networkidle', timeout: 30000 });
        await page.locator('#root').waitFor({ state: 'visible', timeout: 15000 });
        await page.evaluate(() => document.fonts.ready);
        // Allow asynchronous same-origin holiday loading and React effects to settle.
        await page.waitForFunction(() => ![...document.querySelectorAll('p')].some((element) =>
          element.getClientRects().length > 0 && /^Loading(?:\b|…)/.test(element.textContent.trim()),
        ), undefined, { timeout: 15000 }).catch(() => { result.loadingDidNotSettle = true; });

        Object.assign(result, await page.evaluate(() => {
          const visible = (element) => element.getClientRects().length > 0;
          const nameOf = (element) => (element.getAttribute('aria-label')
            || (element.getAttribute('aria-labelledby') || '').split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ')
            || [...(element.labels || [])].map((item) => item.textContent).join(' ')
            || element.textContent || '').trim();
          const inputs = [...document.querySelectorAll('input:not([type="hidden"]),select,textarea')].filter(visible);
          const buttons = [...document.querySelectorAll('button')].filter(visible);
          return {
            title: document.title,
            heading: document.querySelector('h1')?.textContent.trim(),
            h1Count: document.querySelectorAll('h1').length,
            viewportWidth: window.innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
            unlabeledInputs: inputs.filter((item) => !nameOf(item)).map((item) => ({ tag: item.tagName, type: item.type, id: item.id })),
            unnamedButtons: buttons.filter((item) => !nameOf(item)).map((item) => ({ id: item.id })),
            canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') || null,
            formSubmitControls: [...document.querySelectorAll('button[type="submit"],input[type="submit"]')].filter(visible).length,
          };
        }));
        result.correctRoute = route.title.test(result.title);
        if (route.guideHeading) {
          result.guideContentVisible = await page.getByRole('heading', { name: route.guideHeading, exact: true }).isVisible();
          result.guideExampleVisible = await page.getByRole('heading', { name: 'A worked example', exact: true }).isVisible();
          result.guideQuestionsVisible = await page.getByRole('heading', { name: 'Three questions for HR', exact: true }).isVisible();
        }
        await page.screenshot({ path: resolve(outputDirectory, `${route.name}-${width}.png`), fullPage: true });

        result.keyboardFocus = [];
        await page.locator('body').click({ position: { x: 1, y: 1 } });
        for (let index = 0; index < 8; index += 1) {
          await page.keyboard.press('Tab');
          result.keyboardFocus.push(await page.evaluate(() => ({
            tag: document.activeElement?.tagName,
            name: (document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent || '').trim().slice(0, 100),
          })));
        }
        // A keyboard walk may leave the country listbox open. Finish that interaction
        // before independently testing the navigation menu and options disclosure.
        await page.keyboard.press('Escape');
        if (width < 1024) {
          const menu = page.getByRole('button', { name: 'Menu', exact: true });
          if (await menu.isVisible()) {
            await menu.focus();
            await page.keyboard.press('Enter');
            result.menuOpenedWithKeyboard = await menu.getAttribute('aria-expanded') === 'true';
            await page.keyboard.press('Escape');
            result.menuClosedWithEscape = await menu.getAttribute('aria-expanded') === 'false';
            result.menuFocusReturned = await menu.evaluate((element) => document.activeElement === element);
          }
        }
        if (route.name === 'pto') {
          const options = page.getByRole('button', { name: /More options/ });
          if (await options.isVisible()) {
            await options.click();
            await page.screenshot({ path: resolve(outputDirectory, `pto-options-${width}.png`), fullPage: true });
            result.optionsHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
          }
        }
        result.status = runtimeErrors.length || failedSameOriginResponses.length || result.horizontalOverflow
          || result.optionsHorizontalOverflow || result.h1Count !== 1 || result.unlabeledInputs.length
          || result.unnamedButtons.length || result.loadingDidNotSettle || result.formSubmitControls
          || !result.correctRoute || result.guideContentVisible === false || result.guideExampleVisible === false || result.guideQuestionsVisible === false
          || result.menuOpenedWithKeyboard === false || result.menuClosedWithEscape === false
          || result.menuFocusReturned === false ? 'failed' : 'passed';
      } catch (error) {
        result.status = 'failed';
        result.error = error instanceof Error ? error.message : String(error);
      } finally {
        report.results.push(result);
        await context.close();
      }
    }
  }
  report.status = report.results.every((result) => result.status === 'passed') ? 'passed' : 'failed';
} finally {
  await browser.close();
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

console.log(`Consumer browser QA: ${report.status}; ${report.results.length} route/viewport checks.`);
console.log(`Evidence report: ${reportPath}`);
for (const result of report.results.filter((item) => item.status !== 'passed')) {
  // All contexts use synthetic fixtures. Print actionable findings so connector-only
  // CI review does not require downloading a private binary artifact to read JSON.
  const { keyboardFocus: _keyboardFocus, ...finding } = result;
  console.error(JSON.stringify(finding));
}
if (report.status !== 'passed') process.exitCode = 1;
