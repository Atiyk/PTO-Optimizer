// Phase 3 screens (node e2e/phase3.mjs <baseUrl> <shotsDir>), run right after walkthrough.mjs
// against the same server, started with AI_MOCK=1 so the AI paths run without API calls.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:3100';
const shots = process.argv[3] ?? 'shots';
mkdirSync(shots, { recursive: true });
const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const shoot = async (name, url) => {
  if (url) await page.goto(base + url);
  for (const w of [1440, 768, 375]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${shots}/${name}-${w}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
};
const signInAs = async (name) => {
  await page.goto(`${base}/dev/login`);
  await page.locator('li').filter({ hasText: name }).getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/app/);
};

// Owner: vacation may be auto-approved up to 2 days; level 2 (undoable).
await signInAs('Olivia Owner');
await page.goto(`${base}/app/admin/setup`);
const lt = page.locator('form').filter({ has: page.getByRole('button', { name: 'Add or update leave type' }) });
await lt.getByLabel('Key (lowercase)').fill('vacation');
await lt.getByLabel('Name').fill('Vacation');
await lt.getByLabel('Uses a balance').check();
await lt.getByLabel('Can be auto-approved (see Auto-approval)').check();
await lt.getByLabel('Auto-approve up to (days or hours)').fill('2');
await lt.getByRole('button', { name: 'Add or update leave type' }).click();
await page.getByText('auto-approve ≤ 2').waitFor();
const aa = page.locator('form').filter({ has: page.getByRole('button', { name: 'Save auto-approval' }) });
await aa.getByLabel('Level').selectOption('2');
await aa.getByRole('button', { name: 'Save auto-approval' }).click();
await page.getByText('Act, reversible').waitFor();
await page.getByRole('heading', { name: 'Auto-approval' }).scrollIntoViewIfNeeded();
await shoot('admin-setup-autoapproval');

// Owner: handbook import.
await page.goto(`${base}/app/admin/handbook`);
await page.getByLabel(/Paste your handbook/).fill(readFileSync(new URL('../evals/handbooks/02-brightside-uk.md', import.meta.url), 'utf8'));
await page.getByRole('button', { name: 'Read handbook' }).click();
await page.getByText('Questions for you').or(page.getByRole('button', { name: 'Save as policy' })).first().waitFor();
await shoot('admin-handbook');

// Employee: one sentence fills the form; the 0.5-day request is auto-approved.
await signInAs('Tom Becker');
await page.getByLabel(/Say it in your own words/).fill('Friday Nov 6 afternoon off');
await page.getByRole('button', { name: 'Fill in' }).click();
await page.getByText('Filled in below.').waitFor();
await page.getByText(/^Uses/).first().waitFor();
await shoot('employee-nl-request');
await page.getByRole('button', { name: 'Request' }).click();
await page.getByText(/Booked\./).waitFor();
await page.getByRole('button', { name: 'Why this number?' }).first().click();
await page.getByText(/^You have /).first().waitFor();
await shoot('employee-explain');

// Manager sees the auto-approval with an Undo button.
await signInAs('Priya Shah');
await page.goto(`${base}/app/approvals`);
await page.getByText(/Auto-approved, can still be undone/).waitFor();
await shoot('manager-approvals-auto');

// Owner: AI usage.
await signInAs('Olivia Owner');
await shoot('admin-ai-usage', '/app/admin/ai');
console.log('phase3 screens ok');
await browser.close();
