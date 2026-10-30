// Phase 4 screens (node e2e/phase4.mjs <baseUrl> <shotsDir>), after walkthrough.mjs on the same server.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

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

await signInAs('Olivia Owner');
await page.goto(`${base}/app/planner`);
await page.getByLabel('Team').selectOption({ label: 'Engineering' });
await page.waitForURL(/team=/);
await page.getByText('Saved by this plan').waitFor();
const url = page.url();
await shoot('planner');
// Same link, same plan (URL round-trip).
await page.goto(url);
await page.getByText('Saved by this plan').waitFor();
await page.getByRole('button', { name: 'Send to the team' }).click();
await page.getByRole('button', { name: 'Yes' }).click();
await page.getByText(/^Sent\./).waitFor();

await signInAs('Lena Fischer');
await page.getByText('Suggested by your manager').waitFor();
await shoot('member-proposal');
await page.getByRole('button', { name: 'Accept' }).click();
await page.getByText('Suggested by your manager').waitFor({ state: 'detached' });
await shoot('member-after-accept');
console.log('phase4 screens ok', url.replace(base, ''));
await browser.close();
