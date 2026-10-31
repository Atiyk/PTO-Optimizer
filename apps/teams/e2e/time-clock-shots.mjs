// Screens and axe for the time clock work (node e2e/time-clock-shots.mjs <baseUrl> <shotsDir>), against a production
// build with DEV_LOGIN=1: landing, compliance inbox, timesheets (team + one person), work rules, find cover (overtime
// ranked last) at 1440 and 375; the staff phone clock (clocked out, clocked in, clock-out question) and Hours tab at 375.
// Fails on a page error, a horizontal overflow, or any axe WCAG 2.2 AA violation.
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:3100';
const out = process.argv[3] ?? 'shots';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
const errors = [];
const axeReport = {};
const shoot = async (p, name, widths = [1440, 375], reload = true) => {
  for (const w of widths) {
    if (reload) {
      await p.setViewportSize({ width: w, height: w === 375 ? 812 : 900 });
      await p.reload({ waitUntil: 'networkidle' });
    }
    await p.screenshot({ path: `${out}/${name}-${w}.png`, fullPage: true });
    const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (over > 0) errors.push(`${name}-${w} overflows by ${over}px`);
    const r = await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    axeReport[`${name}@${w}`] = r.violations.map((v) => ({ id: v.id, nodes: v.nodes.length, sample: v.nodes[0]?.target.join(' '), summary: v.nodes[0]?.failureSummary }));
    if (r.violations.length) errors.push(`${name}-${w}: axe ${r.violations.map((v) => v.id).join(', ')}`);
  }
  if (reload) await p.setViewportSize({ width: 1440, height: 900 });
};
const iso = (d) => d.toISOString().slice(0, 10);
const today = new Date(`${iso(new Date())}T00:00:00Z`);
const monday = new Date(today);
monday.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7));
const lastMonday = new Date(monday);
lastMonday.setUTCDate(monday.getUTCDate() - 7);
const nextMonday = new Date(monday);
nextMonday.setUTCDate(monday.getUTCDate() + 7);

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`desk: ${e.message}`));
await page.goto(base, { waitUntil: 'networkidle' });
await shoot(page, 'landing');
await page.goto(`${base}/dev/login`);
await page.getByRole('button', { name: /childcare centre/ }).click();
await page.waitForURL(/\/app\/coverage/, { timeout: 120000 });

await page.goto(`${base}/app/compliance`, { waitUntil: 'networkidle' });
await shoot(page, 'compliance');
await page.goto(`${base}/app/time?week=${iso(lastMonday)}`, { waitUntil: 'networkidle' });
await shoot(page, 'timesheets');
await page.getByRole('link', { name: 'Kwame Mensah' }).first().click();
await page.waitForURL(/member=/);
await shoot(page, 'timesheet-person', [1440]);
await page.goto(`${base}/app/admin/work-rules`, { waitUntil: 'networkidle' });
await shoot(page, 'work-rules');
await page.goto(`${base}/app/coverage?date=${iso(nextMonday)}&day=${iso(nextMonday)}`, { waitUntil: 'networkidle' });
await page.getByRole('link', { name: /Find cover/ }).first().click();
await page.waitForURL(/coverage\/cover/);
await shoot(page, 'find-cover');

// The staff phone: Ava Bennett signs in with a code, clocks in, then sees the clock-out question.
await page.goto(`${base}/app/admin`, { waitUntil: 'networkidle' });
await page.getByLabel('Person').first().selectOption({ label: 'Ava Bennett' });
await page.getByRole('button', { name: 'Get a sign-in code' }).click();
const status = page.getByRole('status').filter({ hasText: 'Code for' });
await status.waitFor();
const code = (await status.locator('span.font-mono').textContent()).trim();
const m = await (await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true })).newPage();
m.on('pageerror', (e) => errors.push(`phone: ${e.message}`));
await m.goto(`${base}/m/signin`, { waitUntil: 'networkidle' });
await m.getByLabel(/Sign-in code/).fill(code);
await m.getByRole('button', { name: 'Sign in with code' }).click();
await m.waitForURL(/\/m$/);
await m.waitForLoadState('networkidle');
await shoot(m, 'phone-clocked-out', [375], false);
await m.getByRole('button', { name: 'Clock in' }).tap();
await m.waitForLoadState('networkidle');
await m.getByText(/On the clock since/).waitFor();
await shoot(m, 'phone-clocked-in', [375], false);
await m.getByRole('button', { name: 'Clock out' }).tap();
await m.getByText(/paid rest breaks/).waitFor();
await m.screenshot({ path: `${out}/phone-clock-out-question-375.png`, fullPage: true });
await m.getByRole('button', { name: 'Not yet' }).tap();
await m.goto(`${base}/m/time?week=${iso(lastMonday)}`, { waitUntil: 'networkidle' });
await shoot(m, 'phone-hours', [375], false);

writeFileSync(`${out}/axe.json`, JSON.stringify(axeReport, null, 2));
console.log(JSON.stringify({ errors }));
await browser.close();
if (errors.length) process.exit(1);
