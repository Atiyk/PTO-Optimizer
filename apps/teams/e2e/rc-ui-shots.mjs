// Screens for the regulated-coverage UI pass (node e2e/rc-ui-shots.mjs <baseUrl> <shotsDir>), against a
// production build with DEV_LOGIN=1: landing, coverage, find cover, forecast (1440/768/375) and the
// staff app (375, plus 768), sign-in, app home, and the try-the-demo flow. Fails on a page error or a horizontal overflow.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:3100';
const out = process.argv[3] ?? 'shots';
mkdirSync(out, { recursive: true });
const W = [1440, 768, 375];
const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
const errors = [];
const shoot = async (p, name, widths = W) => {
  for (const w of widths) {
    await p.setViewportSize({ width: w, height: w === 375 ? 812 : 900 });
    await p.reload({ waitUntil: 'networkidle' });
    await p.screenshot({ path: `${out}/${name}-${w}.png`, fullPage: true });
    const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (over > 0) errors.push(`${name}-${w} overflows by ${over}px`);
  }
  await p.setViewportSize({ width: 1440, height: 900 });
};
const nextMonday = () => {
  const d = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7 - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`desk: ${e.message}`));
await page.goto(base, { waitUntil: 'networkidle' });
await shoot(page, 'landing');
await page.goto(`${base}/signin`, { waitUntil: 'networkidle' });
await shoot(page, 'signin');
await page.goto(`${base}/dev/login`);
await page.getByRole('button', { name: /childcare centre/ }).click();
await page.waitForURL(/\/app\/coverage/, { timeout: 120000 });
const monday = nextMonday();
await page.goto(`${base}/app/coverage?date=${monday}&day=${monday}`, { waitUntil: 'networkidle' });
await shoot(page, 'coverage');
await page.getByRole('link', { name: /Find cover/ }).first().click();
await page.waitForURL(/coverage\/cover/);
await shoot(page, 'find-cover');
await page.goto(`${base}/app/coverage/forecast`, { waitUntil: 'networkidle' });
await shoot(page, 'forecast');
await page.goto(`${base}/app`, { waitUntil: 'networkidle' });
await shoot(page, 'app-home');

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
await m.screenshot({ path: `${out}/staff-today-375.png`, fullPage: true });
let taps = 0;
await (taps++, m.getByRole('button', { name: /can.t come in/i }).first().tap());
await m.screenshot({ path: `${out}/staff-calloff-confirm-375.png`, fullPage: true });
await (taps++, m.getByRole('button', { name: /tell my manager/i }).first().tap());
await m.getByText(/manager knows/i).first().waitFor();
await m.screenshot({ path: `${out}/staff-calloff-done-375.png`, fullPage: true });
if (taps !== 2) errors.push(`call-off took ${taps} taps`);
await m.goto(`${base}/m/offers`, { waitUntil: 'networkidle' });
await m.screenshot({ path: `${out}/staff-offers-375.png`, fullPage: true });

// "Try the demo": one click from /try lands a visitor in their own copy, signed in, no Slack.
if (process.env.SHOT_TRY !== '0') {
  const v = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  v.on('pageerror', (e) => errors.push(`visitor: ${e.message}`));
  await v.goto(`${base}/try`, { waitUntil: 'networkidle' });
  await shoot(v, 'try');
  await v.getByRole('button', { name: 'Open as the director' }).click();
  await v.waitForURL(/\/app\/coverage/, { timeout: 120000 });
  await shoot(v, 'demo-coverage');
  await v.goto(`${base}/status`, { waitUntil: 'networkidle' });
  await shoot(v, 'status');
}

console.log(JSON.stringify({ taps, errors }));
await browser.close();
if (errors.length) process.exit(1);
