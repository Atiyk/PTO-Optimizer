// Phase 7 screens (node e2e/phase7.mjs <baseUrl> <shotsDir>), after walkthrough.mjs, with the server
// started with SLACK_CLIENT_ID and SLACK_SIGNING_SECRET set (dummy values are fine: nothing calls Slack).
import { chromium } from 'playwright';
import { createHmac } from 'node:crypto';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:3100';
const shots = process.argv[3] ?? 'shots';
mkdirSync(shots, { recursive: true });
const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const shoot = async (name, url, clip) => {
  if (url) await page.goto(base + url);
  for (const w of [1440, 768, 375]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${shots}/${name}-${w}.png`, fullPage: !clip});
  }
  await page.setViewportSize({ width: 1440, height: 900 });
};
const signInAs = async (name) => {
  await page.goto(`${base}/dev/login`);
  await page.locator('li').filter({ hasText: name }).getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/app/);
};
await signInAs('Olivia Owner');
await page.goto(`${base}/app/admin/agents`);
await page.getByText('Add to Slack').waitFor();
await shoot('admin-slack', null, true);
await signInAs('Tom Becker');
await page.goto(`${base}/app/agents`);
await page.getByRole('heading', { name: 'Slack status' }).waitFor();
await shoot('my-agents-slack', null, true);

// Smoke test of the live routes with a signed request (Slack's URL check) and a forged one.
const secret = process.env.SLACK_SIGNING_SECRET;
const body = JSON.stringify({ type: 'url_verification', challenge: 'smoke-challenge' });
const ts = Math.floor(Date.now() / 1000);
const sig = `v0=${createHmac('sha256', secret).update(`v0:${ts}:${body}`).digest('hex')}`;
const ok = await fetch(`${base}/api/slack/events`, { method: 'POST', body, headers: { 'content-type': 'application/json', 'x-slack-request-timestamp': String(ts), 'x-slack-signature': sig } });
const bad = await fetch(`${base}/api/slack/events`, { method: 'POST', body, headers: { 'content-type': 'application/json', 'x-slack-request-timestamp': String(ts), 'x-slack-signature': 'v0=forged' } });
const form = 'team_id=T0UNKNOWN&user_id=U1&text=who&response_url=https%3A%2F%2Fhooks.slack.com%2Fcommands%2Fx';
const csig = `v0=${createHmac('sha256', secret).update(`v0:${ts}:${form}`).digest('hex')}`;
const t0 = performance.now();
const cmd = await fetch(`${base}/api/slack/commands`, { method: 'POST', body: form, headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-slack-request-timestamp': String(ts), 'x-slack-signature': csig } });
const ackMs = Math.round(performance.now() - t0);
console.log(JSON.stringify({ urlCheck: [ok.status, await ok.json()], forged: bad.status, command: [cmd.status, await cmd.json(), `${ackMs} ms`] }, null, 2));
await browser.close();
