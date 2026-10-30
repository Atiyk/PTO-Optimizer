// Regulated coverage accessibility check (node e2e/rc-axe.mjs <baseUrl> <out.json>): axe (WCAG 2.2 AA)
// on the public pages and every coverage page at 1440 and 375, for the manager/owner and for a staff member's phone app.
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { writeFileSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:3100';
const out = process.argv[3] ?? 'rc-axe.json';
const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const report = {};
async function axe(label, url) {
  for (const w of [1440, 375]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(base + url);
    await page.waitForLoadState('networkidle');
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    report[`${label}@${w}`] = r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes[0]?.target.join(' '), summary: v.nodes[0]?.failureSummary }));
  }
}
// Public pages first (signed out): landing, try the demo, sign-in, status.
for (const [label, url] of [['landing', '/'], ['try', '/try'], ['signin', '/signin'], ['status', '/status'], ['demo-coverage', '/demo/coverage']]) await axe(label, url);
await page.goto(`${base}/dev/login`);
await page.getByRole('button', { name: /childcare centre/ }).click();
await page.waitForURL(/\/app\/coverage/, { timeout: 120000 });
const today = new Date().toISOString().slice(0, 10);
const d = new Date(`${today}T00:00:00Z`);
d.setUTCDate(d.getUTCDate() + 7 - ((d.getUTCDay() + 6) % 7));
const monday = d.toISOString().slice(0, 10);
for (const [label, url] of [
  ['app-home', '/app'],
  ['coverage', `/app/coverage?date=${monday}&day=${monday}`],
  ['forecast', '/app/coverage/forecast'],
  ['cover-requests', '/app/coverage/cover'],
  ['admin-coverage', '/app/admin/coverage'],
  ['admin-credentials', '/app/admin/credentials'],
  ['sick-leave', '/app/sick'],
  ['planner', '/app/planner'],
  ['agents-webhooks', '/app/admin/agents'],
]) await axe(label, url);
// A staff member on the phone app.
await page.goto(`${base}/dev/login`);
// The last Hannah Moore: the centre created above (the /demo/coverage sample has one too).
await page.locator('li').filter({ hasText: 'Hannah Moore' }).getByRole('button', { name: 'Sign in' }).last().click();
await page.waitForURL(/\/app/);
for (const [label, url] of [['m-today', '/m'], ['m-offers', '/m/offers'], ['m-leave', '/m/leave'], ['m-me', '/m/me']]) await axe(label, url);
await page.goto(`${base}/api/auth/signout?to=m`).catch(() => {});
await axe('m-signin', '/m/signin');
writeFileSync(out, JSON.stringify(report, null, 2));
const bad = Object.entries(report).filter(([, v]) => v.length);
console.log(bad.length ? `axe violations on ${bad.length} page-widths: ${JSON.stringify(bad)}` : `axe: 0 violations on ${Object.keys(report).length} page-widths`);
await browser.close();
