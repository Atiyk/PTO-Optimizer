// Smoke test for a deploy with no database yet (node e2e/demo-only-smoke.mjs, against 'next start' with no
// DATABASE_URL, SESSION_SECRET or ALLOW_PGLITE): the demo works end to end and real sign-up is off.
import { chromium } from 'playwright';
const base = process.argv[2] ?? 'http://localhost:3100';
const b = await chromium.launch({ ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}) });
const p = await (await b.newContext()).newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(base + '/try');
await p.getByRole('button', { name: 'Open as the director' }).click();
await p.waitForURL(/\/app\/coverage/, { timeout: 120000 });
console.log('director', p.url(), await p.getByRole('heading', { level: 1 }).first().textContent());
await p.goto(base + '/app/planner'); console.log('planner', p.url());
await p.goto(base + '/signin'); console.log('signin', await p.getByText(/runs the demo only/).textContent(), 'slack button:', await p.getByRole('link', { name: 'Sign in with Slack' }).count());
const q = await (await b.newContext({ viewport: { width: 375, height: 812 } })).newPage();
await q.goto(base + '/try');
await q.getByRole('button', { name: 'Open the staff app' }).click();
await q.waitForURL(/\/m$/, { timeout: 120000 }); console.log('staff', q.url());
await q.goto(base + '/demo'); console.log('demo h1', await q.getByRole('heading', { level: 1 }).first().textContent());
console.log('errors', errs);
await b.close();
if (errs.length) process.exit(1);
