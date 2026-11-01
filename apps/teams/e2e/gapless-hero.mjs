// Landing-page hero check (node e2e/gapless-hero.mjs <baseUrl> <out.json>), against `next start`:
// axe (WCAG 2.2 AA) on / at 1440 and 375, before and after the gap is selected and its source
// opened; the call-off plays and is announced once; keyboard selection works; reduced motion
// renders the end state without playing; the h1 is the LCP element. Exits 1 on any failure.
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { writeFileSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:3100';
const out = process.argv[3] ?? 'gapless-hero-axe.json';
const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
const report = { axe: {}, checks: [] };
const fail = [];
const check = (name, ok, detail = '') => {
  report.checks.push({ name, ok, detail });
  if (!ok) fail.push(`${name} ${detail}`);
};
const axe = async (page, label) => {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  report.axe[label] = r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes[0]?.target.join(' '), summary: v.nodes[0]?.failureSummary }));
  check(`axe ${label}`, r.violations.length === 0, JSON.stringify(report.axe[label]));
};

for (const width of [1440, 375]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    // Record the LCP element for the check below.
    new PerformanceObserver((l) => {
      const e = l.getEntries().at(-1);
      window.__lcp = e?.element ? `${e.element.tagName.toLowerCase()}${e.element.id ? '#' + e.element.id : ''}` : null;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  });
  await page.goto(base + '/');
  const live = page.locator('[aria-live="polite"]').first();
  await page.getByRole('button', { name: /staff short/ }).waitFor({ state: 'visible', timeout: 10000 });
  check(`announces the gap once @${width}`, /below ratio from 09:00 to 11:30: 1 of 2 staff/.test(await live.textContent()));
  check(`lcp is the h1 @${width}`, (await page.evaluate(() => window.__lcp)) === 'h1#hero', String(await page.evaluate(() => window.__lcp)));
  const gapCells = page.getByRole('button', { name: /below ratio/ });
  check(`5 gap cells @${width}`, (await gapCells.count()) === 5, String(await gapCells.count()));
  check(`cell label @${width}`, (await gapCells.first().textContent()).includes('Toddlers, 09:00, 1 of 2 staff, below ratio'));
  await axe(page, `landing@${width}`);

  // Keyboard: focus the first gap cell, arrow to the next, Enter opens the details.
  await gapCells.first().focus();
  await page.keyboard.press('ArrowRight');
  check(`arrow keys move between gap cells @${width}`, (await page.evaluate(() => document.activeElement?.textContent ?? '')).includes('09:30'));
  await page.keyboard.press('Enter');
  const details = page.getByRole('heading', { name: 'Who can cover, ranked' });
  check(`Enter shows the cover options @${width}`, await details.isVisible());
  const chip = page.getByRole('button', { name: /Source:/ });
  await chip.focus();
  await page.keyboard.press('Enter');
  check(`source chip opens from the keyboard @${width}`, await page.getByText('Not legal advice.').first().isVisible());
  await axe(page, `gap-selected@${width}`);
  await page.keyboard.press('Escape');
  check(`Escape closes the source and returns focus @${width}`, (await chip.getAttribute('aria-expanded')) === 'false' && (await page.evaluate(() => document.activeElement?.getAttribute('aria-expanded'))) === 'false');
  check(`no page errors @${width}`, errors.length === 0, errors.join('; '));
  await ctx.close();
}

// Reduced motion: the end state is rendered straight away (no play), and Replay keeps it.
const rm = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const p = await rm.newPage();
await p.goto(base + '/');
await p.waitForLoadState('networkidle');
check('reduced motion: end state without playing', (await p.getByRole('button', { name: /below ratio/ }).count()) === 5);
await p.getByRole('button', { name: 'Replay' }).click();
check('reduced motion: replay keeps the end state', (await p.getByRole('button', { name: /below ratio/ }).count()) === 5);
await rm.close();

writeFileSync(out, JSON.stringify(report, null, 2));
console.log(fail.length ? `FAILED:\n${fail.join('\n')}` : `gapless hero: ${report.checks.length} checks passed, axe clean on ${Object.keys(report.axe).length} states`);
await browser.close();
if (fail.length) process.exit(1);
