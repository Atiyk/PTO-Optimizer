// Phase 8 screens (node e2e/phase8.mjs <baseUrl> <shotsDir>): landing, the public demo before and
// after reading the sample handbook, and the planner (its heatmap moved into a shared component).
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

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
const report = {};

await shoot('landing', '/');
let t = Date.now();
await page.goto(`${base}/demo`);
report.demoFirstLoadMs = Date.now() - t; // includes seeding the sample org on a fresh database
await shoot('demo', null);
t = Date.now();
await page.getByRole('button', { name: 'Read this handbook' }).click();
await page.getByText('Questions for you').waitFor();
report.handbookReadMs = Date.now() - t;
report.handbookLabel = await page.locator('[aria-live="polite"] p').first().innerText();
await shoot('demo-handbook-read', null);

await page.goto(`${base}/dev/login`);
await page.locator('li').filter({ hasText: 'Jordan Patel' }).getByRole('button', { name: 'Sign in' }).click();
await page.waitForURL(/\/app/);
await shoot('planner', '/app/planner');

writeFileSync(`${shots}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
await browser.close();
