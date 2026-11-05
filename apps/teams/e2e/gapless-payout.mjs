// PTO payout check (node e2e/gapless-payout.mjs <baseUrl> <outDir>), against `next start` with
// DEV_LOGIN=1 on a fresh PGlite dir: the owner of the 25-person demo org (San Francisco, CA) turns
// on money estimates and the employee opt-in, sets a policy with its handbook sentence and one pay
// rate, all from the page's forms; then the payout page (owner and a manager), the employee's
// balance screen and the staff app are screenshotted at 1440, 768 and 375 with axe (WCAG 2.2 AA).
// Also: the rate never appears on any page or in the CSV, the CSV is admin-only, sorting works,
// and an employee is sent away from /app/payout. Exits 1 on any failure.
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { writeFileSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:3100';
const outDir = process.argv[3] ?? '.';
const RATE = '31.25';
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
const noRate = async (page, where) => check(`no pay rate on ${where}`, !(await page.content()).includes(RATE));
const card = (page, title) => page.getByRole('heading', { name: title }).locator('xpath=ancestor::section[1]');
const save = async (page, section, button) => {
  await section.getByRole('button', { name: button }).click();
  await section.getByText('Saved.').waitFor({ timeout: 20000 });
};
const signInAs = async (page, name) => {
  await page.goto(base + '/dev/login');
  await page.locator('li', { hasText: name }).first().getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/app/, { timeout: 60000 });
};
const errors = [];

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(e.message));

// Owner: create the demo org and configure payout from the forms.
await page.goto(base + '/dev/login');
await page.getByRole('button', { name: 'Create the 25-person demo org' }).click();
await page.waitForURL(/\/app/, { timeout: 60000 });
await page.goto(base + '/app/payout');
check('payout page h1', (await page.getByRole('heading', { level: 1, name: 'PTO payout' }).count()) === 1);
check('estimate label shown', await page.getByText('Estimate. Your payroll provider pays; not legal advice.').first().isVisible());
check('no money column before opt-in', (await page.getByRole('columnheader', { name: /Estimated amount/ }).count()) === 0);
await page.screenshot({ path: `${outDir}/payout-admin-before-1440.png`, fullPage: true });

const who = card(page, 'Who sees money');
await who.getByLabel('Show payout estimates in money to managers and admins').check();
await who.getByLabel('Show employees their own payout estimate in money').check();
await save(page, who, 'Save who sees money');

const pol = card(page, /Set the .* payout policy/);
await pol.getByLabel('Pay unused balance at separation').selectOption('yes');
await pol.getByLabel(/Handbook sentence/).fill('Unused vacation is paid out at your final rate when you leave.');
await save(page, pol, 'Save payout policy');

await page.reload();
const rates = card(page, 'Pay rates');
await rates.getByLabel('Person').selectOption({ label: 'Sam Rivera' });
await rates.getByLabel('Hourly rate (USD)').fill(RATE);
await rates.getByLabel('Effective from').fill('2026-01-01');
await save(page, rates, 'Save pay rate');
await page.reload();
check('money column after opt-in', (await page.getByRole('columnheader', { name: /Estimated amount/ }).count()) === 1);
check('one rate on file', await page.getByText('1 person has a rate on file').isVisible());
check('Sam has an amount', /\$\d/.test(await page.locator('tr', { hasText: 'Sam Rivera' }).textContent()));
check('CA rule cited', (await page.getByRole('button', { name: /Source: Cal\. Labor Code/ }).count()) >= 1);
await noRate(page, '/app/payout (owner)');

for (const width of [1440, 768, 375]) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(base + '/app/payout');
  await page.waitForLoadState('networkidle');
  await axe(page, `payout-admin@${width}`);
  await page.screenshot({ path: `${outDir}/payout-admin-${width}.png`, fullPage: true });
  await card(page, 'State rules where you have sites').getByRole('button', { name: /Source:/ }).first().click();
  await axe(page, `payout-admin-source-open@${width}`);
  if (width === 1440) await card(page, 'State rules where you have sites').screenshot({ path: `${outDir}/payout-admin-state-source-1440.png` });
}
await page.setViewportSize({ width: 1440, height: 900 });

