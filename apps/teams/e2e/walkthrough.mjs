// End-to-end walkthrough against a running build (node e2e/walkthrough.mjs <baseUrl> <shotsDir>).
// Signs up a new owner, imports 12 people from the Timetastic sample, adds a coverage rule,
// then exercises employee, manager and calendar screens. Counts clicks and takes screenshots
// at 1440/768/375. Uses the dev login (DEV_LOGIN=1) in place of Slack.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:3100';
const shots = process.argv[3] ?? 'shots';
mkdirSync(shots, { recursive: true });
const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
let clicks = 0;
const click = async (locator) => {
  clicks++;
  await locator.click();
};
const shoot = async (name, url) => {
  if (url) await page.goto(base + url);
  for (const w of [1440, 768, 375]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${shots}/${name}-${w}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
};

const t0 = Date.now();
// A1: owner signs up and is set up.
await page.goto(`${base}/signin`);
await shoot('signin');
await click(page.getByRole('link', { name: /Dev login/ }));
await page.getByLabel('Your name').fill('Olivia Owner');
await click(page.getByRole('button', { name: 'Continue as new person' }));
await page.getByLabel('Company or team name').fill('Brightside Studio');
await page.getByLabel('Country', { exact: true }).selectOption('GB');
await shoot('onboarding');
await click(page.getByRole('button', { name: 'Create workspace' }));
await page.waitForURL(/\/app\/admin/);
await click(page.getByRole('link', { name: 'Import' }));
await click(page.getByRole('button', { name: /Timetastic users/ }));
await page.getByText('12 rows · no problems').waitFor();
await shoot('import-preview');
await click(page.getByRole('button', { name: 'Import 12 rows' }));
await page.getByText('Imported 12 rows.').waitFor();
await click(page.getByRole('link', { name: 'Setup' }));
await page.getByRole('button', { name: 'Add coverage rule' }).waitFor();
const ruleForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Add coverage rule' }) });
await ruleForm.getByLabel('Team').selectOption({ label: 'Engineering' });
await ruleForm.getByLabel('Only count people tagged (optional)').fill('');
await click(ruleForm.getByRole('button', { name: 'Add coverage rule' }));
await page.getByText(/Engineering: at least 2 people in/).waitFor();
const setupMs = Date.now() - t0;
const setupClicks = clicks;
await shoot('admin-setup');
await shoot('admin-people', '/app/admin');

// Employee: Tom Becker requests leave over Christmas (GB holidays not deducted).
await page.goto(`${base}/dev/login`);
await page.locator('li').filter({ hasText: 'Tom Becker' }).getByRole('button', { name: 'Sign in' }).click();
await page.waitForURL(/\/app$/);
await page.getByLabel('First day').fill('2026-12-21');
await page.getByLabel('Last day').fill('2026-12-29');
await page.getByText(/Uses/).first().waitFor();
await shoot('employee-request');
const draftText = await page.locator('[aria-live="polite"]').innerText();
await page.getByRole('button', { name: 'Request' }).click();
await page.getByText('Sent to your manager for approval.').waitFor();

// Manager: Priya approves.
await page.goto(`${base}/dev/login`);
await page.locator('li').filter({ hasText: 'Priya Shah' }).getByRole('button', { name: 'Sign in' }).click();
await page.waitForURL(/\/app$/);
await page.goto(`${base}/app/approvals`);
await page.getByText('Tom Becker').first().waitFor();
await shoot('manager-approvals');
await page.getByRole('button', { name: 'Approve' }).first().click();
await page.getByText('Nothing to decide right now.').waitFor();
await shoot('calendar', '/app/calendar?from=2026-12-14');

console.log(JSON.stringify({ setupClicks, setupSeconds: Math.round(setupMs / 100) / 10, draftText }, null, 2));
await browser.close();
