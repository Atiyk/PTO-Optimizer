// Phase 5 screens (node e2e/phase5.mjs <baseUrl> <shotsDir>), after walkthrough.mjs on the same server.
// Owner adds a webhook and an API key; an employee creates a personal token, an "agent" uses it over
// REST, and the person confirms the drafted request on their home page.
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

// Owner: a webhook (unreachable from the sandbox, so the log shows retries) and an API key.
await signInAs('Olivia Owner');
await page.goto(`${base}/app/admin/agents`);
await page.getByLabel('Endpoint URL').fill('https://hooks.example.com/days-off');
await page.getByRole('button', { name: 'Add webhook' }).click();
await page.getByText('Signing secret').waitFor();
const keyForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Create API key' }) });
await keyForm.getByLabel('Name').fill('Copilot Studio HR agent');
await keyForm.getByRole('button', { name: 'Create API key' }).click();
await keyForm.getByText('Copy this now').waitFor();

// Employee: personal token, then an agent drafts a request with it.
await signInAs('Tom Becker');
await page.goto(`${base}/app/agents`);
await page.getByLabel('Name').fill('Claude Code on my laptop');
await page.getByRole('button', { name: 'Create personal token' }).click();
const token = await page.getByLabel('Personal token').inputValue();
await shoot('my-agents');
const res = await fetch(`${base}/api/v1/actions/submitLeaveRequest`, {
  method: 'POST',
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ start: '2027-02-15', end: '2027-02-16', idempotencyKey: 'e2e-agent-1' }),
});
const drafted = await res.json();
if (res.status !== 202) throw new Error(`expected 202, got ${res.status} ${JSON.stringify(drafted)}`);
await page.goto(`${base}/app#agent-requests`);
await page.getByText('Requests from your agents').waitFor();
await shoot('agent-request');
await page.locator('#agent-requests').getByRole('button', { name: 'Confirm' }).click();
await page.getByText('Requests from your agents').waitFor({ state: 'detached' });

// Owner again: tokens, autonomy, webhook health and the delivery log.
await signInAs('Olivia Owner');
await page.waitForTimeout(1500); // let the after-response delivery attempt finish
await shoot('admin-agents', '/app/admin/agents');
await shoot('docs-agents', '/docs/agents');
const llms = await (await fetch(`${base}/llms.txt`)).text();
console.log(JSON.stringify({ drafted: drafted.confirmation?.summary, llmsLines: llms.split('\n').length }, null, 2));
await browser.close();