// Sorting by name.
await page.goto(base + '/app/payout');
await page.getByRole('columnheader', { name: /^Name/ }).getByRole('link').click();
await page.waitForURL(/sort=name/);
check('sorted by name', (await page.getByRole('columnheader', { name: /^Name/ }).getAttribute('aria-sort')) === 'ascending');
const names = (await page.locator('tbody th[scope=row]').allTextContents()).map((s) => s.trim());
check('rows in name order', names.join('|') === [...names].sort((a, b) => a.localeCompare(b)).join('|'), names.join(', '));

// CSV: owner gets it, with the notice and no rate.
const csv = await page.request.get(base + '/api/reports/payout?type=vacation&sort=name');
const body = await csv.text();
check('CSV downloads for the owner', csv.ok() && body.includes('Not legal advice') && body.includes('estimated_amount'), body.slice(0, 200));
check('CSV has no pay rate', !body.includes(RATE));
report.csvSample = body.split('\n').slice(0, 4).join('\n');

// A manager: the people they manage, no CSV, no settings.
await page.goto(base + '/dev/login');
const managerName = (await page.locator('li', { hasText: '· manager' }).first().locator('span').first().textContent()).split('·')[0].trim();
await signInAs(page, managerName);
for (const width of [1440, 768, 375]) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(base + '/app/payout');
  await page.waitForLoadState('networkidle');
  if (width === 1440) {
    check('manager sees the table', (await page.locator('tbody tr').count()) >= 1);
    check('manager gets no CSV link or settings', (await page.getByRole('link', { name: 'Download CSV' }).count()) === 0 && (await page.getByRole('heading', { name: 'Who sees money' }).count()) === 0);
    const r = await page.request.get(base + '/api/reports/payout?type=vacation');
    check('CSV refused for a manager', r.status() === 403, String(r.status()));
    await noRate(page, '/app/payout (manager)');
  }
  await axe(page, `payout-manager@${width}`);
  await page.screenshot({ path: `${outDir}/payout-manager-${width}.png`, fullPage: true });
}

// The employee: their own estimate in money (opt-in on), on the balance screen and the staff app.
await signInAs(page, 'Sam Rivera');
for (const width of [1440, 768, 375]) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(base + '/app');
  await page.waitForLoadState('networkidle');
  if (width === 1440) {
    check('employee sees "If you left today"', await page.getByText(/If you left today: about/).first().isVisible());
    check('employee sees their own amount', /≈ \$\d/.test(await page.getByText(/If you left today/).first().textContent()));
    check('employee sees the policy sentence', (await page.getByText(/Policy: At separation: unused balance is paid/).count()) >= 1);
    await noRate(page, '/app (employee)');
  }
  await axe(page, `payout-employee-app@${width}`);
  await page.screenshot({ path: `${outDir}/payout-employee-app-${width}.png`, fullPage: true });
  const lines = page.getByText(/If you left today/).first().locator('xpath=ancestor::div[1]');
  await lines.getByRole('button', { name: /Source:/ }).first().click();
  await axe(page, `payout-employee-source-open@${width}`);
  await lines.screenshot({ path: `${outDir}/payout-employee-lines-${width}.png` });

  await page.goto(base + '/m/leave');
  await page.waitForLoadState('networkidle');
  if (width === 375) check('staff app shows payout', await page.getByText(/If you left today/).first().isVisible());
  await axe(page, `payout-employee-mobile@${width}`);
  await page.screenshot({ path: `${outDir}/payout-employee-mobile-${width}.png`, fullPage: true });
}
await page.goto(base + '/app/payout');
check('employee is sent away from /app/payout', new URL(page.url()).pathname === '/app', page.url());
const r = await page.request.get(base + '/api/reports/payout?type=vacation');
check('CSV refused for an employee', r.status() === 403, String(r.status()));

check('no page errors', errors.length === 0, errors.join('; '));
await ctx.close();
writeFileSync(`${outDir}/payout-axe.json`, JSON.stringify(report, null, 2));
console.log(fail.length ? `FAILED:\n${fail.join('\n')}` : `gapless payout: ${report.checks.length} checks passed, axe clean on ${Object.keys(report.axe).length} states`);
await browser.close();
if (fail.length) process.exit(1);
