// Screens and axe for approvals routing, policy automations, events and reports
// (node e2e/approvals-automations-shots.mjs <baseUrl> <shotsDir>), against a production build with DEV_LOGIN=1:
// reports, events, admin approvals & policies, approvals inbox and the calendar at 1440 and 375; the manager phone
// approvals page and the phone Me page at 375. Fails on a page error, a horizontal overflow, or any axe WCAG 2.2 AA violation.
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:3100';
const out = process.argv[3] ?? 'shots';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
const errors = [];
const axeReport = {};
const check = async (p, key) => {
  const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (over > 0) errors.push(`${key} overflows by ${over}px`);
  const r = await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  axeReport[key] = r.violations.map((v) => ({ id: v.id, nodes: v.nodes.length, sample: v.nodes[0]?.target.join(' '), summary: v.nodes[0]?.failureSummary }));
  if (r.violations.length) errors.push(`${key}: axe ${r.violations.map((v) => v.id).join(', ')}`);
};
const shoot = async (p, name, widths = [1440, 375]) => {
  for (const w of widths) {
    await p.setViewportSize({ width: w, height: w === 375 ? 812 : 900 });
    await p.reload({ waitUntil: 'networkidle' });
    await p.screenshot({ path: `${out}/${name}-${w}.png`, fullPage: true });
    await check(p, `${name}-${w}`);
  }
  await p.setViewportSize({ width: 1440, height: 900 });
};

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`desk: ${e.message}`));
await page.goto(`${base}/dev/login`);
await page.getByRole('button', { name: /childcare centre/ }).click();
await page.waitForURL(/\/app\/coverage/, { timeout: 120000 });

await page.goto(`${base}/app/reports`, { waitUntil: 'networkidle' });
await shoot(page, 'reports');
await page.goto(`${base}/app/events`, { waitUntil: 'networkidle' });
await shoot(page, 'events');
await page.goto(`${base}/app/admin/policies`, { waitUntil: 'networkidle' });
await shoot(page, 'admin-policies');
await page.goto(`${base}/app/approvals`, { waitUntil: 'networkidle' });
await shoot(page, 'approvals');
await page.goto(`${base}/app/calendar`, { waitUntil: 'networkidle' });
await shoot(page, 'calendar', [1440]);
await page.goto(`${base}/app`, { waitUntil: 'networkidle' });
await shoot(page, 'home', [1440]);

// The phone, signed in as the same admin (the session cookie is shared within the context).
await page.setViewportSize({ width: 375, height: 812 });
for (const [path, name] of [['/m/approvals', 'phone-approvals'], ['/m/me', 'phone-me']]) {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${out}/${name}-375.png`, fullPage: true });
  await check(page, `${name}-375`);
}

writeFileSync(`${out}/axe.json`, JSON.stringify(axeReport, null, 2));
await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`ok: ${Object.keys(axeReport).length} screens, 0 axe violations`);
