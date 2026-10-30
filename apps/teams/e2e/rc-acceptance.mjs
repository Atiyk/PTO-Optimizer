// Regulated-coverage acceptance screenshots (node e2e/rc-acceptance.mjs <baseUrl> <shotsDir>), against a
// running build with DEV_LOGIN=1. Walks the seeded California centre and the dental clinic through
// RC2 (gap on the grid, cited), RC3 (ranked cover with reasons), RC5 (two-tap call-off at 375 px and
// the manager's ranked request), RC7 (rules drafted from pasted text), RC8 (credential alerts and the
// forecast) and RC12 (the clinic). Fails on a page error or a horizontal overflow.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:3100';
const out = process.argv[3] ?? 'shots';
mkdirSync(out, { recursive: true });
const W = [1440, 768, 375];
const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
const errors = [];
const watch = (p, tag) => p.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
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

// --- The California centre ---
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
watch(page, 'centre');
await page.goto(`${base}/dev/login`);
await page.getByRole('button', { name: /childcare centre/ }).click();
await page.waitForURL(/\/app\/coverage/, { timeout: 120000 });
const monday = nextMonday();

// RC2: the approved leave's toddler gap on the grid, with its citation.
await page.goto(`${base}/app/coverage?date=${monday}&day=${monday}`, { waitUntil: 'networkidle' });
await page.getByText(/1596\.955|101416\.5|101216\.3/).first().waitFor();
await shoot(page, 'rc2-coverage-gap');

// RC3: ranked cover, every exclusion with its reason.
await page.getByRole('link', { name: 'Find cover' }).first().click();
await page.waitForURL(/coverage\/cover/);
await shoot(page, 'rc3-find-cover');

// RC7: rules drafted from pasted text (built-in reader when AI is off), never saved until an admin does.
await page.goto(`${base}/demo/coverage`, { waitUntil: 'networkidle', timeout: 120000 });
await page.getByRole('button', { name: 'Read the rules' }).click();
await page.getByText(/Every kept rule quotes/).waitFor({ timeout: 60000 });
for (const w of W) {
  await page.setViewportSize({ width: w, height: w === 375 ? 812 : 900 });
  await page.locator('section', { hasText: 'Every kept rule quotes' }).first().screenshot({ path: `${out}/rc7-rules-draft-${w}.png` });
}
await page.setViewportSize({ width: 1440, height: 900 });

// RC8: credential alerts and the forecast.
await page.goto(`${base}/app/admin/credentials`, { waitUntil: 'networkidle' });
await shoot(page, 'rc8-credential-alerts');
await page.goto(`${base}/app/coverage/forecast`, { waitUntil: 'networkidle' });
await shoot(page, 'rc8-forecast');

// RC5: a staff member calls off from the phone app in two taps.
await page.goto(`${base}/app/admin`, { waitUntil: 'networkidle' });
await page.getByLabel('Person').first().selectOption({ label: 'Ava Bennett' });
await page.getByRole('button', { name: 'Get a sign-in code' }).click();
const status = page.getByRole('status').filter({ hasText: 'Code for' });
await status.waitFor();
const code = (await status.locator('span.font-mono').textContent()).trim();
const phone = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
const m = await phone.newPage();
watch(m, 'phone');
await m.goto(`${base}/m/signin`, { waitUntil: 'networkidle' });
await m.getByLabel(/Sign-in code/).fill(code);
await m.getByRole('button', { name: 'Sign in with code' }).click();
await m.waitForURL(/\/m$/);
let taps = 0;
const tap = async (l) => (taps++, l.tap());
await m.screenshot({ path: `${out}/rc5-m-today-375.png`, fullPage: true });
await tap(m.getByRole('button', { name: /can’t come in/ }).first());
await m.screenshot({ path: `${out}/rc5-m-calloff-confirm-375.png`, fullPage: true });
await tap(m.getByRole('button', { name: 'Yes, tell my manager' }));
await m.getByText('Your manager knows').waitFor();
await m.screenshot({ path: `${out}/rc5-m-calloff-done-375.png`, fullPage: true });
if (taps !== 2) errors.push(`call-off took ${taps} taps`);
if (await m.getByLabel(/reason|why/i).count()) errors.push('the call-off asks for a reason');
await page.goto(`${base}/app/coverage/cover`, { waitUntil: 'networkidle' });
await shoot(page, 'rc5-manager-cover-requests');

// --- The dental clinic (RC12) ---
const clinic = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
watch(clinic, 'clinic');
await clinic.goto(`${base}/dev/login`);
await clinic.getByRole('button', { name: /dental clinic/ }).click();
await clinic.waitForURL(/\/app\//, { timeout: 120000 });
const tue = new Date(`${monday}T00:00:00Z`);
tue.setUTCDate(tue.getUTCDate() + 1);
const tuesday = tue.toISOString().slice(0, 10);
await clinic.goto(`${base}/app/coverage?date=${monday}&day=${tuesday}`, { waitUntil: 'networkidle' });
await shoot(clinic, 'rc12-clinic-coverage');
await clinic.getByRole('link', { name: 'Find cover' }).first().click();
await clinic.waitForURL(/coverage\/cover/);
await shoot(clinic, 'rc12-clinic-find-cover');

console.log(JSON.stringify({ callOffTaps: taps, errors }));
await browser.close();
if (errors.length) process.exit(1);
